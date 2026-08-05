# Travel Expense

Travel Expense records trip spending, keeps each account and trip isolated, and
replicates approved changes to cloud backends without losing offline work.

## Language

**Trip**:
A bounded journey that owns its dates, itinerary, people, budget, and ledger.
_Avoid_: Project, workspace

**Ledger**:
The receipts and settlement-relevant spending that belong to one Trip.
_Avoid_: Database, notebook

**Receipt**:
One expense record in a Trip ledger, whether entered manually or recognized from
an image, voice input, or email.
_Avoid_: Transaction, row

**Account Scope**:
The isolated local state namespace for one signed-in user or the local-only user.
_Avoid_: Profile cache, device account

**Change Journal**:
The durable local record of Trip, Receipt, settings, and deletion changes that
still require replication or terminal error evidence.
_Avoid_: Retry list, pending array

**Mirror Job**:
A request to copy one shared-ledger change into its Notion notebook.
_Avoid_: Sync item, callback

**Provider Catalog**:
The approved AI providers and models that a named app surface may select, test,
or route.
_Avoid_: Model list, provider map
