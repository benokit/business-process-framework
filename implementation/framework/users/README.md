# users

- Entity type `user` (kind `user-account`, an entity class): `{ username, email, roles?, passwordHash? }`, keyed by `username`, with the [state](../entity-states/README.md) trait: `active` / `suspended` (`suspend`, `reactivate`).
- `user.set-password({ businessKey, password })` stores a scrypt hash (an operation the class adds to the entity type).
- `password` (kind `password-hasher`): `hash(password)` → `salt:key`, `verify({ password, hash })` → boolean.
- On start, after the database, `ensure-admin-account` creates the admin user, as the system principal (`asSystem`), from the `users` app config (`adminUsername`, `adminPassword`, `adminEmail`; defaults `admin` / `admin` / `admin@localhost`, override with `BPF__users__adminPassword`), unless it exists.
