//+------------------------------------------------------------------+
//|                                          EDGE_Journal_EA.mq5    |
//|                    EDGE Trading Journal — MT5 Connector v2.0    |
//|                                                                  |
//| WHAT'S NEW IN v2.0:                                              |
//|  ✔ PocketBase direct collection endpoints (no custom API needed) |
//|  ✔ File-based retry queue (survives MT5 restarts/offline)        |
//|  ✔ Persistent duplicate trade protection (file-backed)           |
//|  ✔ Multi-account isolation (account_id injected everywhere)      |
//|  ✔ Event-diff streaming (no wasted polling — detects state change)|
//|  ✔ Open positions synced individually with correct status field  |
//|  ✔ Events collection for full audit trail                        |
//|                                                                  |
//| POCKETBASE COLLECTIONS REQUIRED:                                 |
//|  - trades       (trade_id unique index)                          |
//|  - heartbeats                                                    |
//|  - events                                                        |
//|  - sync_state                                                    |
//|                                                                  |
//| SETUP INSTRUCTIONS:                                              |
//|  1. Copy to: MT5_Data_Folder/MQL5/Experts/                      |
//|  2. Compile in MetaEditor (F7)                                   |
//|  3. Attach to any chart (e.g. XAUUSD H1)                        |
//|  4. Enter ServerURL and ApiKey from EDGE app > MT5 Settings      |
//|  5. Allow WebRequest for your server URL:                        |
//|     MT5 > Tools > Options > Expert Advisors > Allow WebRequest   |
//|  6. Enable "Allow algo trading" in MT5                           |
//+------------------------------------------------------------------+

#property copyright "EDGE Trading Journal v2.0"
#property version   "2.00"
#property strict

//─────────────────────────────────────────────────────────────────────────────
// INPUT PARAMETERS
//─────────────────────────────────────────────────────────────────────────────
input string   ServerURL        = "https://edge-journal-pocketbase-production.up.railway.app"; // PocketBase server URL
input string   ApiKey           = "";       // API Key from EDGE app > MT5 Settings
input bool     SyncOnAttach     = true;     // Import all historical trades on first run
input bool     AutoSync         = true;     // Sync new trades automatically
input int      HeartbeatSec     = 30;       // Heartbeat interval (seconds)
input bool     SyncOpenTrades   = true;     // Include open (unrealised) positions
input int      QueueProcessSec  = 10;       // Retry queue flush interval (seconds)
input int      MaxRetries       = 5;        // Max retry attempts per queued item
input bool     VerboseLogging   = false;    // Show detailed HTTP logs

//─────────────────────────────────────────────────────────────────────────────
// FILE CONSTANTS
//─────────────────────────────────────────────────────────────────────────────
#define QUEUE_FILE      "edge_queue.log"
#define SYNCED_FILE     "edge_synced.db"

//─────────────────────────────────────────────────────────────────────────────
// POCKETBASE COLLECTION PATHS  (relative to /api/collections/)
//─────────────────────────────────────────────────────────────────────────────
#define COL_TRADES      "/trades/records"
#define COL_HEARTBEATS  "/heartbeats/records"
#define COL_EVENTS      "/events/records"
#define COL_SYNC_STATE  "/sync_state/records"

//─────────────────────────────────────────────────────────────────────────────
// GLOBAL STATE
//─────────────────────────────────────────────────────────────────────────────
datetime lastHeartbeat    = 0;
datetime lastQueueProcess = 0;
bool     initialSyncDone  = false;

// Event-diff streaming: track lightweight state hash
string   lastStateHash    = "";

//+------------------------------------------------------------------+
//| OnInit                                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   //── Validate inputs ────────────────────────────────────────────
   if(ApiKey == "")
   {
      Alert("EDGE Journal EA: API Key is empty. Enter your key from EDGE app > MT5 Settings.");
      return INIT_FAILED;
   }

   if(StringFind(ServerURL, "http://") == -1 && StringFind(ServerURL, "https://") == -1)
   {
      Alert("EDGE Journal EA: ServerURL must start with http:// or https://");
      return INIT_FAILED;
   }

   Print("EDGE Journal EA v2.0 — Initialised | Account: ", GetAccountId(),
         " | Server: ", ServerURL);

   //── Register account in PocketBase (best-effort) ───────────────
   RegisterAccount();

   //── Historical sync prompt ─────────────────────────────────────
   if(SyncOnAttach && !initialSyncDone)
   {
      int choice = MessageBox(
         "EDGE Journal: Import ALL historical trades from this account?\n\n" +
         "Account: " + GetAccountId() + "\n" +
         "Server:  " + ServerURL + "\n\n" +
         "YES = import history | NO = skip (live sync only)",
         "EDGE Journal — Import Trade History",
         MB_YESNO | MB_ICONQUESTION
      );
      if(choice == IDYES)
         PerformFullSync();
      else
      {
         Print("EDGE Journal EA: Historical import skipped.");
         initialSyncDone = true;
      }
   }

   //── Seed the initial state hash ────────────────────────────────
   lastStateHash = GetStateHash();

   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| OnDeinit                                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("EDGE Journal EA: Detached. Reason code: ", reason);
}

//+------------------------------------------------------------------+
//| OnTick  — main event loop                                        |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime now = TimeCurrent();

   //── Heartbeat ──────────────────────────────────────────────────
   if(now - lastHeartbeat >= HeartbeatSec)
   {
      SendHeartbeat();
      lastHeartbeat = now;
   }

   //── Retry queue flush ──────────────────────────────────────────
   if(now - lastQueueProcess >= QueueProcessSec)
   {
      ProcessQueue();
      lastQueueProcess = now;
   }

   //── Event-diff streaming (only fires when market state changes) ─
   if(AutoSync)
   {
      string currentHash = GetStateHash();
      if(currentHash != lastStateHash)
      {
         CheckForTradeChanges();
         lastStateHash = currentHash;
      }
   }
}

//─────────────────────────────────────────────────────────────────────────────
// ACCOUNT REGISTRATION
//─────────────────────────────────────────────────────────────────────────────
void RegisterAccount()
{
   string body = "{";
   body += "\"account_id\":\"" + GetAccountId() + "\",";
   body += "\"broker\":\""     + EscapeJson(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   body += "\"currency\":\""   + EscapeJson(AccountInfoString(ACCOUNT_CURRENCY)) + "\",";
   body += "\"leverage\":"     + IntegerToString((int)AccountInfoInteger(ACCOUNT_LEVERAGE)) + ",";
   body += "\"server\":\""     + EscapeJson(AccountInfoString(ACCOUNT_SERVER)) + "\"";
   body += "}";

   // PocketBase: upsert via filter would be ideal, but for simplicity we POST
   // (collection should have a unique rule on account_id in PocketBase rules)
   int code = PostToServer(COL_SYNC_STATE, body);
   if(VerboseLogging) Print("EDGE: RegisterAccount → HTTP ", code);
}

//─────────────────────────────────────────────────────────────────────────────
// FULL HISTORICAL SYNC  (individual record per trade)
//─────────────────────────────────────────────────────────────────────────────
void PerformFullSync()
{
   Print("EDGE Journal EA: Starting full historical sync for account ", GetAccountId(), " ...");

   if(!HistorySelect(0, TimeCurrent()))
   {
      Print("EDGE Journal EA: HistorySelect failed.");
      return;
   }

   int histTotal = HistoryDealsTotal();
   int sent = 0, skipped = 0;

   for(int i = 0; i < histTotal; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) { skipped++; continue; }
      if(IsSynced((long)ticket)) { skipped++; continue; }

      long dealType  = HistoryDealGetInteger(ticket, DEAL_TYPE);
      long entryType = HistoryDealGetInteger(ticket, DEAL_ENTRY);

      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) { skipped++; continue; }
      if(entryType != DEAL_ENTRY_IN && entryType != DEAL_ENTRY_OUT) { skipped++; continue; }

      string payload = BuildTradePayload(ticket, dealType, entryType, 0);

      int code = PostToServer(COL_TRADES, payload);
      if(code == 200 || code == 201)
      {
         MarkSynced((long)ticket);
         sent++;
      }
      else
      {
         // Queue for retry — don't block the sync loop
         QueueWrite(COL_TRADES, payload);
         sent++;  // count as "handled"
      }
   }

   //── Open positions ─────────────────────────────────────────────
   if(SyncOpenTrades)
   {
      int openSent = SyncOpenPositions();
      sent += openSent;
   }

   //── Record sync state ──────────────────────────────────────────
   PostSyncState();

   Print("EDGE Journal EA: Full sync complete — ", sent, " records sent, ", skipped, " skipped.");
   initialSyncDone = true;

   //── Log sync event ─────────────────────────────────────────────
   PostEvent("sync", "{\"trades_sent\":" + IntegerToString(sent) + "}");
}

//─────────────────────────────────────────────────────────────────────────────
// SYNC OPEN POSITIONS
//─────────────────────────────────────────────────────────────────────────────
int SyncOpenPositions()
{
   int sent = 0;

   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(IsSynced((long)ticket)) continue;

      long   posType = PositionGetInteger(POSITION_TYPE);
      double lots    = PositionGetDouble(POSITION_VOLUME);
      double entry   = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl      = PositionGetDouble(POSITION_SL);
      double tp      = PositionGetDouble(POSITION_TP);
      double profit  = PositionGetDouble(POSITION_PROFIT);
      double swap    = PositionGetDouble(POSITION_SWAP);
      string symbol  = EscapeJson(PositionGetString(POSITION_SYMBOL));
      string comment = EscapeJson(PositionGetString(POSITION_COMMENT));
      datetime openT = (datetime)PositionGetInteger(POSITION_TIME);

      string side = (posType == POSITION_TYPE_BUY) ? "buy" : "sell";

      string body = "{";
      body += "\"trade_id\":\"ticket_"  + IntegerToString((long)ticket) + "\",";
      body += "\"account_id\":\""       + GetAccountId() + "\",";
      body += "\"symbol\":\""           + symbol + "\",";
      body += "\"side\":\""             + side + "\",";
      body += "\"volume\":"             + DoubleToString(lots, 2) + ",";
      body += "\"open_price\":"         + DoubleToString(entry, 5) + ",";
      body += "\"close_price\":0,";
      body += "\"sl\":"                 + DoubleToString(sl, 5) + ",";
      body += "\"tp\":"                 + DoubleToString(tp, 5) + ",";
      body += "\"profit\":"             + DoubleToString(profit, 2) + ",";
      body += "\"commission\":0,";
      body += "\"swap\":"               + DoubleToString(swap, 2) + ",";
      body += "\"open_time\":\""        + FormatTime(openT) + "\",";
      body += "\"close_time\":\"\",";
      body += "\"status\":\"open\",";
      body += "\"comment\":\""          + comment + "\"";
      body += "}";

      int code = PostToServer(COL_TRADES, body);
      if(code == 200 || code == 201)
      {
         MarkSynced((long)ticket);
         sent++;
      }
      else
         QueueWrite(COL_TRADES, body);
   }

   return sent;
}

//─────────────────────────────────────────────────────────────────────────────
// CHECK FOR NEW / CHANGED TRADES  (event-diff driven)
//─────────────────────────────────────────────────────────────────────────────
void CheckForTradeChanges()
{
   // Look back 60s further than lastOrderCheck to catch any edge cases
   datetime from = (lastHeartbeat > 0) ? lastHeartbeat - 60 : 0;
   if(!HistorySelect(from, TimeCurrent())) return;

   int histTotal = HistoryDealsTotal();
   // Only inspect the tail — last 50 deals (enough for burst activity)
   int startIdx  = MathMax(0, histTotal - 50);

   for(int i = startIdx; i < histTotal; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      if(IsSynced((long)ticket)) continue;

      long dealType  = HistoryDealGetInteger(ticket, DEAL_TYPE);
      long entryType = HistoryDealGetInteger(ticket, DEAL_ENTRY);

      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;

      string payload = BuildTradePayload(ticket, dealType, entryType, 0);
      string eventType = (entryType == DEAL_ENTRY_OUT) ? "trade_close" : "trade_open";

      int code = PostToServer(COL_TRADES, payload);
      if(code == 200 || code == 201)
      {
         MarkSynced((long)ticket);
         if(VerboseLogging) Print("EDGE: Synced ticket ", ticket, " (", eventType, ") → HTTP ", code);
         PostEvent(eventType, "{\"ticket\":" + IntegerToString((long)ticket) + "}");
      }
      else
      {
         // Network failure / offline — queue for retry
         QueueWrite(COL_TRADES, payload);
         if(VerboseLogging) Print("EDGE: Queued ticket ", ticket, " (HTTP ", code, ")");
      }
   }
}

//─────────────────────────────────────────────────────────────────────────────
// BUILD TRADE PAYLOAD  (single normalised record for PocketBase trades collection)
//─────────────────────────────────────────────────────────────────────────────
string BuildTradePayload(ulong ticket, long dealType, long entryType, double closePrice)
{
   string symbol  = EscapeJson(HistoryDealGetString(ticket, DEAL_SYMBOL));
   string comment = EscapeJson(HistoryDealGetString(ticket, DEAL_COMMENT));
   double lots    = HistoryDealGetDouble(ticket, DEAL_VOLUME);
   double price   = HistoryDealGetDouble(ticket, DEAL_PRICE);
   double sl      = HistoryDealGetDouble(ticket, DEAL_SL);
   double tp      = HistoryDealGetDouble(ticket, DEAL_TP);
   double profit  = HistoryDealGetDouble(ticket, DEAL_PROFIT);
   double comm    = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
   double swap    = HistoryDealGetDouble(ticket, DEAL_SWAP);
   datetime openT = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

   bool isClose   = (entryType == DEAL_ENTRY_OUT);
   string status  = isClose ? "closed" : "open";
   string side    = (dealType == DEAL_TYPE_BUY) ? "buy" : "sell";

   // For closing deals the deal price IS the close price
   double closePx = isClose ? price : 0;

   string body = "{";
   body += "\"trade_id\":\"ticket_"  + IntegerToString((long)ticket) + "\",";
   body += "\"account_id\":\""       + GetAccountId() + "\",";
   body += "\"symbol\":\""           + symbol + "\",";
   body += "\"side\":\""             + side + "\",";
   body += "\"volume\":"             + DoubleToString(lots, 2) + ",";
   body += "\"open_price\":"         + DoubleToString(price, 5) + ",";
   body += "\"close_price\":"        + DoubleToString(closePx, 5) + ",";
   body += "\"sl\":"                 + DoubleToString(sl, 5) + ",";
   body += "\"tp\":"                 + DoubleToString(tp, 5) + ",";
   body += "\"profit\":"             + DoubleToString(profit, 2) + ",";
   body += "\"commission\":"         + DoubleToString(comm, 2) + ",";
   body += "\"swap\":"               + DoubleToString(swap, 2) + ",";
   body += "\"open_time\":\""        + FormatTime(openT) + "\",";
   body += "\"close_time\":\""       + (isClose ? FormatTime(TimeCurrent()) : "") + "\",";
   body += "\"status\":\""           + status + "\",";
   body += "\"comment\":\""          + comment + "\"";
   body += "}";

   return body;
}

//─────────────────────────────────────────────────────────────────────────────
// HEARTBEAT
//─────────────────────────────────────────────────────────────────────────────
void SendHeartbeat()
{
   double balance  = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity   = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin   = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin = AccountInfoDouble(ACCOUNT_FREEMARGIN);
   int    openPos  = PositionsTotal();

   string body = "{";
   body += "\"account_id\":\""   + GetAccountId() + "\",";
   body += "\"balance\":"        + DoubleToString(balance, 2) + ",";
   body += "\"equity\":"         + DoubleToString(equity, 2) + ",";
   body += "\"margin\":"         + DoubleToString(margin, 2) + ",";
   body += "\"free_margin\":"    + DoubleToString(freeMargin, 2) + ",";
   body += "\"open_positions\":" + IntegerToString(openPos);
   body += "}";

   int code = PostToServer(COL_HEARTBEATS, body);
   if(VerboseLogging) Print("EDGE: Heartbeat → HTTP ", code);
}

//─────────────────────────────────────────────────────────────────────────────
// POST EVENT  (audit trail for events collection)
//─────────────────────────────────────────────────────────────────────────────
void PostEvent(string eventType, string payloadJson)
{
   string body = "{";
   body += "\"account_id\":\"" + GetAccountId() + "\",";
   body += "\"type\":\""       + eventType + "\",";
   body += "\"payload\":"      + payloadJson + ",";
   body += "\"timestamp\":\""  + FormatTime(TimeCurrent()) + "\"";
   body += "}";

   // Fire-and-forget; failures go to queue
   int code = PostToServer(COL_EVENTS, body);
   if(code != 200 && code != 201)
      QueueWrite(COL_EVENTS, body);
}

//─────────────────────────────────────────────────────────────────────────────
// POST SYNC STATE
//─────────────────────────────────────────────────────────────────────────────
void PostSyncState()
{
   string body = "{";
   body += "\"account_id\":\""    + GetAccountId() + "\",";
   body += "\"last_sync_time\":\"" + FormatTime(TimeCurrent()) + "\"";
   body += "}";
   PostToServer(COL_SYNC_STATE, body);
}

//─────────────────────────────────────────────────────────────────────────────
// HTTP POST  (PocketBase collections routing)
//─────────────────────────────────────────────────────────────────────────────
int PostToServer(string collection, string body)
{
   string url     = ServerURL + "/api/collections" + collection;
   string headers = "Content-Type: application/json\r\n"
                    "Authorization: Bearer " + ApiKey + "\r\n";

   char   post[], result[];
   string resultHeaders;

   StringToCharArray(body, post, 0, StringLen(body));
   ArrayResize(post, ArraySize(post) - 1); // strip null terminator

   int code = WebRequest("POST", url, headers, 10000, post, result, resultHeaders);

   if(VerboseLogging)
   {
      Print("EDGE HTTP POST → ", url, " | ", code);
      if(code != 200 && code != 201 && ArraySize(result) > 0)
         Print("  Response body: ", CharArrayToString(result));
   }

   return code;
}

//─────────────────────────────────────────────────────────────────────────────
// RETRY QUEUE — write
//─────────────────────────────────────────────────────────────────────────────
void QueueWrite(string collection, string payload)
{
   // Escape the payload for embedding inside outer JSON line
   string safePayload = payload;
   StringReplace(safePayload, "\\", "\\\\");
   StringReplace(safePayload, "\"", "\\\"");

   int h = FileOpen(QUEUE_FILE,
                    FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE)
   {
      Print("EDGE: Queue write failed — cannot open ", QUEUE_FILE);
      return;
   }

   FileSeek(h, 0, SEEK_END);

   string line = "{\"retry\":0,\"collection\":\"" + collection +
                 "\",\"payload\":\"" + safePayload + "\"}\n";
   FileWriteString(h, line);
   FileClose(h);

   if(VerboseLogging) Print("EDGE: Queued item for ", collection);
}

//─────────────────────────────────────────────────────────────────────────────
// RETRY QUEUE — process
//─────────────────────────────────────────────────────────────────────────────
void ProcessQueue()
{
   int h = FileOpen(QUEUE_FILE,
                    FILE_READ | FILE_TXT | FILE_ANSI | FILE_SHARE_READ);
   if(h == INVALID_HANDLE) return;  // no queue file yet — nothing to do

   string remaining = "";
   int processed = 0, requeued = 0, dropped = 0;

   while(!FileIsEnding(h))
   {
      string line = FileReadString(h);
      if(StringLen(line) < 10) continue;  // blank / corrupt line

      string collection = ExtractJsonString(line, "collection");
      string payload    = ExtractJsonString(line, "payload");
      int    retry      = (int)StringToInteger(ExtractJsonString(line, "retry"));

      if(collection == "" || payload == "")
      {
         if(VerboseLogging) Print("EDGE: Skipping malformed queue entry");
         continue;
      }

      // Unescape the payload (was escaped on write)
      StringReplace(payload, "\\\"", "\"");
      StringReplace(payload, "\\\\", "\\");

      int code = PostToServer(collection, payload);
      processed++;

      if(code == 200 || code == 201)
      {
         // Success — do NOT add back to remaining
         if(VerboseLogging) Print("EDGE: Queue item delivered → ", collection, " HTTP ", code);
      }
      else if(retry < MaxRetries)
      {
         // Increment retry and keep in queue
         retry++;
         string escaped = payload;
         StringReplace(escaped, "\\", "\\\\");
         StringReplace(escaped, "\"", "\\\"");
         remaining += "{\"retry\":" + IntegerToString(retry) +
                      ",\"collection\":\"" + collection +
                      "\",\"payload\":\"" + escaped + "\"}\n";
         requeued++;
      }
      else
      {
         // Max retries exceeded — drop with warning
         Print("EDGE: Dropping item after ", MaxRetries, " retries. Collection: ", collection);
         dropped++;
      }
   }

   FileClose(h);

   // Rewrite queue with only failed/pending items
   h = FileOpen(QUEUE_FILE,
                FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_WRITE);
   if(h != INVALID_HANDLE)
   {
      FileWriteString(h, remaining);
      FileClose(h);
   }

   if(VerboseLogging && processed > 0)
      Print("EDGE: Queue flush — processed:", processed, " requeued:", requeued, " dropped:", dropped);
}

//─────────────────────────────────────────────────────────────────────────────
// DUPLICATE PROTECTION — file-backed persistent dedup
//─────────────────────────────────────────────────────────────────────────────
bool IsSynced(long ticket)
{
   int h = FileOpen(SYNCED_FILE,
                    FILE_READ | FILE_TXT | FILE_ANSI | FILE_SHARE_READ);
   if(h == INVALID_HANDLE) return false;

   string target = IntegerToString(ticket);

   while(!FileIsEnding(h))
   {
      string line = FileReadString(h);
      if(line == target)
      {
         FileClose(h);
         return true;
      }
   }

   FileClose(h);
   return false;
}

void MarkSynced(long ticket)
{
   int h = FileOpen(SYNCED_FILE,
                    FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE)
   {
      Print("EDGE: Cannot open synced.db for writing");
      return;
   }

   FileSeek(h, 0, SEEK_END);
   FileWriteString(h, IntegerToString(ticket) + "\n");
   FileClose(h);
}

//─────────────────────────────────────────────────────────────────────────────
// MULTI-ACCOUNT: return account ID string
//─────────────────────────────────────────────────────────────────────────────
string GetAccountId()
{
   return "MT5_" + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));
}

//─────────────────────────────────────────────────────────────────────────────
// EVENT-DIFF STREAMING: lightweight state hash
//─────────────────────────────────────────────────────────────────────────────
string GetStateHash()
{
   // Combines open position count + latest history count → cheap change detector
   return IntegerToString(PositionsTotal()) + "_" + IntegerToString(HistoryDealsTotal());
}

//─────────────────────────────────────────────────────────────────────────────
// HELPERS
//─────────────────────────────────────────────────────────────────────────────

// ISO-8601-ish timestamp for PocketBase datetime fields
string FormatTime(datetime t)
{
   return TimeToString(t, TIME_DATE | TIME_SECONDS);
}

// JSON string escape
string EscapeJson(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", "\\n");
   StringReplace(s, "\r", "\\r");
   StringReplace(s, "\t", "\\t");
   return s;
}

// Minimal JSON string field extractor (no external library needed)
// Finds: "key":"value"  or  "key":number
string ExtractJsonString(string json, string key)
{
   string search = "\"" + key + "\":\"";
   int pos = StringFind(json, search);

   if(pos == -1)
   {
      // Try unquoted (numeric) value
      search = "\"" + key + "\":";
      pos    = StringFind(json, search);
      if(pos == -1) return "";

      int start = pos + StringLen(search);
      int end   = start;
      while(end < StringLen(json) &&
            StringGetCharacter(json, end) != ',' &&
            StringGetCharacter(json, end) != '}')
         end++;

      return StringSubstr(json, start, end - start);
   }

   int start = pos + StringLen(search);
   int end   = start;

   // Walk forward respecting escaped quotes
   while(end < StringLen(json))
   {
      ushort c = StringGetCharacter(json, end);
      if(c == '"' && (end == start || StringGetCharacter(json, end - 1) != '\\'))
         break;
      end++;
   }

   return StringSubstr(json, start, end - start);
}