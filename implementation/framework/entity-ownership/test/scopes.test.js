import { expect } from 'chai';
import { boot, packageElements, start, stop, validate } from '@business-framework/core';
import { applyMapping } from '@business-framework/core/mappings';
import { explanationsOf } from '@business-framework/core/introspection';

const run = Date.now();
const REGIONAL = `regional-${run}`;
const CONTRACT = `contract-${run}`;

const scope = (id, filter) => ({ id: `${id}-${run}`, kind: 'ownership-scope', data: { filter } });

const region = (operator, value) => ({ [operator]: ['#.ownership.region', value] });

const elements = [
    {
        id: REGIONAL,
        kind: 'kind',
        data: { extends: 'entity-type', fixed: { traits: { ownership: { configuration: { dimensions: { '!region': 'string', 'departments[]': 'string', level: 'integer' } } } } } }
    },
    {
        id: CONTRACT,
        kind: REGIONAL,
        data: {
            traits: {
                body: { configuration: { schema: { '!region': 'string', '*': 'never' } } },
                ownership: { configuration: { rule: { region: '#.data.body.region', level: '#.data.body.missing', departments: ['#.data.nothing.team'], size: 3 } } }
            }
        }
    },
    { id: 'principal-claims', kind: 'schema', data: { 'region': 'string', 'regions[]': 'string', 'level': 'integer' } },
    scope('german', region('$eq', 'de')),
    scope('own-region', region('$eq', '#.principal.region')),
    scope('region-claims', { $includes: { collection: '#.principal.regions', value: '#.ownership.region' } }),
    scope('auditing', { $and: [{ $includes: { collection: '#.principal.roles', value: 'auditor' } }, region('$eq', 'de')] }),
    scope('no-claim', region('$eq', '#.principal.nothing')),
    scope('array-claim', region('$eq', '#.principal.regions')),
    scope('claim-type', { $eq: ['#.ownership.level', '#.principal.region'] }),
    scope('scalar-claim', { $includes: { collection: '#.principal.region', value: '#.ownership.region' } }),
    scope('motor', { $includes: { collection: '#.ownership.departments', value: 'motor' } }),
    scope('nordic', { $includes: { collection: ['dk', 'se'], value: '#.ownership.region' } }),
    scope('senior', { $and: [{ $not: region('$eq', 'fr') }, { $eq: ['#.ownership.level', 3] }] }),
    scope('ordered', { $lt: ['#.ownership.level', 3] }),
    scope('shouting', region('$eq', 'DE')),
    scope('unknown', { $eq: ['#.ownership.country', 'de'] }),
    scope('compared-array', { $eq: ['#.ownership.departments', 'motor'] }),
    scope('wrong-type', region('$eq', 7)),
    scope('not-an-array', { $includes: { collection: '#.ownership.region', value: 'de' } }),
    scope('two-dimensions', { $eq: ['#.ownership.region', '#.ownership.departments'] })
];

const packages = ['security', 'integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-ownership'];

describe('ownership scopes', function () {
    before(async () => {
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
    });

    after(stop);

    it('reports a rule and a scope that do not fit the dimensions and accepts the rest', () => {
        const problems = validate().map(({ message }) => message);
        const about = name => problems.filter(message => message.includes(`${name}-${run}`));
        expect(['german', 'motor', 'nordic', 'senior', 'own-region', 'region-claims', 'auditing'].flatMap(about)).to.deep.equal([]);
        expect(about('no-claim')[0]).to.include("'#.principal.nothing' is not a property of the principal");
        expect(about('array-claim')[0]).to.include("'#.principal.regions' is an array: ask whether it includes a value");
        expect(about('claim-type')[0]).to.include("'#.principal.region' is a string, not a integer");
        expect(about('scalar-claim')[0]).to.include("'#.principal.region' is not an array");
        expect(about('ordered')[0]).to.include('is not a $eq, $neq, $includes, $and, $or or $not');
        expect(about('shouting')[0]).to.include("'DE' has uppercase letters");
        expect(about('unknown')[0]).to.include("'#.ownership.country' is not a dimension of the ownership");
        expect(about('compared-array')[0]).to.include('is an array: ask whether it includes a value');
        expect(about('wrong-type')[0]).to.include('7 is not a string');
        expect(about('not-an-array')[0]).to.include('is not an array');
        expect(about('two-dimensions')[0]).to.include('needs one dimension and one value');
        const [rule] = problems.filter(message => message.includes('the ownership rule'));
        ["'missing' is not a property", "'nothing' is not a property", "gives 'size', which is not a dimension"].forEach(fragment => expect(rule).to.include(fragment));
    });

    it('explains the entity types a scope applies to, and the scopes of an entity type', () => {
        expect(explanationsOf(`german-${run}`)).to.deep.equal({
            ownership: { dimensions: ['region'], entityTypes: [CONTRACT] }
        });
        const { ownership } = explanationsOf(CONTRACT);
        expect(ownership.dimensions).to.deep.equal({ region: 'string', departments: 'string[]', level: 'integer' });
        expect(ownership.scopes).to.include(`german-${run}`).and.not.include(`unknown-${run}`);
    });

    it('selects records by running the filter on their ownership', () => {
        const german = elements.find(({ id }) => id === `german-${run}`).data.filter;
        expect([{ region: 'de' }, { region: 'fr' }, {}].map(ownership => applyMapping({ mapping: german, input: { ownership } }))).to.deep.equal([true, false, false]);
    });
});
