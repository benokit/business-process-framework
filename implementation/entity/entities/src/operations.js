import { extendsKind, instancesOf, resolveKind } from '@business-framework/core/kinds';

const publicOperationsOf = ({ id }) => Object.entries(resolveKind(id).operations)
    .filter(([, operation]) => !operation.private)
    .map(([name]) => name);

export const entityOperationNames = () => [...new Set(instancesOf('kind')
    .filter(({ id }) => extendsKind(id, 'entity-type'))
    .flatMap(publicOperationsOf))].sort();
