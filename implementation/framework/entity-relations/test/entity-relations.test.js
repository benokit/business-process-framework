import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';

const run = Date.now();
const PARTY = `party-${run}`;
const CONTRACT = `contract-${run}`;

const elements = [
    { id: PARTY, kind: 'entity-type', data: { bodySchema: { '!name': 'string' } } },
    { id: CONTRACT, kind: 'entity-type', data: { bodySchema: { '!holder': 'string', broker: 'string' } } },
    { id: `holder-${run}`, kind: 'slot-fill', data: { target: CONTRACT, slot: 'relations', value: { set: { relations: [{ targetEntityType: PARTY, targetEntityBusinessKey: '#.input.data.body.holder', relationType: 'holder' }] } } } },
    {
        id: `broker-${run}`,
        kind: 'slot-fill',
        data: {
            target: CONTRACT,
            slot: 'relations',
            value: {
                if: '#.input.data.body.broker',
                then: { set: { relations: [{ targetEntityType: PARTY, targetEntityBusinessKey: '#.input.data.body.broker', relationType: 'broker' }] } },
                else: { set: { relations: [] } }
            }
        }
    }
];

const packages = ['database', 'postgresql', 'transaction', 'entities', 'entity-relations'];

const relationsOf = async contract => (await invoke('entity-relation-database', 'relationsOf', { sourceEntityId: contract.id })).map(relation => relation.relationType).sort();

describe('entity-relations', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await Promise.all(['ada', 'bob'].map(name => invoke(PARTY, 'create', { businessKey: name, body: { name } })));
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('maintains relations from all rules on create and update', async () => {
        const created = await invoke(CONTRACT, 'create', { businessKey: 'c-1', body: { holder: 'ada', broker: 'bob' } });
        expect(await relationsOf(created)).to.deep.equal(['broker', 'holder']);
        const updated = await invoke(CONTRACT, 'update', { businessKey: 'c-1', revision: 1, body: { holder: 'bob' } });
        expect(await relationsOf(updated)).to.deep.equal(['holder']);
    });

    it('rolls the write back when a target is missing', async () => {
        const error = await invoke(CONTRACT, 'create', { businessKey: 'c-2', body: { holder: 'nobody' } }).catch(e => e);
        expect(error.code).to.equal('not-found');
        expect((await invoke(CONTRACT, 'read', { businessKey: 'c-2' }).catch(e => e)).code).to.equal('not-found');
    });
});
