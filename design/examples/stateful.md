```json
{
    "type": "trait",
    "name": "stateful",
    "data": "stateful-trait-data-schema",
    "configuration": "stateful-trait-configuration-schema",
    "actions": 
}
```

```json
{
    "type": "schema",
    "name": "stateful-trait-data-schema",
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
    "name": "stateful-trait-configuration-schema",
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
                    "properties": {
                        "name": {
                            "type": "string"
                        },
                        "from": {
                            "type": "string"
                        },
                        "to": {
                            "type": "string"
                        }
                    }
                }
            }
        }
    }
}
```
