# database

The abstract kind `database`: implementations extend it (`postgresql-database`), so other kinds can depend on "a database" without naming one, e.g. `"lifecycle": { "startAfter": ["database"] }`. Databases start in the first position.
