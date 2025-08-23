schema

type

data:
    type: data,
    id:
    data: {
        $ref: data-id
    }

{
    "$with": {
        "a": {
            "$ref": "data-id"
        }
    },
    "$set": {
        
    }
}