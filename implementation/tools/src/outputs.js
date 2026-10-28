import { compactToStandard } from '@benokit/js-cjsl';

const object = shape => compactToStandard({ $data: shape });

const arrayOf = items => ({ type: 'array', items });

const span = {
    type: 'object',
    required: ['label', 'children'],
    properties: {
        label: { type: 'string' },
        children: arrayOf({ $ref: '#/$defs/span' }),
        ms: { type: 'number' },
        error: { type: 'string' },
        effects: arrayOf({ type: 'string' }),
        skipped: { type: 'boolean' }
    }
};

export const failure = object({ '!code': 'string', '!message': 'string', data: 'object' });

export const outputSchemas = {
    validate: arrayOf(failure),
    explain: object({
        '!id': 'string',
        '!kind': 'string',
        source: 'string',
        'chain[]': 'string',
        data: 'object',
        shapes: 'object',
        fixed: 'object',
        manages: 'object',
        'settings[]': 'object',
        'operations[]': { '!name': 'string' },
        'slots[]': { '!name': 'string', 'fills[]': 'object' },
        'lifecycle[]': 'object',
        'instances[]': 'string',
        'bindings[]': 'object',
        '!explanations': 'object'
    }),
    refs: arrayOf(object({ '!element': 'string', '!path': 'string', '!via': 'string', source: 'string' })),
    list: arrayOf(object({ '!id': 'string', '!kind': 'string', '!source': 'string' })),
    vocabulary: object({
        '!nodeKeys[]': 'string',
        '!nodeForms[]': { '!keyword': 'string', '!companions[]': 'string' },
        '!templates[]': { '!keyword': 'string', '!id': 'string' },
        '!primitives[]': { '!name': 'string' },
        '!pureFunctions[]': { '!name': 'string' }
    }),
    trace: {
        type: 'object',
        required: ['spans'],
        properties: {
            result: {},
            error: object({ '!code': 'string', '!message': 'string' }),
            spans: arrayOf({ $ref: '#/$defs/span' })
        },
        $defs: { span }
    },
    migrate: object({ '!applied[]': 'string' })
};
