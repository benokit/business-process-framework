import { getElement } from '../registry.js';
import { resolveKind, selfOf } from '../kinds.js';
import { check, resolveReferencesIn } from '../schemas.js';
import { fail, framing } from '../errors.js';
import { resolveReference } from '../references.js';
import { runMethod } from './pipeline.js';
import { stubOf } from './interpreter.js';

export const contractId = (owner, operation, part) => `${owner}/${operation}/${part}`;

export const invoke = async (reference, operationName, input, _ctx = Object.freeze({}), caller = undefined) => {
    const elementId = resolveReference(reference);
    const self = selfOf(getElement(elementId));
    const operation = resolveKind(self.kind).operations[operationName]
        ?? fail('unknown-operation', `${elementId} has no operation '${operationName}'`, { element: elementId, operation: operationName });
    const where = `${elementId}.${operationName}`;
    if (operation.private && caller?.id !== elementId) {
        fail('private-operation', `${where} is private to ${elementId}`, { element: elementId, operation: operationName });
    }
    const stub = stubOf(self, operationName);
    if (operation.implementation === undefined && stub === undefined) {
        fail('unimplemented-operation', `${where} is declared by ${operation.owner} and not implemented`, { element: elementId, operation: operationName });
    }
    return framing.around(async () => {
        const inputContract = contractId(operation.owner, operationName, 'input');
        check(inputContract, input, where);
        const resolved = resolveReferencesIn({ schemaId: inputContract, value: input, resolve: resolveReference });
        const output = await (stub ? stub({ input: resolved, _ctx }) : runMethod(operation.implementation, { input: resolved, self, _ctx, operation: operationName }));
        if (operation.output !== undefined) check(contractId(operation.owner, operationName, 'output'), output, where);
        return output;
    }, where);
};
