## Entity definition

Define a class:

```json
{
    "type": "class",
    "id": "party",
    "schema": "party-schema"
}
```

Define a schema for the class:

```json
{
    "type": "schema",
    "id": "party-schema",
    "schema": {
        "type": "object",
        "properties": {
            "fullName": {
                "type": "string"
            }
        }
    }
}
```

Define an entity:

```json
{
    "type": "entity",
    "id": "natural-person",
    "schema": "natural-person-schema",
    "traits": {
        {
            "type": "class",
            "class": "party",
            "mapping": "map-natural-person-to-party"
        }
    }
}
```

Define a schema:

```json
{
    "type": "schema",
    "id": "natural-person-schema",
    "schema": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string"
            },
            "surname": {
                "type": "string"
            }
        }
    }
}
```

Define a class mapping:

```json
{
    "type": "function",
    "id": "map-natural-person-to-party",
    "inputSchema": "natural-person-schema",
    "outputSchema": "party-schema",
    "implementation": {
        "module": "natural-person",
        "function": "map-natural-person-to-party"
    }
}
```

and

```js
// natural-person.js
function map-natural-person-to-party (party) {
    return {
        fullName: party.name + ' ' + party.surname
    };
}

export { map-natural-person-to-party };
```