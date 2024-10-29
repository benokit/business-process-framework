```json
{
    "type": "trait",
    "name": "statefull",
    "data": "satefull-trait-data-schema",
    "configuration": "satefull-trait-configuration-schema",
    "actions": 
}
```

```json
{
    "type": "schema",
    "name": "satefull-trait-data-schema",
    "schema": {
        "type": "object",
        "properties": {
            "state": {
                "type": "string"
            }
        }
    }
}
```

```json
{
    "type": "schema",
    "name": "satefull-trait-configuration-schema",
    "schema": {
        "type": "object",
        "properties": {
            "states": {
                "type": "array",
                "items": {
                    "type": "string"
                }
            },
            "transitions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "
                }
            }
        }
    }
}
```