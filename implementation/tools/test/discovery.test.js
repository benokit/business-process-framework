import { expect } from 'chai';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { bootApplication, explain, list, refs, vocabulary } from '@business-framework/tools';

const DEMO = fileURLToPath(new URL('../../../demo', import.meta.url));
const BPF = fileURLToPath(new URL('../src/bpf.js', import.meta.url));

describe('discovery', () => {
    before(() => bootApplication({ paths: [DEMO] }));

    it('explains an instance with its kind chain, operations and slot fills in order', () => {
        const { kind, chain, source, operations, slots } = explain('construction');
        expect([kind, chain]).to.deep.equal(['insurance-contract-type', ['entity-type', 'versioned-entity-type', 'insurance-contract-type']]);
        expect(source).to.match(/demo\/contracts\/construction\.eson$/);
        expect(operations.find(op => op.name === 'create')).to.include({ declaredBy: 'entity-type', implementedBy: 'entity-type' });
        expect(slots.find(slot => slot.name === 'reactions').fills.map(fill => fill.id))
            .to.deep.equal(['refuse-uncovered-results', 'maintain-entity-relations', 'publish-entity-events', 'contract-activation-events']);
        expect(slots.find(slot => slot.name === 'businessKey').fills.map(fill => fill.id)).to.deep.equal(['construction-business-key']);
    });

    it('explains the effects of each operation of an instance, with a trace', () => {
        const effectsOf = (id, name) => explain(id).operations.find(op => op.name === name).effects;
        expect(Object.keys(effectsOf('entities', 'read'))).to.include('read');
        expect(effectsOf('contract-events', 'publish').irreversible).to.match(/^default-transactional-outbox\.put > afterCommit > /);
    });

    it('explains what packages add: the actors and roles that may call an endpoint', () => {
        const { roles, actors } = explain('entity-transition-endpoint').explanations.authorization;
        expect([actors['underwriter-actor'], roles['underwriter-role'], roles['administrator-role']]).to.deep.equal(['some', 'some', 'all']);
    });

    it('explains a kind with its instances and the kinds that implement abstract operations', () => {
        const { instances, operations } = explain('message-broker');
        expect(instances).to.deep.equal(['default-nats-broker']);
        expect(operations.find(op => op.name === 'publish').implementedBy).to.equal(undefined);
        expect(explain('default-nats-broker').operations.find(op => op.name === 'publish').implementedBy).to.equal('nats-broker');
    });

    it('lists node forms, templates, primitives and pure functions', () => {
        const { nodeForms, templates, primitives, pureFunctions } = vocabulary();
        expect(nodeForms).to.deep.include({ keyword: 'if', companions: ['then', 'else'] });
        expect(templates.map(template => template.keyword)).to.include('publish');
        expect(primitives).to.deep.include({ name: '$join', arguments: '{ separator?: string, strings=#: array } -> string' });
        expect(pureFunctions.map(fn => fn.name)).to.include('$func/slot-values');
    });

    it('finds the references to an element in data, invocations, template nodes and function calls', () => {
        const found = reference => refs(reference).map(({ element, path, via }) => `${element} ${path} ${via}`);
        expect(found('user-cache')).to.deep.equal([
            'authenticate implementation[3].else[0].cache ref',
            'user-cache-eviction handler.invoke invoke'
        ]);
        expect(found('publish')).to.include('contract-activation-events value.then.then template');
        expect(found('slot-values')).to.include('maintain-entity-relations value.then[1].inputMap function');
        expect(found('insurance-contract-type')).to.include('construction kind kind');
        expect(() => refs('nope')).to.throw('nope');
    });

    it('lists the instances of a kind and its subkinds', () => {
        expect(list('message-channel').map(element => element.id)).to.have.members(['entity-events', 'contract-events']);
        expect(list('entity-type').map(element => element.id)).to.include.members(['user', 'construction']);
    });

    it('prints an explanation from the command line', async () => {
        const { stdout } = await promisify(execFile)('node', [BPF, 'explain', 'entity-events']);
        expect(stdout).to.match(/^entity-events {2}message-channel/).and.to.include('publish: "@outgoing-message"');
    });
});
