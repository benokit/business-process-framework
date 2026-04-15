# Demo

A concrete business solution modelled on top of the business process framework.
Three entity types — **users**, **parties**, and **contracts** — plus a workflow service that
orchestrates the contract lifecycle.

## Structure

```
demo/
  users/
    users.eson           # User entity type
  parties/
    parties.eson         # Party entity type
  contracts/
    contracts.eson       # Contract entity type
    contract-guards.eson # Business-rule guards (before-update)
    contract-events.eson # Event handler (on-transition)
  services/
    contract-workflow.eson  # Orchestration service
```

## Entity types

### User

Represents a system user.

| Field       | Type   | Required |
|-------------|--------|----------|
| `email`     | string | yes      |
| `firstName` | string | yes      |
| `lastName`  | string | yes      |
| `role`      | string | yes      |

**States:** `active` → `suspended` → `active`

**Transitions:** `suspend`, `reactivate`

### Party

A business counterparty — a company or individual that can participate in contracts.

| Field                | Type   | Required |
|----------------------|--------|----------|
| `partyType`          | string | yes      |
| `name`               | string | yes      |
| `taxId`              | string | no       |
| `registrationNumber` | string | no       |
| `email`              | string | no       |
| `phone`              | string | no       |
| `address`            | object | no       |

**States:** `prospect` → `verified`, `prospect`/`verified` → `blacklisted` → `prospect`

**Transitions:** `verify`, `blacklist`, `reactivate`

A party must be in `verified` state before it can be used in an approved contract.

### Contract

A binding agreement between two parties (seller and buyer).

| Field            | Type   | Required |
|------------------|--------|----------|
| `title`          | string | yes      |
| `sellerPartyKey` | string | yes      |
| `buyerPartyKey`  | string | yes      |
| `value`          | number | yes      |
| `currency`       | string | yes      |
| `startDate`      | string | yes      |
| `endDate`        | string | yes      |
| `terms`          | string | no       |

**States:**

```
draft ──► pending-approval ──► approved ──► active ──► expired
  ▲              │                │                └──► terminated
  └──────────────┘ (rejected)     └──► terminated
```

**Transitions:** `submit`, `approve`, `reject`, `activate`, `expire`, `terminate`

Data versioning is enabled — use the `amend` operation to record a new data version with an optional `validFrom` date.

## Guards (contract-guards.eson)

Two guards run before every contract `update`:

- **contract-value-guard** — rejects if `value <= 0`
- **contract-parties-guard** — rejects if `sellerPartyKey == buyerPartyKey`

## Event handler (contract-events.eson)

**contract-approval-handler** runs on every contract `transition`. When the transition is `approve` it publishes a `contract-approved` message to the `contract-events` channel containing the contract key, party keys, value, currency, and timestamp.

## Workflow service (contract-workflow.eson)

`contract-workflow` exposes two higher-level operations:

### `createAndSubmit`

Creates a contract in `draft` state and immediately submits it, returning the entity in `pending-approval` state. Single atomic request for the happy-path creation flow.

```
Input: { businessKey, title, sellerPartyKey, buyerPartyKey, value, currency, startDate, endDate, terms? }
Output: entity-record (status: pending-approval)
```

### `approve`

Validates that both counterparties are in `verified` state, then transitions the contract to `approved`. Throws if either party is unverified.

```
Input: { businessKey }
Output: entity-record (status: approved)
```

## Loading the demo

Pass the demo element paths alongside the framework elements when calling `loadElements`:

```js
import { loadElements } from '@business-framework/core/elements-loader';

const elements = await loadElements([
    'implementation/core/elements/**/*.eson',
    'implementation/security/entities/elements/**/*.eson',
    'implementation/infrastructure/**/elements/**/*.eson',
    'demo/**/*.eson'
]);
```

## Example flow

```
# 1. Create parties
POST /entities/party   { businessKey: "acme",     data: { partyType: "company",    name: "Acme Corp" } }
POST /entities/party   { businessKey: "globocorp", data: { partyType: "company",    name: "GloboCorp" } }

# 2. Verify parties
POST /entities/party/acme/transitions/verify
POST /entities/party/globocorp/transitions/verify

# 3. Create and submit contract via workflow service
POST /entities/contract-workflow/execute/createAndSubmit
  { businessKey: "CNT-001", title: "Supply Agreement", sellerPartyKey: "acme",
    buyerPartyKey: "globocorp", value: 50000, currency: "USD",
    startDate: "2026-04-01", endDate: "2027-03-31" }

# 4. Approve via workflow service (validates party states)
POST /entities/contract-workflow/execute/approve
  { businessKey: "CNT-001" }

# 5. Activate the contract
POST /entities/contract/CNT-001/transitions/activate
```
