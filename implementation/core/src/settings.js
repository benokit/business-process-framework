import { isPlainObject, set } from 'lodash-es';
import { allElements, getElement, kindOf, lazy, memo } from './registry.js';
import { fail } from './errors.js';
import { instancesOf, resolveKind } from './kinds.js';
import { compose } from './composition.js';
import { storedSchema, validateValue } from './schemas.js';

export const PREFIX = 'BPF__';

const chainOf = element => resolveKind(element.kind === 'kind' ? element.id : kindOf(element)).chain;

export const settingsKinds = element => chainOf(element).filter(kind => kind.data.settings !== undefined);

export const hasSettings = element => element.id !== undefined && element.kind !== 'kind' && settingsKinds(element).length > 0;

export const layersOf = element => [...resolveKind(kindOf(element)).ids, element.id];

export const variablePart = id => id.replaceAll('-', '_');

export const schemaOf = kind => storedSchema(`/${kind.id}/settings`);

export const alternativesOf = schema => [
    ...schema.$ref === undefined ? [] : [storedSchema(schema.$ref)],
    ...schema.allOf ?? [], ...schema.anyOf ?? [], ...schema.oneOf ?? []
].filter(isPlainObject);

const stepInto = (schema, key) => [
    ...alternativesOf(schema).flatMap(alternative => stepInto(alternative, key)),
    ...schema.properties?.[key] !== undefined ? [schema.properties[key]]
        : isPlainObject(schema.additionalProperties) ? [schema.additionalProperties] : []
];

export const typesOf = schema => [
    ...schema.type === undefined ? [] : [schema.type].flat(),
    ...schema.const === undefined ? [] : [typeof schema.const],
    ...schema.enum === undefined ? [] : schema.enum.map(value => typeof value),
    ...alternativesOf(schema).flatMap(typesOf)
];

export const itemsOf = schema => [
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

export const sections = lazy(() => compose(instancesOf('app-config').map(element => element.data)));

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

export const settingsChecks = () => allElements().filter(hasSettings).map(element => () => settingsOfElement(element.id));

export const checkSettings = () => settingsChecks().forEach(check => check());
