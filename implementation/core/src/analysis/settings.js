import { get, isPlainObject, uniq } from 'lodash-es';
import { allElements, findElement, getElement } from '../registry.js';
import { fail } from '../errors.js';
import { compose } from '../composition.js';
import { alternativesOf, hasSettings, itemsOf, layersOf, PREFIX, schemaOf, sections, settingsChecks, settingsKinds, typesOf, variablePart } from '../settings.js';

const PRIMITIVES = ['string', 'integer', 'number', 'boolean'];
const NAME = /^[A-Za-z][A-Za-z0-9]*$/;

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

const leafPaths = (tree, path = []) => isPlainObject(tree)
    ? Object.entries(tree).flatMap(([key, value]) => leafPaths(value, [...path, key]))
    : [path];

const knownPath = (known, path) => known.some(candidate => candidate.length === path.length
    && candidate.every((step, index) => step === '*' || step === path[index]));

const knownPathsOf = element => merged(settingsKinds(element).map(schemaOf).filter(Boolean).flatMap(schema => leavesOf(schema, [])))
    .map(({ path }) => path);

const warning = (code, message, data) => () => fail(code, message, { ...data, severity: 'warning' });

const layerIds = () => new Set(allElements().filter(hasSettings).flatMap(layersOf));

const unknownSettingChecks = () => {
    const ids = layerIds();
    const sectionChecks = Object.entries(sections()).flatMap(([id, section]) => {
        const element = findElement(id);
        if (!ids.has(id)) return [warning('unknown-settings-section', `the app-config section '${id}' matches no element with settings`, { layer: id })];
        const known = knownPathsOf(element);
        return leafPaths(section).filter(path => !knownPath(known, path)).map(path =>
            warning('unknown-setting', `the app-config section '${id}' sets '${path.join('.')}', which ${id} has no setting for`, { layer: id, path }));
    });
    const variableChecks = Object.keys(process.env).filter(name => name.startsWith(PREFIX)).flatMap(name => {
        const [part, ...path] = name.slice(PREFIX.length).split('__');
        const id = [...ids].find(candidate => variablePart(candidate) === part);
        if (id === undefined) return [warning('unknown-settings-variable', `${name} matches no element with settings`, { variable: name })];
        const known = knownPathsOf(findElement(id));
        return knownPath(known, path) ? [] : [warning('unknown-setting', `${name} sets '${path.join('.')}', which ${id} has no setting for`, { variable: name, path })];
    });
    return [...sectionChecks, ...variableChecks];
};

export const settingsProblems = () => [...shapeChecks(), ...settingsChecks(), ...unknownSettingChecks()];

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
