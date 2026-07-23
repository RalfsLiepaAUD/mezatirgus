# Step 9 — Auctions and First Competitor

Status: IMPLEMENTED. Scope is exactly `FIRST_FULL_SKELETON_PLAN.md` §9. Auction rules remain centralized assumptions and the competitor is fictional.

The authoritative auction domain contains `Auction`, `AuctionRegistration`, `AuctionBid`, `AuctionResult`, and one `Competitor`. It supports prepared-roundwood auctions and a standing-timber placeholder. Stable counters provide auction, registration, bid, competitor, and preallocated winner-commitment identities.

Registration calculates an integer deposit from opening total and configured basis points. Player deposits create existing-finance commitments without changing cash; competitor deposits reserve hidden budget. Bids require registration, a finite proxy maximum, the fixed increment, and sufficient available company cash or competitor budget. Rates, totals, volumes, and proportions are integer-only.

Competitor valuation, budget, strategy, and error range are hidden from ordinary read models. `RunCompetitorBid` draws only from the named `auction` stream. The immutable evaluation event stores its draw, adjustment, resulting valuation, and optional bounded bid; replay verifies the stored material.

Auction close is scheduled at the exact timestamp in the existing AI-decision phase. A bid inside the configured late window extends the close and schedules a replacement deadline. Earlier close events remain in the immutable log but are stale and cannot close or settle the auction. Winner selection sorts by highest rate, then earliest timestamp, then stable bid ID. Public results reveal participating bidder identities after close.

Closing releases losing player deposit commitments and competitor reservations. A winning player bid creates one existing-finance purchase commitment for the exact integer total. No auction event directly changes cash. Prepared and standing-timber lots remain conserved auction records; conversion into inventory or harvest workflows is deferred.

Core version is 0.9.0 and save/snapshot schema is 8. Migration 7→8 adds deterministic empty auction state without dropping Steps 1–8. State, deadlines, hidden competitor data, stored RNG outcomes, commitments, bids, and results are checksummed and replayed through production reducers.

Known limitations: one-shot bidding rather than automatic proxy escalation, one competitor, no payment/removal settlement or deposit-forfeiture branch, and no inventory/harvest conversion. Exact Latvian auction rules are not claimed.

Step 10 yards, employees, harvesting, contracts, exports, markets, and UI were not started.
