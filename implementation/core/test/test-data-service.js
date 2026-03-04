import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadElements } from '../src/elements-loader.js';
import { execute } from '../src/service.js';
import { registerElement } from '../src/elements-registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR = join(__dirname, '../elements');

describe('data service', function () {

    before(async function () {
        await loadElements([ELEMENTS_DIR]);

        registerElement({ type: 'data', id: 'ds-plain',       data: { value: 42 } });
        registerElement({ type: 'data', id: 'ds-ref',         data: { '/ref': 'ds-plain' } });
        registerElement({ type: 'data', id: 'ds-kind-alpha',  meta: { kind: 'ds-kind' }, data: { name: 'alpha' } });
        registerElement({ type: 'data', id: 'ds-kind-beta',   meta: { kind: 'ds-kind' }, data: { name: 'beta'  } });
        registerElement({ type: 'data', id: 'ds-other-kind',  meta: { kind: 'ds-other' }, data: { name: 'other' } });
    });

    describe('getData', () => {

        it('throws when id is missing', async () => {
            let error;
            try {
                await execute('data', 'getData', {});
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

        it('returns the evaluated element for a known id', async () => {
            const result = await execute('data', 'getData', { id: 'ds-plain' });
            expect(result).to.include({ id: 'ds-plain', type: 'data' });
            expect(result.data).to.deep.equal({ value: 42 });
        });

        it('evaluates /ref references', async () => {
            const result = await execute('data', 'getData', { id: 'ds-ref' });
            expect(result.data).to.deep.equal({ value: 42 });
        });

        it('returns undefined for an unknown id', async () => {
            const result = await execute('data', 'getData', { id: 'ds-no-such-element' });
            expect(result).to.be.undefined;
        });

    });

    describe('getDataOfKind', () => {

        it('throws when kind is missing', async () => {
            let error;
            try {
                await execute('data', 'getDataOfKind', {});
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

        it('returns all items of the requested kind', async () => {
            const { items } = await execute('data', 'getDataOfKind', { kind: 'ds-kind' });
            const names = items.map(el => el.data.name);
            expect(names).to.include.members(['alpha', 'beta']);
        });

        it('does not include items of a different kind', async () => {
            const { items } = await execute('data', 'getDataOfKind', { kind: 'ds-kind' });
            expect(items.every(el => el.meta.kind === 'ds-kind')).to.be.true;
        });

        it('returns an empty list when no items match', async () => {
            const { items } = await execute('data', 'getDataOfKind', { kind: 'ds-no-such-kind' });
            expect(items).to.be.an('array').that.is.empty;
        });

    });

});
