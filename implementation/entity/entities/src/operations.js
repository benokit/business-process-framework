import { extendsKind, instancesOf, resolveKind } from '@business-framework/core/kinds';

const operationsOf = ({ id }) => Object.keys(resolveKind(id).operations);

const isEntityOperation = operation => operation.public === true || operation.output === '@trait-command';

const traitOperationsOf = ({ id }) => Object.entries(resolveKind(id).operations)
    .filter(([, operation]) => isEntityOperation(operation))
    .map(([name]) => name);

export const entityOperationNames = () => [...new Set([
    ...instancesOf('kind').filter(({ id }) => extendsKind(id, 'entity-type')).flatMap(operationsOf),
    ...instancesOf('kind').filter(({ id }) => extendsKind(id, 'entity-trait')).flatMap(traitOperationsOf)
])].sort();
