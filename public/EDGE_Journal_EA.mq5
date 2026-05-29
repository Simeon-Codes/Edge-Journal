//+------------------------------------------------------------------+
//|                                          EDGE_Journal_EA.mq5    |
//|                              EDGE Trading Journal MT5 Connector  |
//|                                                                  |
//| SETUP INSTRUCTIONS:                                              |
//|  1. Copy this file to: MT5_Data_Folder/MQL5/Experts/            |
//|  2. Compile in MetaEditor (F7)                                   |
//|  3. Attach to any chart (e.g. EURUSD H1)                        |
//|  4. Enter your Server URL and API Key from the EDGE app          |
//|  5. Allow WebRequest for your server URL in MT5 Tools > Options  |
//|     > Expert Advisors > Allow WebRequest for listed URL          |
//|  6. Enable "Allow algo trading" in MT5                           |
//+------------------------------------------------------------------+

#property copyright "EDGE Trading Journal"
#property version   "1.00"
#property strict

// ── Input Parameters ──────────────────────────────────────────────────────────
input string   ServerURL       = "https://your-pocketbase.railway.app"; // Your PocketBase server URL
input string   ApiKey          = "";                                      // API Key from EDGE app > MT5 Settings
input bool     SyncOnAttach    = true;                                    // Import all historical trades on first run
input bool     AutoSync        = true;                                    // Stream new trades automatically
input int      HeartbeatSec    = 30;                                      // Heartbeat interval in seconds
input bool     SyncOpenTrades  = true;                                    // Include open (unrealised) trades
input bool     VerboseLogging  = false;                                   // Show detailed logs

// ── Global State ──────────────────────────────────────────────────────────────
datetime lastHeartbeat   = 0;
datetime lastOrderCheck  = 0;
bool     initialSyncDone = false;
int      syncedTickets[];

//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit() {
   if(ApiKey == "") {
      Alert("EDGE Journal EA: API Key is empty. Please enter your API Key from the EDGE app.");
      return INIT_FAILED;
   }

   if(StringFind(ServerURL, "https://") == -1 && StringFind(ServerURL, "http://") == -1) {
      Alert("EDGE Journal EA: Server URL must start with https:// or http://");
      return INIT_FAILED;
   }

   Print("EDGE Journal EA: Initialised. Server: ", ServerURL);

   // Perform initial historical sync if enabled
   if(SyncOnAttach && !initialSyncDone) {
      int result = MessageBox(
         "EDGE Journal: Do you want to import ALL historical trades from this account?\n\n" +
         "This will send your trade history to the EDGE Journal server.\n" +
         "Server: " + ServerURL + "\n\n" +
         "Click YES to import, NO to skip.",
         "EDGE Journal — Import Trade History",
         MB_YESNO | MB_ICONQUESTION
      );
      if(result == IDYES) {
         PerformFullSync();
      } else {
         Print("EDGE Journal EA: Historical import skipped by user.");
         initialSyncDone = true;
      }
   }

   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason) {
   Print("EDGE Journal EA: Detached. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function                                              |
//+------------------------------------------------------------------+
void OnTick() {
   datetime now = TimeCurrent();

   // Send heartbeat
   if(now - lastHeartbeat >= HeartbeatSec) {
      SendHeartbeat();
      lastHeartbeat = now;
   }

   // Check for new/modified/closed trades every 5 seconds
   if(AutoSync && now - lastOrderCheck >= 5) {
      CheckForTradeChanges();
      lastOrderCheck = now;
   }
}

//+------------------------------------------------------------------+
//| Full historical sync                                              |
//+------------------------------------------------------------------+
void PerformFullSync() {
   Print("EDGE Journal EA: Starting full historical sync...");

   // Build JSON array of all history
   string tradesJson = "[";
   bool first = true;
   int total = 0;

   // Select full history
   if(!HistorySelect(0, TimeCurrent())) {
      Print("EDGE Journal EA: Failed to select history");
      return;
   }

   int historyTotal = HistoryDealsTotal();
   for(int i = 0; i < historyTotal; i++) {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      long dealType = HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;

      long entryType = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entryType != DEAL_ENTRY_IN && entryType != DEAL_ENTRY_OUT) continue;

      double profit  = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      double lots    = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double price   = HistoryDealGetDouble(ticket, DEAL_PRICE);
      double sl      = HistoryDealGetDouble(ticket, DEAL_SL);
      double tp      = HistoryDealGetDouble(ticket, DEAL_TP);
      double comm    = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      double swap    = HistoryDealGetDouble(ticket, DEAL_SWAP);
      string symbol  = HistoryDealGetString(ticket, DEAL_SYMBOL);
      datetime openT = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

      if(!first) tradesJson += ",";
      tradesJson += "{";
      tradesJson += "\"ticket\":" + IntegerToString((long)ticket) + ",";
      tradesJson += "\"type\":" + IntegerToString((int)(dealType == DEAL_TYPE_BUY ? 0 : 1)) + ",";
      tradesJson += "\"symbol\":\"" + EscapeJson(symbol) + "\",";
      tradesJson += "\"lots\":" + DoubleToString(lots, 2) + ",";
      tradesJson += "\"open_price\":" + DoubleToString(price, 5) + ",";
      tradesJson += "\"sl\":" + DoubleToString(sl, 5) + ",";
      tradesJson += "\"tp\":" + DoubleToString(tp, 5) + ",";
      tradesJson += "\"profit\":" + DoubleToString(profit, 2) + ",";
      tradesJson += "\"commission\":" + DoubleToString(comm, 2) + ",";
      tradesJson += "\"swap\":" + DoubleToString(swap, 2) + ",";
      tradesJson += "\"open_time\":\"" + TimeToString(openT, TIME_DATE|TIME_SECONDS) + "\"";
      tradesJson += "}";

      first = false;
      total++;
   }
   tradesJson += "]";

   // Also include open positions
   if(SyncOpenTrades) {
      for(int i = 0; i < PositionsTotal(); i++) {
         ulong ticket = PositionGetTicket(i);
         if(ticket == 0) continue;

         long posType   = PositionGetInteger(POSITION_TYPE);
         double lots    = PositionGetDouble(POSITION_VOLUME);
         double entry   = PositionGetDouble(POSITION_PRICE_OPEN);
         double sl      = PositionGetDouble(POSITION_SL);
         double tp      = PositionGetDouble(POSITION_TP);
         double profit  = PositionGetDouble(POSITION_PROFIT);
         string symbol  = PositionGetString(POSITION_SYMBOL);
         datetime openT = (datetime)PositionGetInteger(POSITION_TIME);
      }
   }

   string body = "{\"event\":\"full_sync\",\"trades\":" + tradesJson + "}";

   int responseCode = PostToServer("/api/mt5/sync", body);
   if(responseCode == 200) {
      Print("EDGE Journal EA: Full sync complete. ", total, " trades sent.");
      initialSyncDone = true;
   } else {
      Print("EDGE Journal EA: Sync failed. Response code: ", responseCode);
   }
}

//+------------------------------------------------------------------+
//| Check for new/changed trades                                      |
//+------------------------------------------------------------------+
void CheckForTradeChanges() {
   if(!HistorySelect(lastOrderCheck - 60, TimeCurrent())) return;

   int histTotal = HistoryDealsTotal();
   for(int i = MathMax(0, histTotal - 20); i < histTotal; i++) {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      if(IsTicketSynced((long)ticket)) continue;

      long dealType  = HistoryDealGetInteger(ticket, DEAL_TYPE);
      long entryType = HistoryDealGetInteger(ticket, DEAL_ENTRY);

      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;

      string symbol  = EscapeJson(HistoryDealGetString(ticket, DEAL_SYMBOL));
      double lots    = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double price   = HistoryDealGetDouble(ticket, DEAL_PRICE);
      double profit  = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      double comm    = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      double swap    = HistoryDealGetDouble(ticket, DEAL_SWAP);
      double sl      = HistoryDealGetDouble(ticket, DEAL_SL);
      double tp      = HistoryDealGetDouble(ticket, DEAL_TP);
      datetime openT = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

      string closeTime = "";
      bool isClose = (entryType == DEAL_ENTRY_OUT);
      if(isClose) closeTime = TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS);

      string eventType = isClose ? "trade_close" : "trade_open";

      string body = "{\"event\":\"" + eventType + "\",\"trade\":{";
      body += "\"ticket\":" + IntegerToString((long)ticket) + ",";
      body += "\"type\":" + IntegerToString((int)(dealType == DEAL_TYPE_BUY ? 0 : 1)) + ",";
      body += "\"symbol\":\"" + symbol + "\",";
      body += "\"lots\":" + DoubleToString(lots, 2) + ",";
      body += "\"open_price\":" + DoubleToString(price, 5) + ",";
      body += "\"close_price\":" + DoubleToString(price, 5) + ",";
      body += "\"sl\":" + DoubleToString(sl, 5) + ",";
      body += "\"tp\":" + DoubleToString(tp, 5) + ",";
      body += "\"profit\":" + DoubleToString(profit, 2) + ",";
      body += "\"commission\":" + DoubleToString(comm, 2) + ",";
      body += "\"swap\":" + DoubleToString(swap, 2) + ",";
      body += "\"open_time\":\"" + TimeToString(openT, TIME_DATE|TIME_SECONDS) + "\"";
      if(isClose) body += ",\"close_time\":\"" + closeTime + "\"";
      body += "}}";

      int code = PostToServer("/api/mt5/sync", body);
      if(code == 200) {
         MarkTicketSynced((long)ticket);
         if(VerboseLogging) Print("EDGE Journal EA: Synced ticket ", ticket, " (", eventType, ")");
      }
   }
}

//+------------------------------------------------------------------+
//| Send heartbeat                                                    |
//+------------------------------------------------------------------+
void SendHeartbeat() {
   // Update MT5 account balance/equity
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   string body = "{\"event\":\"heartbeat\",\"balance\":" + DoubleToString(balance, 2) +
                 ",\"equity\":" + DoubleToString(equity, 2) + "}";
   PostToServer("/api/mt5/sync", body);
}

//+------------------------------------------------------------------+
//| HTTP POST helper                                                  |
//+------------------------------------------------------------------+
int PostToServer(string endpoint, string body) {
   string url = ServerURL + endpoint;
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + ApiKey + "\r\n";
   char   post[], result[];
   string resultHeaders;

   StringToCharArray(body, post, 0, StringLen(body));
   ArrayResize(post, ArraySize(post) - 1); // Remove null terminator

   int timeout = 10000; // 10 seconds
   int responseCode = WebRequest("POST", url, headers, timeout, post, result, resultHeaders);

   if(VerboseLogging && responseCode != 200) {
      Print("EDGE Journal EA: HTTP ", responseCode, " for ", endpoint);
      if(ArraySize(result) > 0) Print("Response: ", CharArrayToString(result));
   }
   return responseCode;
}

//+------------------------------------------------------------------+
//| Track synced tickets                                              |
//+------------------------------------------------------------------+
bool IsTicketSynced(long ticket) {
   for(int i = 0; i < ArraySize(syncedTickets); i++) {
      if(syncedTickets[i] == (int)ticket) return true;
   }
   return false;
}

void MarkTicketSynced(long ticket) {
   int size = ArraySize(syncedTickets);
   ArrayResize(syncedTickets, size + 1);
   syncedTickets[size] = (int)ticket;
   // Keep array bounded
   if(size > 5000) {
      ArrayRemove(syncedTickets, 0, 1000);
   }
}

//+------------------------------------------------------------------+
//| JSON escape helper                                                |
//+------------------------------------------------------------------+
string EscapeJson(string s) {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", "\\n");
   StringReplace(s, "\r", "\\r");
   StringReplace(s, "\t", "\\t");
   return s;
}
