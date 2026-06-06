/// <reference path="../pb_data/types.d.ts" />

// File: pb_hooks/investor_link.pb.js
// Drop this file into the pb_hooks/ folder next to your PocketBase binary.
// PocketBase will auto-load it on start. No restart needed on Railway —
// redeploy after adding the file.

routerAdd("GET", "/api/investor/{token}", (e) => {
    const token = e.request.pathValue("token");

    if (!token || token.trim() === "") {
        return e.json(400, { error: "Missing token" });
    }

    // 1. Look up investor link by token
    let link;
    try {
        link = $app.findFirstRecordByFilter(
            "investor_links",
            "token = {:token}",
            { token: token.trim() }
        );
    } catch (_) {
        return e.json(404, { error: "Investor link not found" });
    }

    // 2. Check if active
    if (!link.getBool("is_active")) {
        return e.json(403, { error: "This investor link has been disabled" });
    }

    // 3. Increment views + update last_viewed (non-fatal if it fails)
    try {
        link.set("views", link.getInt("views") + 1);
        link.set("last_viewed", new Date().toISOString());
        $app.save(link);
    } catch (err) {
        console.error("Failed to update view count:", err);
    }

    // 4. Get owner display name
    let ownerName = "Trader";
    try {
        const owner = $app.findRecordById("users", link.getString("user"));
        ownerName = owner.getString("display_name") || owner.getString("email") || "Trader";
    } catch (_) {
        // non-fatal — fall back to "Trader"
    }

    // 5. Fetch owner's trades
    let trades = [];
    try {
        const tradeRecords = $app.findRecordsByFilter(
            "trades",
            "user = {:uid}",
            "-trade_date",
            500,
            0,
            { uid: link.getString("user") }
        );

        const showPnl  = link.getBool("show_pnl");
        const showLots = link.getBool("show_lot_size");

        trades = tradeRecords.map((tr) => {
            const obj = {
                id:            tr.getId(),
                trade_date:    tr.getString("trade_date"),
                pair:          tr.getString("pair"),
                direction:     tr.getString("direction"),
                session:       tr.getString("session"),
                setup:         tr.getString("setup"),
                rr:            tr.getFloat("rr"),
                pips:          tr.getFloat("pips"),
                grade:         tr.getString("grade"),
                followed_plan: tr.getBool("followed_plan"),
            };
            if (showPnl)  obj.pnl      = tr.getFloat("pnl");
            if (showLots) obj.lot_size = tr.getFloat("lot_size");
            return obj;
        });
    } catch (err) {
        console.error("Failed to fetch trades:", err);
    }

    // 6. Return shaped response — matches what InvestorPage.jsx expects
    return e.json(200, {
        display_name: ownerName,
        label:        link.getString("label"),
        show_pnl:     link.getBool("show_pnl"),
        show_lots:    link.getBool("show_lot_size"),
        trades:       trades,
    });
});
