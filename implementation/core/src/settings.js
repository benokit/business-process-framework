import { get, isPlainObject, set, uniq } from 'lodash-es';
import { allElements, getElement, kindOf, lazy, memo } from './registry.js';
import { fail } from './errors.js';
import { instancesOf, resolveKind } from './kinds.js';
import { compose } from './composition.js';
import { storedSchema, validateValue } from './schemas.js';

const PREFIX = 'BPF__';
const PRIMITIVES = ['string', 'integer', 'number', 'boolean'];
const NAME = /^[A-Za-z][A-Za-z0-9]*$/;

const chainOf = element => resolveKind(element.kind === 'kind' ? element.id : kindOf(element)).chain;

const settingsKinds = element => chainOf(element).filter(kind => kind.data.settings !== undefined);

const hasSettings = element => element.id !== undefined && element.kind !== 'kind' && settingsKinds(element).length > 0;

const layersOf = element => [...resolveKind(kindOf(element)).ids, element.id];

const variablePart = id => id.replaceAll('-', '_');

const schemaOf = kind => storedSchema(`/${kind.id}/settings`);

const alternativesOf = schema => [
    ...schema.$ref === undefined ? [] : [storedSchema(schema.$ref)],
    ...schema.allOf ?? [], ...schema.anyOf ?? [], ...schema.oneOf ?? []
].filter(isPlainObject);

const stepInto = (schema, key) => [
    ...alternativesOf(schema).flatMap(alternative => stepInto(alternative, key)),
    ...schema.properties?.[key] !== undefined ? [schema.properties[key]]
        : isPlainObject(schema.additionalProperties) ? [schema.additionalProperties] : []
];

const typesOf = schema => [
    ...schema.type === undefined ? [] : [schema.type].flat(),
    ...schema.const === undefined ? [] : [typeof schema.const],
    ...schema.enum === undefined ? [] : schema.enum.map(value => typeof value),
    ...alternativesOf(schema).flatMap(typesOf)
];

const itemsOf = schema => [
    ...schema.items === undefined ? [] : [schema.items],
    ...alternativesOf(schema).flatMap(itemsOf)
];

const convert = (text, schemas) => {
    const types = schemas.flatMap(typesOf);
    if (types.includes('string') || types.length === 0) return text;
    if (types.includes('array')) return text === '' ? [] : text.split(',').map(item => convert(item.trim(), schemas.flatMap(itemsOf)));
    if (types.includes('integer') || types.includes('number')) return text.trim() !== '' && !Number.isNaN(Number(text)) ? Number(text) : text;
    if (types.includes('boolean')) return text === 'true' ? true : text === 'false' ? false : text;
    return text;
};

const environmentLayer = (id, shapes) => {
    const prefix = `${PREFIX}${variablePart(id)}__`;
    return Object.entries(process.env)
        .filter(([name]) => name.startsWith(prefix))
        .reduce((tree, [name, text]) => {
            const path = name.slice(prefix.length).split('__');
            const schemas = path.reduce((current, key) => current.flatMap(schema => stepInto(schema, key)), shapes);
            return set(tree, path, convert(text, schemas));
        }, {});
};

const sections = lazy(() => compose(instancesOf('app-config').map(element => element.data)));

const effective = element => {
    const kinds = settingsKinds(element);
    const layers = layersOf(element);
    const shapes = kinds.map(schemaOf).filter(Boolean);
    return compose([
        ...kinds.map(kind => kind.data.settings.defaults ?? {}),
        ...layers.map(id => sections()[id] ?? {}),
        ...layers.map(id => environmentLayer(id, shapes))
    ]);
};

const messageOf = errors => errors.slice(0, 3).map(({ instancePath, message }) => `${instancePath || '/'} ${message}`).join(', ');

const checked = element => {
    const settings = effective(element);
    settingsKinds(element).filter(schemaOf).forEach(kind => {
        const { isValid, errors } = validateValue({ schemaId: `${kind.id}/settings`, value: settings });
        if (!isValid) {
            fail('invalid-settings', `${element.id}: settings don't match ${kind.id} (${messageOf(errors)}); layers: ${layersOf(element).join(', ')}`,
                { element: element.id, kind: kind.id, layers: layersOf(element), errors });
        }
    });
    return settings;
};

const settingsOfElement = memo(id => checked(getElement(id)));

export const getSettings = id => settingsOfElement(id);

const shapeProblems = (schema, path, where) => {
    if (!isPlainObject(schema)) return [];
    const inner = alternativesOf(schema).flatMap(alternative => shapeProblems(alternative, path, where));
    if (schema.$ref !== undefined) return [`${where} ${path || '/'} refers to a schema`, ...inner];
    const names = Object.keys(schema.properties ?? {}).filter(name => !NAME.test(name)).map(name => `${where} ${path}${name} isn't a camelCase identifier`);
    const properties = Object.entries(schema.properties ?? {}).flatMap(([name, property]) => shapeProblems(property, `${path}${name}.`, where));
    const map = isPlainObject(schema.additionalProperties) ? shapeProblems(schema.additionalProperties, `${path}*.`, where) : [];
    const list = schema.type === 'array'
        ? PRIMITIVES.includes(schema.items?.type) ? [] : [`${where} ${path} is a list of something other than primitives`]
        : [];
    return [...inner, ...names, ...properties, ...map, ...list];
};

const shapeChecks = () => allElements().filter(element => element.kind === 'kind' && element.data.settings?.shape !== undefined)
    .map(kind => () => {
        const problems = shapeProblems(schemaOf(kind), '', `settings of ${kind.id}:`);
        if (problems.length > 0) fail('settings-shape', problems.join('; '), { kind: kind.id, problems });
    });

const collisionChecks = () => {
    const ids = allElements().filter(element => element.id !== undefined && (element.kind === 'kind' ? element.data.settings : hasSettings(element)))
        .map(element => element.id);
    return ids.map(id => () => {
        const same = ids.filter(other => other !== id && variablePart(other) === variablePart(id));
        if (same.length > 0 || id.includes('__')) {
            fail('settings-name', `'${id}' can't be told apart in an environment variable from ${[...same, ...id.includes('__') ? ['its own separator'] : []].join(', ')}`, { id, same });
        }
    });
};

export const settingsProblems = () => [
    ...shapeChecks(),
    ...collisionChecks(),
    ...allElements().filter(hasSettings).map(element => () => settingsOfElement(element.id))
];

export const checkSettings = () => settingsProblems().forEach(check => check());

const valuesOf = schema => [
    ...schema.const === undefined ? [] : [schema.const],
    ...schema.enum ?? [],
    ...alternativesOf(schema).flatMap(valuesOf)
];

const isLeaf = schema => schema.const !== undefined || schema.enum !== undefined || typesOf(schema).some(type => type !== 'object');

const typeName = schema => typesOf(schema).includes('array')
    ? `${uniq(itemsOf(schema).flatMap(typesOf)).join('|')}[]`
    : uniq(typesOf(schema)).join('|');

const leavesOf = (schema, path) => {
    if (!isPlainObject(schema)) return [];
    const inner = alternativesOf(schema).flatMap(alternative => leavesOf(alternative, path));
    const properties = Object.entries(schema.properties ?? {}).flatMap(([name, property]) => leavesOf(property, [...path, name]));
    const entries = isPlainObject(schema.additionalProperties) ? leavesOf(schema.additionalProperties, [...path, '*']) : [];
    return [...inner, ...properties, ...entries, ...isLeaf(schema) && path.length > 0 ? [{ path, type: typeName(schema), values: valuesOf(schema) }] : []];
};

const merged = leaves => Object.values(Object.groupBy(leaves, ({ path }) => path.join('.'))).map(group => ({
    path: group[0].path,
    type: uniq(group.map(({ type }) => type)).join('|'),
    values: uniq(group.flatMap(({ values }) => values))
}));

export const availableSettings = id => {
    const element = getElement(id);
    const kinds = settingsKinds(element);
    const defaults = compose(kinds.map(kind => kind.data.settings.defaults ?? {}));
    return merged(kinds.map(schemaOf).filter(Boolean).flatMap(schema => leavesOf(schema, [])))
        .map(({ path, type, values }) => ({
            path: path.join('.'),
            type,
            ...values.length > 0 && { values },
            ...!path.includes('*') && get(defaults, path) !== undefined && { default: get(defaults, path) },
            variable: `${PREFIX}${variablePart(id)}__${path.map(step => step === '*' ? '<key>' : step).join('__')}`
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
};
