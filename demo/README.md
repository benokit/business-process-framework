# demo

An insurance application built on the [framework](../implementation/README.md). It shows how the pieces combine: entity classes with traits, searchable parties, a timeline of contract terms amended through their own entities, roles, and row-level access.

## Contents

- **Parties**: searchable, with a `parties-by-type-search-query` search query at `POST /parties/search-by-type`.
- **Construction contracts**: an entity class with a numbered business key, a policyholder relation, a draft-only update guard and a `contract-activated` event. Marine contracts ([marine.eson](contracts/marine.eson)) are another contract type whose lifecycle is composed from the construction one with `/ref` of a path and `/merge`: they add the state `suspended`, the transition `suspend` and `cancel` from it.
- **Security**: [roles](security/roles.eson) (see [Roles](#roles)) and [row access](#row-access).

## Contract terms and amendments

What varies in time is the `versionable` timeline of the contract class (`premium`, `sumInsured`, `endDate`), whose first version is the start of the contract; the body keeps what never varies (policyholder, project, currency).

How an entity with a timeline is amended is not specific to contracts and lives in [versioning](versioning/):

- `versioned-entity-type`: an entity type with its timeline under the fixed key `timeline` (a concrete kind sets the segment schema by filling the same key), an `amendment-ledger` trait that takes no configuration, guards that accept the ledger only through `open` and `close` with the value `{ last, open }` and the timeline only through `put` and `remove`, the slot `amendmentTypes` and the abstract operation `isAmendable`, which `insurance-contract-type` implements as amendable when active.
- `amendment-entity-type`: lifecycle draft, issued, active, cancelled, annulled; a relation `amends`; guards and the reactions that apply, revert and close.
- the process `entity-amendments`.

Premium adjustments and extensions ([amendment-types.eson](contracts/amendment-types.eson)) are amendment types holding the `changes` to the terms, an effective date and a reason; a contract type lists the types it allows (marine only the first).

How an amendment goes:

- **Proposing.** It is created only by `POST /entities/:entityType/:businessKey/amendments`, which needs an amendable entity and an allowed type and binds the context `amending`, without which a guard refuses `create`. The entity keeps the `amendment-ledger` (`{ last, open }`): proposing writes `last + 1` and the new key as `open` in the same transaction as the amendment, at the entity's revision. So only one amendment is open (draft or issued) at a time, concurrent proposals can't both win, and the numbers have no gaps. The amendment's key is the entity's key and that number (`<contract key>-001`).
- **Activating** merges its changes into the terms current then and adds them from the effective date; activating or cancelling closes the open amendment. **Annulling** an active one removes them, and only the latest can be annulled, so annulments run in the reverse order of activations. Cancelling one that never took effect (draft or issued) changes nothing.
- **Who.** The underwriter proposes, issues, cancels and annuls amendments; an administrator activates them.

## Roles

[Roles](security/roles.eson) ([authorization](../implementation/services/authorization/README.md)): an `underwriter-role` (its own `underwriter-actor`: contracts, their transitions except `activate`, and parties; plus the framework's `entity-reader-actor`), a `viewer-role` and an `administrator-role`. The migration [`administrator-user`](security/administrator.eson) creates the user `administrator` with the administrator role; the demo's [app config](security/app-config.eson) maps the login `admin` to it (the `actAs` setting of `authenticate`), so a token of the mock identity provider for `admin` administers users. A real deployment leaves that file out and maps its own login (`BPF__security__actAs__administrator=<subject>`).

### State permissions

Who may do a transition can depend on the state it is done from ([state-permissions](../design/state-permissions.md)). Which states are locked for editing is a rule of the process, the guard above; this is about who may act. The contract's state is its permission state (the default with one dimension). The `underwriter-actor` may discard and issue contracts and may `cancel` one only while it is `issued`; cancelling an active one needs the administrator, whose grants name no state. `npx bpf explain construction ../demo` shows the roles per permission state.

### Row access

What a user may do and which contracts they reach are two permissions, assigned separately ([row-access](../design/row-access.md)). The *process* permissions are the roles above; the *access* permissions are [access profiles](security/access-profiles.eson), and a user holds `roles` and `access` as two lists. The contract class ([insurance-contract-type](contracts/insurance-contract-type.eson)) fixes an `ownership` trait with the dimensions `region` and `confidential` and a rule that takes them from the body (`region` is required, `confidential` defaults to false). [Scopes](security/scopes.eson) name rows: `own-region-ownership-scope` (the contract's region is the `region` claim of the user's principal) and `confidential-ownership-scope`; the claims are declared as the schema `principal-claims`.

| Access profile | Contracts it reaches |
|---|---|
| `all-contracts-access-profile` | every contract |
| `regional-contracts-access-profile` | the contracts of the user's own region that are not confidential |
| `senior-regional-contracts-access-profile` | includes the regional profile and adds the confidential contracts of the region; profiles only add |
| `open-contracts-access-profile` | every contract that is not confidential, in every region |

The same `underwriter-role` serves the German, the French and the senior underwriter: they differ in the profile and the `region` claim of their user, not in a role per region. An auditor holds the read-only `viewer-role` and the open profile. A user whose profile doesn't reach contracts, or who lacks the claim, reaches none. A contract outside a user's rows is `404`, as if it did not exist; creating one outside them, or handing a contract to another region by changing its `region`, is `403` and rolled back. The contract search (`POST /entity-search/construction`, from [contract-search](contracts/contract-search.eson)) returns only the contracts of the user's rows, with the right `total`. The migrations in [regional-users.eson](security/regional-users.eson) create the users `underwriter-de` and `underwriter-fr` (with the claim `region`), `senior-underwriter-de` and `auditor`, so a token of the mock identity provider for any of them (`client_id=underwriter-de`) shows it:

```sh
npx bpf explain own-region-ownership-scope ../demo   # its dimensions, the entity types it applies to, the profiles that name it
npx bpf explain construction ../demo                 # the ownership dimensions, rule, scopes and the profiles that reach it
```

#### Organisational access

A classic hierarchy: a member of a department reaches what their department and the departments below it own. The hierarchy is one static element, [company-departments](organisation/departments.eson) (a [`hierarchy`](../implementation/platform/data-structures/README.md#hierarchy): a tree of department names), and a [memo](organisation/memos.eson) is owned by a single department (`ownership.department`). The scope resolves the set when the filter is built: `ownership.department` is among `$func/hierarchy-subtree(company-departments, principal.department)`, the department of the principal and every one below it. A member of `emea` reaches the memos of `emea`, `de` and `fr` but not those of `apac` or `finance`, a member of `sales` reaches all sales memos, and a user without the claim reaches none. The process role `employee-role` is the same for all of them, and writing follows the same rows: a member can write for their department and those below it, not for a sibling or the department above. Because the tree is read when a request runs and not stored in the memos, restructuring the organisation is editing the element: no memo changes and nothing is backfilled. The server test runs the scenario.

```sh
cd implementation/server && npm run start-demo   # bpf migrate ../../demo, then start
```
