# Mežtirgus Development Rules

## Project goal

Build a realistic forestry and roundwood trading simulator.

The player should feel like they are building a forestry company from scratch.

The simulation covers:

Forest resources
↓
Harvesting
↓
Timber assortments
↓
Trading
↓
Transport
↓
Storage
↓
Buyers
↓
Payments
↓
Company growth


## Source material

Before designing systems read:

- docs/source research files
- docs/design/MASTER_SYSTEM_MAP.md
- docs/design/GAME_VISION.md

Research documents are reality anchors.

Do not invent forestry mechanics that contradict them.


## Central simulation object

The TimberBatch is the core object.

Every system should create, modify, move, store, sell, measure, or finance TimberBatch objects.


## Development philosophy

Do not build a polished small game first.

Build a complete ugly simulation skeleton.

Every major department should exist in a simple form before deep polishing.


## Realism rules

Wood is not one resource.

Species:
- Birch
- Spruce
- Pine
- Aspen
- Alder
- Oak

Assortments:
- Veneer logs
- Sawlogs
- Pulpwood
- Energy wood
- Reject


Buyers are specialized.

A veneer mill does not automatically buy all birch.

A pulp mill does not automatically buy veneer logs.

Buyer acceptance rules must exist.


Transport matters.

Distance, trucks, payload, roads and location affect profitability.


Cash flow matters.

A profitable company can fail because money is trapped in inventory or unpaid invoices.


## Do not start with

- beautiful maps
- AI narrator
- animations
- multiplayer
- complex UI

Build the economic relationships first.


## First milestone

Create a simulation sandbox:

Company
Money
TimberBatch
Species
Assortments
Suppliers
Buyers
Offers
Inventory
Basic transactions

No graphics required.

Focus on correct relationships.
