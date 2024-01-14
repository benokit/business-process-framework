
# Process

```json
{
    "class": "state",

}
```

process:

- class
  input
     entityName
     entityInitialState
     body
  flow
    state
      transitions
        transition
          state

process
  class
  flow
  create entity instance of class

coprocess
  class
  baseClass
  flow
  apply
  create entity instance of class
  inherit entity instance of baseClass

subprocess
  class
  flow
  inherit entity instance of class

transition
  withSubProcess: subprocess
  withCoProcess

start process:
  inputSchema
  initialization

## Representation

```json
{
  "type": "process",
  "name": "contract-management",
  "entity": "contract",
  "schema": "contract-management-process-schema",
  "states": {
    "Draft": {
      "actions": {
        "update": {
          "updateSchema": "contract-update-schema",
          "applyUpdate": "apply-update-function"
        },
        "transitions": {
          "Activate": {
            "targetState": "Active",
            "withSubprocess": {
              "name": "activation-sub-process",
              "init": "init-function"
            }
          }
        }
      }
    },
    "Active": {
      "actions": {
        "amend": {
          "process"
        }
      }
    }
  }
}
```


## API

Create  process:

```http
POST /api/process/<process-name>
payload:
{

  "state": "Draft",
  "body": {

  }
}
response:
{
  processNumber: 123
  entity: {
    entityNumber: 321,
    body: {

    }
  }
}
```

Update entity:

```http
PUT /api/process/<process-name>/<process-number>/entity
payload:
{
  "body": {

  }
}
response:
{
  processNumber: 123
  entity: {
    entityNumber: 321,
    body: {
      
    }
  }
}
```
