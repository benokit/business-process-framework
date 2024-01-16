
# Process

Types:
  - new entity
  - existing entity
  - 




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

process:
  states:
    - state:
       actions:
         - action:
            type:
             - 

entity -> process -> status -> [active, completed]

definition:
entity -> actions -> action-name -> process

---------------------------------------------------------

API trigger action:

command: `POST /api/entities/<entity-name>/entity/<entity-number>/action/<action-name>`

procedure:

```meta
  entity = get-entity entity-number
  process_instance = get-active-process-for-entity entity-number
  if process_instance
    process_definition = get-process-definition process_instance.definition_id
    action_definition = process_definition.states[process_instance.state].actions[action-name]
    if action-definition
      execute-action action-definition process payload
  else
    entity_definition = get-entity-definition entity.definition_id
    action_definition = process_definition.states[entity.state].actions[action-name]
    if action-definition
      execute-action action-definition entity payload
```









## Representation

```json
{
  "type": "entity",
  "name": "contract",
  "class": "base-contract",
  "schema": "contract-schema",
  "constructors": [
    "Default": {
      "process": "PolicyRegistration"
    }
  ]
}
```

```json
{
  "type": "process",
  "name": "contract-management",
  "entity": "contract",
  "schema": "contract-management-process-schema",
  "states": {
    "Draft": {
      "initialState": true,
      "actions": {
        "Update": {
          "type": "update",
          "updateSchema": "contract-update-schema",
          "applyUpdate": "apply-update-function"
        },
        "Activate": {
          "type": "transition",
          "targetState": "Active",
          "condition": "activation-condition-function"
        },
        "Print": {
          "type": "printout",
          "render": "contract-to-pdf"
        }
      }
    },
    "Active": {
      "terminalState": true
    }
  }
}
```


## API

### Create entity:

```rest
POST /api/entities/<entity-name>/entity
```

payload:

```json
{
  "constructor": "Default",
  "state": "Draft",
  "body": {

  }
}
```

response:

```json
{
  "number": "123",
  "state": "Draft",
  "process": "PolicyRegistration",
  "processState": "Draft",
  "body": {
  }
}
```

### Get entity

```rest
GET /api/entities/<entity-name>/entity/<entity-number>
```

## Get actions

```rest
GET /api/entities/<entity-name>/entity/<entity-number>/actions
```

response:

```json
{
  "process": "Default",
  "processState": "Draft",
  "actions": [
    "Update"
  ]
}
```

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
