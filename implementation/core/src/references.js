import { findElement, memo } from './registry.js';
import { instancesOf, isInstanceOf } from './kinds.js';
import { fail } from './errors.js';

export const isKindReference = value => typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 1 && typeof value.instanceOf === 'string';

const bindingOf = abstraction => {
    const bindings = instancesOf('binding').filter(binding => binding.data.abstraction === abstraction);
    if (bindings.length > 1) fail('ambiguous-binding', `${abstraction} is bound more than once`, { abstraction });
    return bindings[0]?.data.instance;
};

const onlyInstanceOf = abstraction => {
    const ids = instancesOf(abstraction).map(element => element.id).filter(id => id !== undefined);
    if (ids.length === 0) fail('no-instance', `no instance of ${abstraction}`, { abstraction });
    if (ids.length > 1) fail('ambiguous-reference', `${abstraction} has several instances (${ids.join(', ')}) and no binding`, { abstraction, instances: ids });
    return ids[0];
};

export const checkAbstraction = ({ instanceOf: abstraction }) => {
    if (findElement(abstraction)?.kind !== 'kind') fail('unknown-kind', `instanceOf names '${abstraction}', which is not a kind`, { abstraction });
};

const instanceFor = memo(abstraction => {
    checkAbstraction({ instanceOf: abstraction });
    return bindingOf(abstraction) ?? onlyInstanceOf(abstraction);
});

export const resolveReference = reference => {
    if (typeof reference === 'string') return reference;
    if (isKindReference(reference)) return instanceFor(reference.instanceOf);
    return fail('invalid-reference', 'an element reference is an id or { instanceOf: <kind> }', { reference });
};

export const checkBinding = ({ data: { abstraction, instance } }) => {
    if (findElement(abstraction)?.kind !== 'kind' || !findElement(instance)) return;
    if (!isInstanceOf({ element: instance, kind: abstraction })) {
        fail('invalid-binding', `${instance} bound to ${abstraction} is not an instance of it`, { abstraction, instance });
    }
};
