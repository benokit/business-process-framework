import { expect } from 'chai';
import { applyMapping } from '@business-framework/core/mappings';
import { bindPrincipal } from '../src/ownership.js';

const REGION = '#.ownership.region';
const DEPARTMENTS = '#.ownership.departments';

const filters = {
    'a dimension is a claim': { $eq: [REGION, '#.principal.region'] },
    'a dimension differs from a claim': { $neq: [REGION, '#.principal.region'] },
    'a dimension is one of the claims': { $includes: { collection: '#.principal.regions', value: REGION } },
    'an array dimension holds a claim': { $includes: { collection: DEPARTMENTS, value: '#.principal.department' } },
    'an owner is the user': { $eq: ['#.ownership.owner', '#.principal.userId'] },
    'a claim decides': { $and: [{ $includes: { collection: '#.principal.roles', value: 'auditor' } }, { $eq: [REGION, 'de'] }] },
    'a claim or a dimension': { $or: [{ $eq: ['#.principal.region', 'fr'] }, { $eq: [REGION, '#.principal.region'] }] },
    'not': { $not: { $eq: [REGION, '#.principal.region'] } }
};

const principals = [
    { userId: 'ada', roles: ['auditor'], region: 'de', regions: ['de', 'it'], department: 'motor' },
    { userId: 'bo', roles: [], region: 'fr', regions: [] },
    { userId: 'cy' },
    { userId: 'di', region: 'DE', regions: ['DE', 'fr'], department: '#.ownership.region' },
    { userId: 'ed', region: ['de', 'fr'], regions: 'de' },
    { userId: 'fy', region: '#.ownership.region', department: '\\#x' }
];

const ownerships = [{ region: 'de', departments: ['motor'], owner: 'ada' }, { region: 'fr', departments: [], owner: 'bo' }, { region: '#.ownership.region' }, {}];

const covers = (bound, ownership) => typeof bound === 'boolean' ? bound : applyMapping({ mapping: bound, input: { ownership } });

describe('binding a principal to a filter', () => {
    Object.entries(filters).forEach(([name, filter]) => it(`selects what the filter selects with the principal in reach: ${name}`, () => {
        principals.slice(0, 3).forEach(principal => {
            const bound = bindPrincipal(filter, principal);
            expect(JSON.stringify(bound)).to.not.include('#.principal');
            ownerships.slice(0, 2).forEach(ownership => {
                expect(covers(bound, ownership), `${JSON.stringify(principal)} on ${JSON.stringify(ownership)}`)
                    .to.equal(Boolean(applyMapping({ mapping: filter, input: { ownership, principal } })));
            });
        });
    }));

    it('does not match a missing claim with a missing dimension', () => {
        const bound = bindPrincipal(filters['a dimension is a claim'], principals[2]);
        expect(covers(bound, {})).to.equal(false);
        expect(covers(bindPrincipal(filters['not'], principals[2]), {})).to.equal(true);
    });

    it('folds what no dimension decides into a constant', () => {
        expect(bindPrincipal(filters['a claim decides'], principals[0])).to.deep.equal({ $eq: [REGION, 'de'] });
        expect(bindPrincipal(filters['a claim decides'], principals[1])).to.equal(false);
        expect(bindPrincipal(filters['a claim or a dimension'], principals[1])).to.equal(true);
        expect(bindPrincipal(filters['a dimension is a claim'], principals[2])).to.equal(false);
        expect(bindPrincipal(filters['a dimension differs from a claim'], principals[2])).to.equal(true);
    });

    it('takes a claim as a value and never as code, and a claim with uppercase letters or of another shape matches nothing', () => {
        const [, , , uppercase, shaped, code] = principals;
        const nothing = [uppercase, shaped, code].map(principal => bindPrincipal(filters['a dimension is a claim'], principal));
        expect(nothing).to.deep.equal([false, false, { $eq: [REGION, '\\#.ownership.region'] }]);
        expect(covers(nothing[2], { region: '#.ownership.region' })).to.equal(true);
        expect(covers(nothing[2], { region: 'de' })).to.equal(false);
        expect(bindPrincipal(filters['a dimension is one of the claims'], uppercase)).to.deep.equal({ $includes: { collection: ['fr'], value: REGION } });
        expect(bindPrincipal(filters['an array dimension holds a claim'], code)).to.deep.equal({ $includes: { collection: DEPARTMENTS, value: '\\\\#x' } });
    });
});
