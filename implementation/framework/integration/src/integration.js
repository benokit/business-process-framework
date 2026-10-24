import { CoreError, findElement } from '@business-framework/core';
import { kindChain, selfOf, selvesOf } from '@business-framework/core/kinds';
import { resolveReference } from '@business-framework/core/references';
import { slotValues } from '@business-framework/core/slots';

const implementationFor = (implementations, kind) => kindChain(kind).map(({ id }) => id).reverse()
    .map(id => implementations.find(({ provider }) => provider === id))
    .find(Boolean);

const instance = (kind, id) => selvesOf(kind).find(self => self.id === id);

export const integrationImplementation = ({ integration, provider, implementations }) => {
    const { id, kind } = instance(provider, resolveReference({ instanceOf: provider }));
    const found = implementationFor(implementations, kind);
    if (!found) throw new CoreError('unimplemented-integration', `${integration} has no implementation for ${kind} (${id})`, { integration, provider: id, kind });
    return found.implementation;
};

export const providerImplementation = ({ provider, implementations }) =>
    implementationFor(implementations, selfOf(findElement(resolveReference(provider))).kind) ?? null;

export const integrationProblems = integration => {
    const { data: { provider } } = instance('integration', integration);
    const implementations = slotValues({ element: integration, slot: 'implementations' });
    return selvesOf(provider)
        .filter(({ kind }) => !implementationFor(implementations, kind))
        .map(({ id, kind }) => `no implementation for ${kind} (${id})`);
};
