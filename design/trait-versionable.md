## Versioning

class trait versionable

```json
{
    "type": "trait",
    "id": "versionable",
    "class": "Contract",
    "schema": "contract-schema" // part of entity data which is not versioned
}
```

### Model

For entity with N versions there would be N + 1 records in the ENTITY table and N records in ENTITY_VERSION table.
Initially there are always 2 records in ENTITY table and 1 record in ENTITY_VERSION table.
On record represents a complete entity and the other represents an initial version of the entity with sequence number 0.
The body of in the record that represents the complete entity adheres to the schema given in the versionable trait and is valid for all versions - could be empty as well.

### API

```http
POST /api/process/Contract
payload:
{
    "unversionedBody": {},
    "body": {}
}
```


