# demo

An insurance application built on the [framework](../implementation/README.md). It shows how the pieces combine: entity classes with traits, searchable parties, contract terms with a history, amended through their own entities, roles, and row-level access.

## Contents

- **Parties**: searchable, with a `parties-by-type-search-query` search query at `POST /parties/search-by-type`.
- **Construction contracts**: an entity class with a numbered business key, a policyholder relation, a model that allows updates only in draft and a `contract-activated` event that carries the line of business, a `characteristics` value of the contract type that no record stores, as is the `maxSumInsured` that a reaction judges the sum insured by ([entities](../implementation/entity/entities/README.md#characteristics)). Marine contracts ([marine.eson](contracts/marine.eson)) are another contract type of the same class: its lifecycle is the class's (`fixed`) united with what the type adds, the state `suspended`, the transition `suspend` and `cancel` from it.
- **Approvals** ([approvals.eson](approvals/approvals.eson)): the state machine `approval-state-machine` is an element of its own (kind `state-machine`) that two entity types take as their state configuration with `/ref`. `expense-claim` uses it with one change and the [validation](../implementation/entity/entity-validations/README.md) trait: two validations (`expense-claim-amount-validation`, `expense-claim-justification-validation`) write their errors to `data.validation`, its `onValidation` delegate asks, in the same revision, for the transitions `markValid` and `markInvalid` of the dimension `validity` of its state, and `submit` also needs `validity: valid`, so a claim with errors is saved but can't be submitted; `leave-request` adds the state `cancelled` and the transition `cancel` with `/merge`.
- **Security**: [roles](security/roles.eson) (see [Roles](#roles)) and [row access](#row-access).

## Contract terms and amendments

A contract is one document: the body fields and the terms side by side (`policyholder`, `project`, `currency`, `region`, `startDate`, `premium`, `sumInsured`, `endDate`). Its body is versioned (`versioned.validFrom` is `/startDate`, fixed by `insurance-contract-type`), so the terms known before the contract is issued are part of the document users create and update, through the framework's own `/entities` routes: `POST` and `PUT` (`If-Match`) take the plain body, `GET` returns the last version and, with `?at=<date>`, the one valid then. In draft the whole document can be corrected, its `startDate` included, and without a start date it waits keyed `undated`. The model allows `update` only in draft; afterwards the terms change by amendments.

How an entity with a versioned body is amended is not specific to contracts: `insurance-contract-type` extends the framework's `versioned-entity-type` and its amendments are `amendment-entity-type`s ([entity-amendments](../implementation/entity/entity-amendments/README.md)). `insurance-contract-type` lists `applyAmendment` for the state `active` in its model. The amendment process is the demo's own: `underwriting-amendment-type` gives amendments the lifecycle draft, issued, active, cancelled, annulled (the dimension `status`), whose transitions `activate`, `cancel` and `annul` move the framework's `versionStatus` (pending, applied, discarded) that applies and reverts the version.

Premium adjustments, extensions and cancellations ([amendment-types.eson](contracts/amendment-types.eson)) are amendment types holding the `changes` to the terms and a reason; the `changes` schema is what an amendment may touch, and a contract type lists the types it allows (marine only the first; construction also the cancellation). The route [`POST /entities/:entityType/:businessKey/amendments`](contracts/amendment-endpoint.eson) takes `{ amendmentType, effectiveFrom, reason, changes }`; the amendment holds `reason` and `changes`, and the fill of each type on the contract type (`apply`: an `amend` of the `body` with `$func/change-version`) turns `changes` into the JSON Patch that makes the new version. The end date must be after the start (a reaction on `insurance-contract-type`).

How an amendment goes:

- **Proposing.** Only through the route above (an amendment can't be created directly). Only one amendment is open (draft or issued) at a time; its key is the contract's key and a number (`<contract key>-001`).
- **Activating** amends the contract: the last version with the changes patched in becomes a new version valid from the effective date (`conflict` if the contract changed since the amendment was proposed; `preview` on the amendment shows the commands before), which must not be before the last one (`conflict` otherwise; at its date it is a version of its own that shadows the last one); activating or cancelling closes the open amendment. **Annulling** an active one removes them, and only the latest can be annulled, so annulments run in the reverse order of activations. Cancelling one that never took effect (draft or issued) changes nothing.
- **Cancelling a contract** is an amendment too: the `cancellation` of a construction contract has the `changes` of an extension (`endDate`), and its fill ([construction.eson](contracts/construction.eson)) lists the trait operations of `apply` (`amend` of the `body` and the transition `cancel` of the `state`) and of `revert` (`remove` and the transition `reactivate`), so activating it ends the terms and moves the contract from active to cancelled in one revision, and annulling it brings both back.
- **Who.** The underwriter proposes, issues, cancels and annuls amendments; an administrator activates them.

## Roles

[Roles](security/roles.eson) ([authorization](../implementation/services/authorization/README.md)): an `underwriter-role` (its own `underwriter-actor`: contracts, their transitions except `activate`, and parties; plus the framework's `entity-reader-actor`), a `viewer-role` and an `administrator-role`. The migration [`administrator-user`](security/administrator.eson) creates the user `administrator` with the administrator role; the demo's [app config](security/app-config.eson) maps the login `admin` to it (the `actAs` setting of `authenticate`), so a token of the mock identity provider for `admin` administers users. A real deployment leaves that file out and maps its own login (`BPF__security__actAs__administrator=<subject>`).

### State permissions

Who may do a transition can depend on the state it is done from. Which states are locked for editing is a rule of the process, declared in the model as `operations`; this is about who may act. The contract's state is its process state (the default with one dimension). The `underwriter-actor` may discard and issue contracts but not cancel them: an active one is cancelled directly by the administrator, whose grants name no state, or by a cancellation amendment. A grant names a state for operations that are not transitions: the process doesn't restrict `delete` of a contract, the permission does (the underwriter may delete a contract only while it is `draft`, the administrator at any state). `npx bpf explain construction ../demo` shows the roles per process state.

### Row access

What a user may do and which contracts they reach are two permissions, assigned separately. The *process* permissions are the roles above; the *access* permissions are [access profiles](security/access-profiles.eson), and a user holds `roles` and `access` as two lists. The contract class ([insurance-contract-type](contracts/insurance-contract-type.eson)) fixes an `ownership` trait with the dimensions `region` and `confidential` and a rule that takes them from the body (`region` is required, `confidential` defaults to false). [Scopes](security/scopes.eson) name rows: `own-region-ownership-scope` (the contract's region is the `region` claim of the user's principal) and `confidential-ownership-scope`; the claims are declared as the schema `principal-claims`.

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
