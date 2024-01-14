ENTITY:
  - fields:
    - ENTITY_ID
    - DEFINITION_ID
    - BODY
  - primaryKey:
    - ENTITY_ID

ENTITY_CLASS:
  - fields:
    - ENTITY_ID
    - CLASS_ID
    - BODY
  - primaryKey:
    - ENTITY_ID
    - CLASS_ID
  - foreignKeys:
    - ENTITY_ID -> ENTITY

ENTITY_VERSION:
  - fields:
    - VERSION_ENTITY_ID
    - ENTITY_ID
    - VERSION_SEQUENCE_NUMBER
    - STATUS: [Draft, Applied, Discarded]

