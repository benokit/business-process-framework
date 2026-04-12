# users

User entity management with password hashing.

## Entity type: `user`

| Field | Type | Description |
| --- | --- | --- |
| `username` | string (required) | Unique identifier; mapped to the entity business key |
| `email` | string (required) | User email address |
| `isActive` | boolean (required) | Whether the user account is active |
| `password_hash` | string (optional) | Scrypt-derived password hash |

The `username` field is automatically used as the entity `businessKey` via a registered business key rule.

## Entity service extension: `user-password-service`

Accessible via `entity.execute` with `method: "set-password"` (kind `service/entity-service-extension/user`).

| Method | Input | Returns | Description |
| --- | --- | --- | --- |
| `set-password` | `{ password }` | `entity-record` | Hashes the password with scrypt and stores it in `password_hash` |

## JS exports

| Function | Signature | Description |
| --- | --- | --- |
| `hashPassword` | `({ input: password }) → string` | Low function: hashes a plain-text password |
| `verifyPassword` | `({ input: { password, hash } }) → boolean` | Low function: verifies a plain-text password against a stored hash |
