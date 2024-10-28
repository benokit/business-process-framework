# Construction of versioned entity

Root entity definition:

```json
{
  "type": "entity-definition",
  "name": "Consent",
  "schema": "ConsentSchema",
  "constructors": {
    "Default": {
      "actions": [
        {
          "type": "create-entity",
          "entityName": "ConsentVersion",
          "construction": {
            "constructor": "Applied",
            "constructorMapping": "VersionConstructorMapping"
          },
          "relation": "Version",
          
        }
      ]
    }
  },
  "actions": {
    "CreateVersion": {
      "type": "create-entity",
      "entityName": "ConsentVersion",
      "construction": {
        "constructor": "Default",
        "constructorMapping": "VersionConstructorMapping"
      },
      "coupling": {
        "relation": "Version",

      }
    }
  }
  "traits": {
    "generative": {
      "generates": {
        "Version": {
          "entityName": "ConsentVersion",
          "construction": {
            "constructor": "Default",
            "inputMapping": "VersionConstructorMapping"
          }
        }
      }
    },
    "compositional": {
      "couplings": {
        "Version": {
          "backwardPropagation": "ApplyVersionToContract"
        }
      }
    }
  }
}
```

Version definition:

```json
{
  "type": "entity-definition",
  "name": "ConsentVersion",
  "schema": "ConsentVersionSchema",
  "traits": {
    "generative": {
      "generates": {
        "Version": {
          "entityName": "ConsentVersion",
          "construction": {
            "constructor": "Default",
            "inputMapping": "VersionConstructorMapping"
          }
        }
      }
    },
    "compositional": {
      "couplings": {
        "Version": {
          "backwardPropagation": "ApplyVersionToContract"
        }
      }
    }
  }
}
```