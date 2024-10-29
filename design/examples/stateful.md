```json
{
    "type": "trait",
    "namespace": "stateful-trait",
    "name": "stateful",
    "data": "stateful-trait/data-schema",
    "configuration": "stateful-trait/configuration-schema",
    "actions": {
        "transition": "stateful-trait/transition-procedure"
    }
}
```

```json
{
    "type": "procedure",
    "namespace": "stateful-trait",
    "name": "transition-procedure",
    "inputSchema": "stateful-trait/transition-procedure-input-schema",
    "resultSchema": "empty-schema",
    "pipeline": [
        {
            "action": "std/update",
            "inputMapping": "stateful-trait/update-state"
        }
    ]
}
```

```js
// stateful-trait.js

function update-state ({input, data, configuration, context})
{
    const transition = configuration.transitions[input.transition];
    
    if (data.state === transition.from) {
        return {
            state: transition.to
        };
    }
    else {
        throw `Can not make transition ${input.transition} from the state ${data.state}.`
    }
}

exports.update-state = update-state;
```

```json
{
    "type": "schema",
    "namespace": "stateful-trait",
    "name": "transition-procedure-input-schema",
    "schema": {
        "type": "object",
        "properties": {
            "transition": {
                "type": "string"
            }
        }
    }
}
```

```json
{
    "type": "schema",
    "namespace": "stateful-trait",
    "name": "data-schema",
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
    "namespace": "stateful-trait",
    "name": "configuration-schema",
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
