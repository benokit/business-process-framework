import { expect } from 'chai';
import { recordKeysRead, unlistedReadProblems } from '../src/dependencies.js';

describe('dependencies', () => {
    it('lists the keys of the record a mapping reads, wherever the path is written', () => {
        const mapping = { region: '#.data.body.region', flag: { $coalesce: ['#.data.body.flag', { $if: [{ $eq: ['#.data.state.status', 'x'] }, '#.data.business-key', 'y'] }] }, other: '#.entityType', escaped: '\\#.data.nothing' };
        expect(recordKeysRead(mapping)).to.deep.equal(['body', 'business-key', 'state']);
    });

    it('reports a key a mapping reads that the list lacks, and nothing for an empty list, which always runs', () => {
        const mappings = { a: '#.data.body.x', b: '#.data.state.y' };
        const problems = dependsOn => unlistedReadProblems({ entityType: 'order', key: 'ownership', dependsOn, rule: 'ownership rule', mappings });
        expect(problems(['body'])).to.deep.equal(["order: the ownership rule of 'ownership' reads 'state', which dependsOn doesn't list"]);
        expect(problems(['body', 'state'])).to.deep.equal([]);
        expect(problems([])).to.deep.equal([]);
    });
});
