import { expect } from 'chai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateWorkspace } from '../src/validate-workspace.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = name => join(__dirname, 'fixtures', name);

describe('validateWorkspace', function () {
    it('returns no failures when all elements match their schema', async function () {
        const failures = await validateWorkspace([fixture('valid')]);
        expect(failures).to.be.an('array').that.is.empty;
    });

    it('returns a failure for each element whose data violates the schema', async function () {
        const failures = await validateWorkspace([fixture('invalid')]);
        expect(failures).to.have.length(1);
        const f = failures[0];
        expect(f.element.id).to.equal('vw-test-bad-car');
        expect(f.schemaId).to.equal('vw-test-car');
        expect(f.errors).to.be.an('array').with.length.greaterThan(0);
        expect(f.file).to.be.a('string').that.includes('elements.eson');
        expect(f.line).to.be.a('number');
    });

    it('skips elements with no matching schema', async function () {
        const failures = await validateWorkspace([fixture('no-schema')]);
        expect(failures).to.be.an('array').that.is.empty;
    });

    it('skips schema elements themselves', async function () {
        const failures = await validateWorkspace([fixture('schema-only')]);
        expect(failures).to.be.an('array').that.is.empty;
    });

    it('resolves schema by closest ancestor kind', async function () {
        const failures = await validateWorkspace([fixture('hierarchy')]);
        expect(failures).to.have.length(1);
        expect(failures[0].element.id).to.equal('vw-test-truck-bad');
        expect(failures[0].schemaId).to.equal('vw-test-vehicle');
    });

    it('skips elements that have no data property', async function () {
        const failures = await validateWorkspace([fixture('no-data')]);
        expect(failures).to.be.an('array').that.is.empty;
    });
});
