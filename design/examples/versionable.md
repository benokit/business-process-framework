```json
{
    "type": "trait",
    "name": "versionable",
    "data": "versionable-trait-data-schema",
    "configuration": "versionable-trait-data-schema",
    "actions": {
        "create": "versionable-trait-create-procedure",
        "activate": "versionable-trait-activate-procedure",
        "discard": "versionable-trait-discard-procedure"
    }
}
```

```json
{
    "type": "schema",
    "name": "versionable-trait-data-schema",
    "schema": {
        "versions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "entityId": {
                        "type": "string"
                    },
                    "validFrom" {
                        "type": "string",
                        "format": "date-time"
                    },
                    "status": {
                        "type": "string",
                        "enum": [
                            "draft",
                            "active",
                            "discarded"
                        ]
                    }
                }
            }
        }
    }
}
```