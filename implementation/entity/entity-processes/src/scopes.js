import { recordSchema, recordSchemaOf } from '@business-framework/entities/records';

const ERROR = { '!code': 'string', '!message': 'string', data: '@any' };

const POSITIONS = {
    step: {},
    method: { without: 'output' },
    error: { extra: { '!error': ERROR } }
};

const participants = (declarations, schemaOf) => Object.fromEntries(Object.entries(declarations)
    .map(([name, declaration]) => [`!${name}${declaration.many ? '[]' : ''}`, schemaOf(declaration)]));

export const scopeSchema = ({ definition, position }) => {
    const { without, extra = {} } = POSITIONS[position];
    const scope = {
        '!process': recordSchema({ process: '@any', state: '@any', body: definition.variables ?? '@any' }),
        '!entities': participants(definition.entities, recordSchemaOf),
        '!tasks': participants(definition.tasks ?? {}, ({ type }) => recordSchemaOf({ entityType: type })),
        '!input': definition.input ?? '@any',
        '!signal': '@any',
        '!output': '@any',
        ...extra
    };
    return Object.fromEntries(Object.entries(scope).filter(([key]) => key !== `!${without}`));
};
