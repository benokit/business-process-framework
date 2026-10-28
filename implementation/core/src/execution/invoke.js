import { getElement } from '../registry.js';
import { resolveKind, selfOf } from '../kinds.js';
import { check } from '../schemas.js';
import { fail, withFrame } from '../errors.js';
import { resolveReference } from '../references.js';
import { runMethod } from './pipeline.js';
import { stubOf } from './interpreter.js';

export const contractId = (owner, operation, part) => `${owner}/${operation}/${part}`;

export const invoke = async (reference, operationName, input, _ctx = Object.freeze({})) => {
    const elementId = resolveReference(reference);
    const self = selfOf(getElement(elementId));
    const operation = resolveKind(self.kind).operations[operationName]
        ?? fail('unknown-operation', `${elementId} has no operation '${operationName}'`, { element: elementId, operation: operationName });
    const where = `${elementId}.${operationName}`;
    const stub = stubOf(self, operationName);
    if (operation.implementation === undefined && stub === undefined) {
        fail('unimplemented-operation', `${where} is declared by ${operation.owner} and not implemented`, { element: elementId, operation: operationName });
    }
    return withFrame(async () => {
        check(contractId(operation.owner, operationName, 'input'), input, where);
        const output = await (stub ? stub({ input, _ctx }) : runMethod(operation.implementation, { input, self, _ctx }));
        if (operation.output !== undefined) check(contractId(operation.owner, operationName, 'output'), output, where);
        return output;
    }, where);
};
