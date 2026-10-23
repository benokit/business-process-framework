import { expect } from 'chai';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { bootApplication, explain, vocabulary } from '@business-framework/tools';

const DEMO = fileURLToPath(new URL('../../../demo', import.meta.url));
const BPF = fileURLToPath(new URL('../src/bpf.js', import.meta.url));

describe('discovery', () => {
    before(() => bootApplication({ paths: [DEMO] }));

    it('explains an instance with its kind chain, operations and slot fills in order', () => {
        const { kind, chain, source, operations, slots } = explain('construction');
        expect([kind, chain]).to.deep.equal(['insurance-contract-type', ['entity-type', 'insurance-contract-type']]);
        expect(source).to.match(/demo\/contracts\/construction\.eson$/);
        expect(operations.find(op => op.name === 'create')).to.include({ declaredBy: 'entity-type', implementedBy: 'entity-type' });
        expect(slots.find(slot => slot.name === 'reactions').fills.map(fill => fill.id))
            .to.deep.equal(['maintain-entity-relations', 'publish-entity-events', 'contract-activation-events']);
        expect(slots.find(slot => slot.name === 'businessKey').fills.map(fill => fill.id)).to.deep.equal(['construction-business-key']);
    });

    it('explains a kind with its instances and the kinds that implement abstract operations', () => {
        const { instances, operations } = explain('message-broker');
        expect(instances).to.deep.equal(['nats']);
        expect(operations.find(op => op.name === 'publish').implementedBy).to.equal(undefined);
        expect(explain('nats').operations.find(op => op.name === 'publish').implementedBy).to.equal('nats-broker');
    });

    it('lists node forms, templates, primitives and pure functions', () => {
        const { nodeForms, templates, primitives, pureFunctions } = vocabulary();
        expect(nodeForms).to.deep.include({ keyword: 'if', companions: ['then', 'else'] });
        expect(templates.map(template => template.keyword)).to.include('publish');
        expect(primitives).to.deep.include({ name: '$join', arguments: '{ _separator?, _strings=# }' });
        expect(pureFunctions.map(fn => fn.name)).to.include('$func/slot-values');
    });

    it('prints an explanation from the command line', async () => {
        const { stdout } = await promisify(execFile)('node', [BPF, 'explain', 'entity-events']);
        expect(stdout).to.match(/^entity-events {2}message-channel/).and.to.include('publish: "@outgoing-message"');
    });
});
