import { expect } from 'chai';
import { validate } from '../src/index.js';
import { errorIsKindOf, errorTypeOf, isKindOfError } from '../src/error-types.js';
import { bootWith, element, kind, operation } from './helpers.js';

const registered = (id, value) => ({ id, kind: 'slot-fill', data: { target: 'error-registry', slot: 'errorTypes', value } });

const problemsOf = async (...fills) => {
    await bootWith(fills);
    return validate().filter(({ data }) => data.element === 'default-error-registry').flatMap(({ data }) => data.messages);
};

describe('error types', () => {
    it('knows the codes of the core', async () => {
        await bootWith([]);
        expect(['invalid', 'unauthorized', 'forbidden', 'not-found', 'conflict', 'unavailable'].map(code => errorTypeOf(code).http))
            .to.deep.equal([400, 401, 403, 404, 409, 503]);
    });

    it('answers a private operation reached from outside as forbidden', async () => {
        await bootWith([]);
        expect(errorTypeOf('private-operation')).to.deep.equal({ http: 403, transient: false, outage: false });
    });

    it('takes the properties of the parent, overridden by the child', async () => {
        await bootWith([
            registered('stale-error', { code: 'stale', extends: 'conflict', transient: true }),
            registered('state-refused-error', { code: 'state-refused', extends: 'conflict' })
        ]);
        expect(errorTypeOf('stale')).to.deep.equal({ http: 409, transient: true, outage: false });
        expect(errorTypeOf('state-refused')).to.deep.equal({ http: 409, transient: false, outage: false });
    });

    it('tells whether a code is a kind of another, through its parents and itself', async () => {
        await bootWith([registered('state-refused-for-test', { code: 'refused-for-test', extends: 'conflict' })]);
        expect(['refused-for-test', 'conflict', 'invalid'].map(ancestor => isKindOfError('refused-for-test', ancestor))).to.deep.equal([true, true, false]);
        expect(['refused-for-test', 'conflict', 'invalid'].map(ancestor => errorIsKindOf({ code: 'refused-for-test', ancestor }))).to.deep.equal([true, true, false]);
        expect(errorIsKindOf({ code: 'nobody-registered-this', ancestor: 'nobody-registered-this' })).to.equal(false);
    });

    it('treats an unregistered code, and a foreign failure of a low module, as a terminal 500', async () => {
        await bootWith([]);
        expect(errorTypeOf('nobody-registered-this')).to.deep.equal({ http: 500, transient: false, outage: false });
        expect(errorTypeOf('low-failed')).to.deep.equal({ http: 500, transient: false, outage: false });
    });

    it('marks an outage as transient', async () => {
        await bootWith([]);
        expect(errorTypeOf('unavailable')).to.deep.equal({ http: 503, transient: true, outage: true });
    });

    it('reports nothing for the registry of the core', async () => {
        expect(await problemsOf()).to.deep.equal([]);
    });

    it('reports a literal throw of a code that no package registers, and nothing for a registered or a computed one', async () => {
        await bootWith([
            kind('thrower', { operations: {
                known: operation({ throw: { code: 'conflict', message: 'taken' } }),
                unknown: operation({ throw: { code: 'nobody-registered-this', message: 'no' } }),
                computed: operation({ throw: { code: '#.input.code', message: 'raised' } }),
                text: operation({ throw: 'broken' })
            } }),
            element('the-thrower', 'thrower')
        ]);
        expect(validate().map(({ code, message }) => [code, message])).to.deep.equal([
            ['unknown-error-code', "thrower operations.unknown.implementation: throws 'nobody-registered-this', which no package registers"]
        ]);
    });

    it('reports a code registered twice', async () => {
        expect(await problemsOf(registered('another-conflict', { code: 'conflict', http: 409 }))).to.include("the error code 'conflict' is registered twice");
    });

    it('reports a parent no package registers', async () => {
        expect(await problemsOf(registered('orphan-error', { code: 'orphan', extends: 'nobody' }))).to.include("the error code 'orphan' extends 'nobody', which no package registers");
    });

    it('reports a cycle of parents', async () => {
        const problems = await problemsOf(registered('ping-error', { code: 'ping', extends: 'pong' }), registered('pong-error', { code: 'pong', extends: 'ping' }));
        expect(problems.filter(message => message.includes('extends itself'))).to.have.length(2);
    });

    it('reports an outage that is not transient, a status outside 400-599 and a code that is no id', async () => {
        const problems = await problemsOf(
            registered('limp-error', { code: 'limp', outage: true }),
            registered('cheerful-error', { code: 'cheerful', http: 200 }),
            registered('shouting-error', { code: 'SHOUTING' })
        );
        expect(problems).to.include.members([
            "the error code 'limp' is an outage but not transient",
            "the error code 'cheerful' has the status 200, outside 400-599",
            "'SHOUTING' isn't a valid error code: lowercase letters and digits in segments separated by '-'"
        ]);
    });
});
