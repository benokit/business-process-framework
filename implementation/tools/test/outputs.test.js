import { expect } from 'chai';
import Ajv from 'ajv';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { bootApplication, explain, failure, list, outputSchemas, refs, vocabulary } from '@business-framework/tools';
import { validate } from '@business-framework/core';

const DEMO = fileURLToPath(new URL('../../../demo', import.meta.url));
const BPF = fileURLToPath(new URL('../src/bpf.js', import.meta.url));

const conforms = (schema, value) => {
    const check = new Ajv({ strict: false }).compile(schema);
    return check(value) || check.errors;
};

const bpf = (...args) => promisify(execFile)('node', [BPF, ...args]);

const pipe = (input, ...args) => new Promise((resolve, reject) => {
    const child = spawn('node', [BPF, ...args]);
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`exit ${code}`)));
    child.stdin.end(input);
});

describe('output contracts', () => {
    before(() => bootApplication({ paths: [DEMO] }));

    it('are met by what the commands return', () => {
        expect(conforms(outputSchemas.explain, JSON.parse(JSON.stringify(explain('construction'))))).to.equal(true);
        expect(conforms(outputSchemas.explain, JSON.parse(JSON.stringify(explain('insurance-contract-type'))))).to.equal(true);
        expect(conforms(outputSchemas.list, list('entity-type'))).to.equal(true);
        expect(conforms(outputSchemas.refs, JSON.parse(JSON.stringify(refs('clock'))))).to.equal(true);
        expect(conforms(outputSchemas.vocabulary, JSON.parse(JSON.stringify(vocabulary())))).to.equal(true);
        expect(conforms(outputSchemas.validate, validate({ warnings: true }))).to.equal(true);
    });

    it('describe a trace with nested spans and an error', () => {
        const span = { label: 'a', children: [{ label: 'b', children: [], ms: 1.5, effects: ['read'] }], error: 'conflict' };
        expect(conforms(outputSchemas.trace, { error: { code: 'conflict', message: 'no' }, spans: [span] })).to.equal(true);
        expect(conforms(outputSchemas.trace, { spans: [{ label: 'a' }] })).to.not.equal(true);
    });

    it('are printed by `schema` and read back by `render`', async () => {
        expect(JSON.parse((await bpf('schema', 'list')).stdout)).to.deep.equal(outputSchemas.list);
        const json = (await bpf('list', 'entity-type', DEMO, '--json')).stdout;
        const text = (await bpf('list', 'entity-type', DEMO)).stdout;
        expect(await pipe(json, 'render', 'list')).to.equal(text);
    });

    it('report a failure as JSON on stderr with --json, leaving stdout empty', async () => {
        const error = await bpf('explain', 'nothing', DEMO, '--json').catch(e => e);
        expect([error.code, error.stdout]).to.deep.equal([1, '']);
        expect(JSON.parse(error.stderr)).to.deep.equal({ code: 'unknown-element', message: "unknown element 'nothing'", data: { id: 'nothing' } });
        expect(conforms(failure, JSON.parse(error.stderr))).to.equal(true);
    });
});
