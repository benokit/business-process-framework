# business-process-framework

## Elements

JSON objects:

- elements:
  - schema
    - type = "schema"
    - id: string
    - schema: object
  - data
    - type = "data"
    - id: string
    - data: object
    - meta: object
  - service
    - type = "service"
    - id: string
    - meta: object
    - interface: object
    - implementation: object

- service.implementation:
  - one of:
    - $ref -> data
    - []: pipeline
      - items:
        - one of:
          - context: object
          - source:
            - name
            - inputMap
            - module: string
            - function: string
            - outputMap
          - service:
            - name
            - inputMap
            - serviceId
            - outputMap
          - return
            - outputMap