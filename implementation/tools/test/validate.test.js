import { expect } from 'chai';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { validateApplication } from '@business-framework/tools';

const DEMO = fileURLToPath(new URL('../../../demo', import.meta.url));
const BROKEN = fileURLToPath(new URL('./fixtures/broken', import.meta.url));
const BPF = fileURLToPath(new URL('../src/bpf.js', import.meta.url));

describe('validate', () => {
    it('accepts the installed packages with the demo', async () => {
        expect(await validateApplication({ paths: [DEMO] })).to.deep.equal([]);
    });

    it('reports shape and slot problems', async () => {
        const codes = (await validateApplication({ paths: [BROKEN] })).map(problem => problem.code);
        expect(codes).to.have.members(['invalid-element', 'unknown-slot']);
    });

    it('exits non-zero from the command line on problems', async () => {
        const error = await promisify(execFile)('node', [BPF, 'validate', BROKEN]).catch(e => e);
        expect([error.code, error.stdout]).to.satisfy(([code, stdout]) => code === 1 && stdout.includes('unknown-slot'));
    });
});
