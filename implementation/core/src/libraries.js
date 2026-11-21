import { compileModule } from 'lambdajson-js';
import { mapValues } from 'lodash-es';
import { instancesOf, selfAt } from './kinds.js';

export const libraries = () => instancesOf('function-library')
    .filter(({ id }) => id !== undefined)
    .map(element => ({ id: element.id, ...selfAt(element, 'function-library').data }));

export const inDependencyOrder = (all, build) => {
    const built = {};
    const failures = {};
    let pending = all;
    while (pending.length > 0) {
        const retry = pending.filter(library => {
            try {
                built[library.id] = build(library, built);
                delete failures[library.id];
                return false;
            } catch (error) {
                failures[library.id] = error;
                return true;
            }
        });
        if (retry.length === pending.length) break;
        pending = retry;
    }
    return { built, failures };
};

export const compileLibraries = ({ primitives, wrap }) => inDependencyOrder(libraries(), ({ id, functions, exports, signatures = {} }, modules) =>
    mapValues(compileModule({ functions, exports }, { primitives, modules }), (member, name) =>
        signatures[name] === undefined ? member : wrap({ id, name, member, signature: signatures[name] })));
