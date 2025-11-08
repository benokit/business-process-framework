import { registerObject } from 'system/objects-registry.js';
import { getData } from 'system/data.js';

registerObject(
    {
        type: 'data',
        id: 'literal',
        data: {
            $literal: {
                a: 'a',
                b: 'b'
            }
        }
    }
);

registerObject(
    {
        type: 'data',
        id: 'referencing',
        data: {
            id: 'something',
            c: [
                {
                    $ref: 'literal'
                },
                {
                    a: 'aa',
                    b: 'bb'
                }
            ],
            a: 'aaa',
            b: 'bbb'
        } 
    }
)

registerObject(
    {
        type: 'data',
        id: 'merged',
        data: {
            $merge: [
                {
                    $ref: 'referencing'
                },
                {
                    $ref: 'literal'
                }
            ]
        }
    }
);

const data = getData('merged');

console.log(data);