# Step 3 Focused Finance Acceptance Audit

Status: PASSED

## Ledger integrity

All balances are derived from immutable balanced journal postings. Every cash projection entry identifies one journal transaction, and each transaction records the immutable posting event ID. Duplicate finance event IDs are rejected before reducer mutation. Corrections append reversals. Reversing a reversal appends another transaction whose postings reinstate the original economic effect; no historical entry is edited.

## Liquidity and commitments

Operating cash, restricted cash, commitments, available credit, and total liquidity are separate. Free cash is operating cash less active commitments. Restricted cash is a separate non-spendable account and is not subtracted twice. Total immediately usable liquidity is free cash plus eligible headroom on available or active facilities.

Commitments settle in full only; partial settlement is explicitly rejected. Release, settlement, expiry, and failure are mutually exclusive terminal events. A payable linked to a commitment must exactly match its company, counterparty, currency, and amount. It must be paid in full; payment consumes the commitment and creates exactly one cash posting. Direct settlement or release after linkage is rejected.

## Claims

Receivable recognition debits accounts receivable and credits revenue. Collection debits cash and credits receivables. Payable recognition debits generic operating expense and credits accounts payable; payment debits the payable and credits cash. Due and overdue events change aging/status only. Stale events cannot reopen fully paid claims or duplicate revenue, expense, or cash.

Impairment, default, cancellation, and write-off accounting are not silently inferred. Future write-off and cancellation require explicit events and reversal/expense rules.

## Interest

Loan and credit interest use ACT/365 with exact simulation seconds, integer basis points, BigInt arithmetic, integer minor-unit postings, and authoritative remainder carry. Leap days do not change the 365 denominator. Repeated accrual through the same boundary, accrual after repayment/closure, and excess or repeated repayment are rejected. Accrual is command-driven in Step 3; automatic recurring accrual scheduling remains future work.

## Deadlines

Business days are Monday through Friday with no holidays. The start timestamp is not counted. From a weekend, counting begins with the next Monday. Zero business days returns the original timestamp even on a weekend. Calendar days remain exact 86,400-second intervals. DST and host timezone never affect game timestamps.

## Insolvency

Due obligations are unpaid payables whose due timestamp is at or before current game time, plus accrued loan and credit interest. Future payables are excluded. Active commitments reduce free cash. Receivables and restricted cash are excluded from immediate liquidity. Only eligible AVAILABLE or ACTIVE credit headroom counts. Locked, suspended, closed, and defaulted facilities do not count.

Equality is solvent. Obligations above free cash but within drawable credit produce DISTRESSED. Obligations above total liquidity produce INSOLVENT. Re-evaluation without a change emits no event. Payment or newly available credit can recover the company through an explicit SolvencyStatusChanged event.

## Replay and long run

Finance state includes applied event IDs, preventing duplicate event application across snapshots and replay. Finance objects, schedules, counters, and interest remainder are authoritative. The one-year audit covers recurring claims, daily loan interest, persistence checkpoints, and deterministic chunk variants; state and ledger checksums converge.

## Tax boundary

No tax calculation or hidden tax posting exists. Generic operating expense is not tax. Domestic timber VAT cash treatment remains a future transaction rule. The taxonomy is additive: VAT payable/receivable, corporate-income-tax expense/payable, payroll liabilities, and penalties can be introduced as new accounts and explicit posting rules without changing existing double-entry semantics.

## Remaining limitations

- No public-holiday calendar.
- Commitment-linked payables intentionally require full payment.
- Interest accrual is explicitly commanded rather than automatically scheduled.
- Claim impairment/default/write-off and payable cancellation accounting are reserved for explicit future commands/events.
- The insolvency rule is a conservative technical skeleton.
