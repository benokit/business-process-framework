import { isDeepStrictEqual } from 'node:util';
import { get } from 'lodash-es';
import { CoreError, findElement, getElement, invoke } from '@business-framework/core';
import { applyMapping } from '@business-framework/core/mappings';
import { hasOperation, isInstanceOf, selvesOf } from '@business-framework/core/kinds';
import { standardOf } from '@business-framework/core/schemas';
import { mappingType } from '@business-framework/core/data-flow';
import { traitsOf } from '@business-framework/entities/traits';

const PRIMITIVES = ['string', 'number', 'integer', 'boolean'];

const LOWERCASE = 'string:^[^\\p{Lu}]*$';

const ownershipUseOf = entityType => {
    const use = traitsOf(entityType).ownership;
    return use !== undefined && isInstanceOf({ element: use.trait, kind: 'ownership-trait' }) ? use : undefined;
};

const ownedTypes = () => selvesOf('entity-type').map(({ id }) => ({ id, use: ownershipUseOf(id) })).filter(({ use }) => use !== undefined);

const dimensionOf = ([key, type]) => ({ name: key.replace(/^!/, '').replace(/\[\]$/, ''), array: key.endsWith('[]'), type });

const dimensionsOf = use => Object.entries(use.configuration.dimensions ?? {}).map(dimensionOf);

const isPrimitive = ({ type }) => PRIMITIVES.includes(type);

export const ownershipSchemas = () => ownedTypes().map(({ id, use }) => ({
    id: `${id}/ownership/dimensions`,
    schema: {
        ...Object.fromEntries(Object.entries(use.configuration.dimensions).map(([key, type]) => [key, type === 'string' ? LOWERCASE : type])),
        '*': 'never'
    }
}));

export const ownershipRule = entityType => ownershipUseOf(entityType)?.configuration.rule ?? null;

const recordsAfterWrite = {
    create: ({ entityType, businessKey, data }) => ({ entityType, businessKey, data }),
    update: ({ before, key, value }) => ({ entityType: before.entityType, businessKey: before.businessKey, data: { ...before.data, [key]: value } })
};

export const recordAfterWrite = ({ operation, input }) => recordsAfterWrite[operation]?.(input) ?? null;

const writesOwnership = {
    create: ({ input, ownership }) => ({ ...input, data: { ...input.data, ownership } }),
    update: ({ input, ownership }) => isDeepStrictEqual(input.before.data.ownership, ownership) ? input : { ...input, derived: { ownership } }
};

export const withOwnership = ({ operation, input, ownership }) => writesOwnership[operation]?.({ input, ownership }) ?? input;

const traitType = ({ trait, configuration }) => isInstanceOf({ element: trait, kind: 'body-trait' }) && configuration.schema !== undefined ? standardOf(configuration.schema) : {};

const recordType = entityType => ({
    type: 'object',
    properties: {
        entityType: { type: 'string' },
        businessKey: { type: 'string' },
        data: {
            type: 'object',
            properties: Object.fromEntries(Object.entries(traitsOf(entityType)).map(([key, use]) => [key, traitType(use)])),
            additionalProperties: false
        }
    },
    additionalProperties: false
});

const dimensionProblems = (entityType, dimensions) => dimensions
    .filter(dimension => !isPrimitive(dimension))
    .map(({ name }) => `${entityType}: dimension '${name}' is not a ${PRIMITIVES.join(', ')} or an array of one of them`);

const ruleProblems = (entityType, { configuration: { rule, dimensions } }) => {
    const declared = Object.keys(dimensions ?? {}).map(key => dimensionOf([key]).name);
    return [
        ...mappingType(rule, recordType(entityType)).problems
            .filter(problem => problem.code === 'unknown-path')
            .map(problem => `${entityType}: the ownership rule ${problem.message}`),
        ...Object.keys(rule).filter(name => !name.startsWith('$') && !declared.includes(name))
            .map(name => `${entityType}: the ownership rule gives '${name}', which is not a dimension`)
    ];
};

const conflictProblems = dimensions => Object.entries(Object.groupBy(dimensions, ({ name }) => name))
    .filter(([, same]) => new Set(same.map(({ type, array }) => `${type}${array ? '[]' : ''}`)).size > 1)
    .map(([name]) => `dimension '${name}' has different types in different entity types`);

export const ownershipProblems = () => {
    const owned = ownedTypes();
    return [
        ...owned.flatMap(({ id, use }) => [...dimensionProblems(id, dimensionsOf(use)), ...ruleProblems(id, use)]),
        ...conflictProblems(owned.flatMap(({ use }) => dimensionsOf(use)))
    ];
};

const COMPARISONS = ['$eq', '$neq'];

const LOGICAL = ['$and', '$or'];

const OWNERSHIP = '#.ownership.';

const PRINCIPAL = '#.principal.';

const PRINCIPAL_PROPERTIES = { userId: { type: 'string' }, username: { type: 'string' }, email: { type: 'string' }, roles: { type: 'string', array: true } };

const isPath = operand => typeof operand === 'string' && operand.startsWith('#.');

const literalType = value => typeof value === 'number' ? 'number' : typeof value;

const fitsType = (value, type) => type === undefined || literalType(value) === (type === 'integer' ? 'number' : type);

const CLAIMS = 'principal-claims';

const claimOf = (head, rest) => {
    const property = standardOf(getElement(CLAIMS).data).properties?.[head];
    if (property === undefined) return undefined;
    return rest.length === 0 ? { type: property.type === 'array' ? property.items?.type : property.type, array: property.type === 'array' } : {};
};

const principalPropertyOf = path => {
    const [head, ...rest] = path.slice(PRINCIPAL.length).split('.');
    if (head in PRINCIPAL_PROPERTIES) return rest.length === 0 ? PRINCIPAL_PROPERTIES[head] : undefined;
    return findElement(CLAIMS) === undefined ? {} : claimOf(head, rest);
};

const isComputed = operand => operand !== null && typeof operand === 'object' && !Array.isArray(operand);

const describeOperand = (operand, dimensions) => {
    if (isComputed(operand)) return { kind: 'computed', operand };
    if (typeof operand === 'string' && operand.startsWith(OWNERSHIP)) return { kind: 'dimension', operand, dimension: dimensions.find(({ name }) => `${OWNERSHIP}${name}` === operand) };
    if (typeof operand === 'string' && operand.startsWith(PRINCIPAL)) return { kind: 'principal', operand, property: principalPropertyOf(operand) };
    return isPath(operand) ? { kind: 'unknown', operand } : { kind: 'value', operand };
};

const operandProblems = ({ kind, operand, dimension, property }) => ({
    dimension: dimension === undefined ? [`'${operand}' is not a dimension of the ownership`] : [],
    principal: property === undefined ? [`'${operand}' is not a property of the principal`] : [],
    unknown: [`'${operand}' is not a dimension of the ownership or a property of the principal`],
    computed: JSON.stringify(operand).includes(OWNERSHIP) ? [`${JSON.stringify(operand)} is computed from the ownership: a computed value may use only the principal`] : [],
    value: [operand].flat().filter(item => typeof item === 'string' && item !== item.toLowerCase()).map(item => `'${item}' has uppercase letters`)
})[kind];

const valuesOf = ({ kind, operand }) => kind === 'value' ? [operand].flat() : [];

const otherProblems = (described, dimension, array) => described.flatMap(other => [
    ...valuesOf(other).filter(value => !fitsType(value, dimension?.type)).map(value => `${JSON.stringify(value)} is not a ${dimension.type} like '${dimension.name}'`),
    ...other.kind === 'principal' && other.property !== undefined && Boolean(other.property.array) !== array
        ? [array ? `'${other.operand}' is not an array` : `'${other.operand}' is an array: ask whether it includes a value`]
        : [],
    ...other.kind === 'principal' && other.property?.type !== undefined && dimension !== undefined && other.property.type !== dimension.type ? [`'${other.operand}' is a ${other.property.type}, not a ${dimension.type} like '${dimension.name}'`] : []
]);

const comparisonProblems = (operands, dimensions) => {
    const described = operands.map(operand => describeOperand(operand, dimensions));
    const own = described.filter(({ kind }) => kind === 'dimension');
    const dimension = own[0]?.dimension;
    return [
        ...described.flatMap(operandProblems),
        ...own.length > 1 ? ['a comparison needs one dimension and one value'] : [],
        ...dimension?.array ? [`'${own[0].operand}' is an array: ask whether it includes a value`] : [],
        ...own.length === 1 && dimension !== undefined ? otherProblems(described.filter(({ kind }) => kind !== 'dimension'), dimension, false) : []
    ];
};

const inclusionProblems = ({ collection, value }, dimensions) => {
    const [list, item] = [collection, value].map(operand => describeOperand(operand, dimensions));
    const own = [list, item].filter(({ kind }) => kind === 'dimension');
    const dimension = own[0]?.dimension;
    return [
        ...[list, item].flatMap(operandProblems),
        ...own.length > 1 ? ['$includes needs one dimension and one value or list of values'] : [],
        ...list.kind === 'dimension' && dimension !== undefined && !dimension.array ? [`'${list.operand}' is not an array`] : [],
        ...item.kind === 'dimension' && dimension?.array ? [`'${item.operand}' is an array: ask whether it includes a value`] : [],
        ...list.kind === 'value' && !Array.isArray(list.operand) ? ['the list of $includes is not a list'] : [],
        ...own.length === 1 && dimension !== undefined
            ? [...otherProblems([list.kind === 'dimension' ? item : list].filter(other => other.kind === 'value' || other.kind === 'principal'), dimension, list.kind !== 'dimension')]
            : []
    ];
};

const filterProblems = (filter, dimensions) => {
    const [operator, ...others] = Object.keys(filter ?? {});
    const operand = filter?.[operator];
    if (others.length > 0 || ![...COMPARISONS, ...LOGICAL, '$not', '$includes'].includes(operator)) {
        return [`${JSON.stringify(filter)} is not a $eq, $neq, $includes, $and, $or or $not`];
    }
    if (COMPARISONS.includes(operator)) return comparisonProblems(operand, dimensions);
    if (operator === '$includes') return inclusionProblems(operand, dimensions);
    return (LOGICAL.includes(operator) ? operand : [operand]).flatMap(inner => filterProblems(inner, dimensions));
};

export const scopeProblems = scope => {
    const dimensions = ownedTypes().flatMap(({ use }) => dimensionsOf(use));
    return filterProblems(getElement(scope).data.filter, dimensions).map(problem => `${scope}: ${problem}`);
};

const escaped = value => typeof value === 'string' && /^[#@\\]/.test(value) ? `\\${value}` : value;

const isUsable = value => value !== undefined && value !== null && !(typeof value === 'string' && value !== value.toLowerCase());

const principalValue = (operand, principal) => get(principal, operand.slice(PRINCIPAL.length));

const knownOf = (operand, principal) => {
    if (isComputed(operand)) return { value: applyMapping({ mapping: operand, input: { principal } }) };
    if (typeof operand === 'string' && operand.startsWith(PRINCIPAL)) return { value: principalValue(operand, principal) };
    return isPath(operand) ? undefined : { value: operand };
};

const scalarOf = known => Array.isArray(known.value) || !isUsable(known.value) ? undefined : known.value;

const listOf = known => [known.value].flat().filter(isUsable);

const equal = (left, right) => scalarOf(left) !== undefined && scalarOf(left) === scalarOf(right);

const negated = bound => typeof bound === 'boolean' ? !bound : { $not: bound };

const bindEquality = ([left, right], principal) => {
    const [first, second] = [left, right].map(operand => knownOf(operand, principal));
    if (first && second) return equal(first, second);
    const [path, known] = first ? [right, first] : [left, second];
    return scalarOf(known) === undefined ? false : { $eq: [path, escaped(scalarOf(known))] };
};

const bindInclusion = ({ collection, value }, principal) => {
    const [list, item] = [collection, value].map(operand => knownOf(operand, principal));
    if (list && item) return scalarOf(item) !== undefined && listOf(list).includes(scalarOf(item));
    if (list) return listOf(list).length === 0 ? false : { $includes: { collection: listOf(list).map(escaped), value } };
    return scalarOf(item) === undefined ? false : { $includes: { collection, value: escaped(scalarOf(item)) } };
};

const combined = (operator, parts) => {
    const decisive = operator === '$and' ? false : true;
    if (parts.includes(decisive)) return decisive;
    const open = parts.filter(part => typeof part !== 'boolean');
    return open.length === 0 ? !decisive : open.length === 1 ? open[0] : { [operator]: open };
};

export const bindPrincipal = (filter, principal) => {
    const [operator] = Object.keys(filter);
    const operand = filter[operator];
    if (operator === '$eq') return bindEquality(operand, principal);
    if (operator === '$neq') return negated(bindEquality(operand, principal));
    if (operator === '$includes') return bindInclusion(operand, principal);
    if (operator === '$not') return negated(bindPrincipal(operand, principal));
    return combined(operator, operand.map(inner => bindPrincipal(inner, principal)));
};

export const bindRows = ({ rows, principal }) => rows === true || rows === null ? rows : bindPrincipal(rows, principal ?? {});

const PAGE = 200;

const recordsOf = async entityType => {
    const { total } = await invoke('entity-database', 'list', { entityType, limit: 1, offset: 0 });
    const offsets = Array.from({ length: Math.ceil(total / PAGE) }, (_, page) => page * PAGE);
    return offsets.reduce(async (read, offset) => [...await read, ...(await invoke('entity-database', 'list', { entityType, limit: PAGE, offset })).items], Promise.resolve([]));
};

const derivedOwnership = (rule, record) => applyMapping({ mapping: rule, input: { entityType: record.entityType, businessKey: record.businessKey, data: record.data } });

export const backfillOwnership = async ({ input: { entityType } }) => {
    const rule = ownershipRule(entityType);
    if (rule === null) throw new CoreError('invalid', `${entityType} has no ownership trait`);
    if (!hasOperation({ element: entityType, operation: 'deriveOwnership' })) throw new CoreError('invalid', `${entityType} exposes no deriveOwnership operation`);
    const stale = (await recordsOf(entityType))
        .map(record => ({ record, ownership: derivedOwnership(rule, record) }))
        .filter(({ record, ownership }) => !isDeepStrictEqual(record.data.ownership, ownership));
    await stale.reduce((written, { record, ownership }) => written.then(() => invoke(entityType, 'deriveOwnership', {
        businessKey: record.businessKey, revision: record.revision, value: ownership
    })), Promise.resolve());
    return { updated: stale.length };
};

const dimensionsRead = scope => [...JSON.stringify(getElement(scope).data.filter).matchAll(/#\.ownership\.([^"\\]+)/g)].map(([, name]) => name);

const declaredBy = entityType => dimensionsOf(ownershipUseOf(entityType)).map(({ name }) => name);

const scopeExplanation = scope => {
    const read = [...new Set(dimensionsRead(scope))];
    return { dimensions: read, entityTypes: ownedTypes().map(({ id }) => id).filter(id => read.every(name => declaredBy(id).includes(name))) };
};

const entityTypeExplanation = entityType => ({
    dimensions: Object.fromEntries(dimensionsOf(ownershipUseOf(entityType)).map(({ name, array, type }) => [name, array ? `${type}[]` : type])),
    rule: ownershipRule(entityType),
    scopes: selvesOf('ownership-scope').map(({ id }) => id).filter(id => scopeExplanation(id).entityTypes.includes(entityType))
});

export const ownershipExplanation = element => {
    if (findElement(element) === undefined) return null;
    if (isInstanceOf({ element, kind: 'ownership-scope' })) return { ownership: scopeExplanation(element) };
    return isInstanceOf({ element, kind: 'entity-type' }) && ownershipUseOf(element) ? { ownership: entityTypeExplanation(element) } : null;
};
