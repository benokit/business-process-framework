import { expect } from 'chai';
import { boot, packageElements, stop, validate } from '@business-framework/core';
import { traitsOf } from '@business-framework/entities/traits';

const run = Date.now();
const BUNDLE = `bundle-${run}`;
const PLAIN = `plain-${run}`;
const CONFIGURED = `configured-${run}`;
const CLASH = `clash-${run}`;
const UNKNOWN = `unknown-${run}`;

const elements = [
    { id: BUNDLE, kind: 'trait-bundle', data: { traits: { body: { configuration: { schema: { '!note': 'string' } } } } } },
    { id: PLAIN, kind: 'body-entity-type', data: { bundles: { [BUNDLE]: true } } },
    { id: CONFIGURED, kind: 'body-entity-type', data: { bundles: { [BUNDLE]: true }, traits: { body: { configuration: { required: ['note'] } } } } },
    { id: CLASH, kind: 'body-entity-type', data: { bundles: { [BUNDLE]: true }, traits: { body: { configuration: { schema: { '!note': 'number' } } } } } },
    { id: UNKNOWN, kind: 'body-entity-type', data: { bundles: { [`${BUNDLE}-missing`]: true }, traits: { body: { configuration: { schema: {} } } } } }
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql'].map(name => `@business-framework/${name}`);

const problemsOf = type => validate().filter(problem => JSON.stringify(problem).includes(type)).map(problem => problem.message);

describe('trait bundles', function () {
    before(() => boot({ paths: packages.map(packageElements), elements }));

    after(stop);

    it('gives an entity type the trait uses of the bundles it names', () => {
        expect(traitsOf(PLAIN).body.configuration).to.deep.equal({ schema: { '!note': 'string' } });
    });

    it('lets the entity type add paths to a use of a bundle, as to any use', () => {
        expect(traitsOf(CONFIGURED).body.configuration).to.deep.equal({ schema: { '!note': 'string' }, required: ['note'] });
    });

    it('reports a path the entity type gives another value than the bundle', () => {
        expect(problemsOf(CLASH).join('\n')).to.include(`trait 'body': ${CLASH} can't change the value at 'configuration.schema.!note'`);
    });

    it('reports a bundle that is no trait bundle', () => {
        expect(problemsOf(UNKNOWN).join('\n')).to.include('no trait bundle');
    });
});
