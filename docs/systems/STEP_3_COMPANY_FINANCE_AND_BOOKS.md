# Implementation Step 3 — Company, Finance, and Books

Status: COMPLETE

## Scope

This step implements only the company identity, finance accounts, immutable double-entry books, commitments, receivables, payables, the offered term loan, the initially locked revolving credit facility, deterministic interest, solvency/liquidity evaluation, finance read models, persistence/replay integration, and a headless demonstration. No Step 4 market, map, timber, counterparty, auction, transport, forest, or React behavior is included.

## Architecture

The authoritative finance aggregate is `FinanceDomain`. Commands validate before allocating IDs or emitting events. Accepted commands emit immutable domain events; the same `FinanceDomain.apply` path handles live execution and replay. Journal entries are immutable balanced transactions. Corrections use linked reversal transactions.

The ledger is the accounting source of truth. Account balances are derived from journal postings. Commitments are separate reservations: they reduce free cash but do not alter ledger cash until settlement. Receivables and payables are claims with event-driven due and overdue transitions.

## Scalar and calendar rules

All money is integer EUR minor units. Rates are integer basis points. Fractional or unsafe values are rejected. Interest uses ACT/365 daily accrual with BigInt numerator/remainder carry, so no fractional money or floating-point balance state is introduced.

The business calendar is Monday through Friday with no holidays. Calendar-second, calendar-day, and business-day deadlines are explicit. Scheduled events never fire before their exact timestamp.

## Financing defaults

The Normal opening balance is EUR 30,000.00 (`3_000_000` minor units). The term-loan offer is EUR 50,000.00 (`5_000_000` minor units), 800 basis points, with a 730-calendar-day term. The revolving facility limit is EUR 25,000.00 (`2_500_000` minor units), 1000 basis points, and starts unavailable. It becomes drawable only through an explicit unlock event.

Loan interest is paid before principal. Loan maturity creates an overdue event and unresolved principal then creates a default event. Receivable and payable due/overdue transitions are likewise explicit scheduled events.

## Invariants

- Every journal transaction has at least one debit and credit and balances exactly.
- Every posting uses an existing account owned by the transaction company and the same currency.
- IDs use persistent namespaced deterministic counters.
- Rejected commands leave authoritative state, counters, RNG, queue, log, snapshots, and authoritative command history unchanged.
- Payments cannot exceed claim balances.
- Loan principal, accrued interest, credit drawn amounts, and credit interest cannot become negative.
- Credit drawings cannot exceed the facility limit.
- Finance snapshots, ledger lists, and read models return safe copies and consume no RNG.

## Persistence and replay

Finance is included in the authoritative checksum under `finance`, containing companies, accounts, transactions, commitments, receivables, payables, loans, and credit facilities. Save schema and snapshot schema are version 2; core version is 0.3.0. The deterministic v1-to-v2 migration initializes the finance aggregate, updates the snapshot checksum, replays post-snapshot events, and establishes the migrated authoritative checksum. Unknown pre-existing fields remain preserved.

Excluded non-authoritative data remains command history, snapshot sequence metadata, player preferences, and diagnostics/display projections. These do not drive simulation outcomes.

## Read models

Read-only projections provide the company finance header, ledger list, receivable and payable aging, loan and credit summaries, near-term cash forecast, and solvency/liquidity warning. They derive from authoritative finance state without mutation or RNG draws.

## Verification

The Step 3 suite contains 54 tests. Together with Step 1 and Step 2, the repository has 145 passing tests. The required headless entry point is `pnpm finance:demo`.
