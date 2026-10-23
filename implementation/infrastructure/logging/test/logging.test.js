import { expect } from 'chai';
import { boot, invoke, packageElements, validate } from '@business-framework/core';

const captured = { stdout: [], stderr: [] };
const originals = { stdout: process.stdout.write, stderr: process.stderr.write };

const capture = () => {
    captured.stdout = [];
    captured.stderr = [];
    process.stdout.write = line => captured.stdout.push(line);
    process.stderr.write = line => captured.stderr.push(line);
};

const release = () => {
    process.stdout.write = originals.stdout;
    process.stderr.write = originals.stderr;
};

const lastEntry = stream => JSON.parse(captured[stream].at(-1));

const runner = implementation => [
    { id: 'runner', kind: 'kind', data: { operations: { run: { input: '@any', implementation } } } },
    { id: 'the-runner', kind: 'runner', data: {} }
];

const run = async implementation => {
    await boot({ paths: [packageElements('@business-framework/logging')], elements: runner(implementation) });
    capture();
    try {
        return await invoke('the-runner', 'run', null);
    } finally {
        release();
    }
};

describe('logging', () => {
    it('validates', async () => {
        await boot({ paths: [packageElements('@business-framework/logging')] });
        expect(validate()).to.deep.equal([]);
    });

    it('writes a JSON line with timestamp, level info and message to stdout', async () => {
        await run({ log: 'hello' });
        expect(lastEntry('stdout')).to.include({ level: 'info', message: 'hello' }).and.to.have.property('timestamp');
    });

    it('merges context fields without overriding the standard ones', async () => {
        await run({ log: 'x', level: 'warn', context: { orderId: 7, level: 'debug' } });
        expect(lastEntry('stdout')).to.include({ orderId: 7, level: 'warn', message: 'x' });
    });

    it('computes message and context from the node input', async () => {
        await run({ inputMap: { id: '\\o-1' }, log: { $join: { _strings: ['order ', '#.input.id'] } }, context: { orderId: '#.input.id' } });
        expect(lastEntry('stdout')).to.include({ message: 'order o-1', orderId: 'o-1' });
    });

    it('writes error and fatal to stderr', async () => {
        await run([{ log: 'bad', level: 'error' }, { log: 'worse', level: 'fatal' }]);
        expect(captured.stdout).to.have.length(0);
        expect(captured.stderr.map(line => JSON.parse(line).message)).to.deep.equal(['bad', 'worse']);
    });

    it('returns null and lets the pipeline continue', async () => {
        expect(await run([{ outputKey: 'logged', log: 'step' }, { set: { logged: '#.logged', done: true } }]))
            .to.deep.equal({ logged: null, done: true });
    });

    it('rejects an unknown level', async () => {
        const error = await run({ log: 'x', level: 'loud' }).catch(e => e);
        expect(error.code).to.equal('invalid');
    });
});
