import { uniq } from 'lodash-es';
import { schemaRef, storedSchema } from './schemas.js';

export const isFilterable = declaration => declaration.cardinality === 'many' && declaration.discriminator !== undefined;

const branchesOf = schema => {
    if (schema === undefined) return [];
    if (typeof schema.$ref === 'string') return branchesOf(storedSchema(schema.$ref));
    const parts = schema.oneOf ?? schema.anyOf;
    return parts ? parts.flatMap(branchesOf) : [schema];
};

export const valuesOf = (branch, discriminator) => {
    const { const: fixed, enum: allowed } = branch.properties?.[discriminator] ?? {};
    return fixed !== undefined ? [fixed] : allowed ?? [];
};

export const domainOf = (declaration, slot) => uniq(
    branchesOf(storedSchema(schemaRef(`${declaration.owner}/slots/${slot}/input`)))
        .flatMap(branch => valuesOf(branch, declaration.discriminator)));
