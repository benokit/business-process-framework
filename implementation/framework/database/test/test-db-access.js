import { expect } from 'chai';
import { dirname } from 'path';
import { createRequire } from 'module';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { executeService } from '@business-framework/runtime/execution';
import { registerElement } from '@business-framework/runtime/elements-registry';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));

describe('db-access service', function () {
    before(async function () {
        await loadElements([
            packageDir('@business-framework/definitions'),
            packageDir('@business-framework/database')
        ]);
        registerElement({
            kind: 'service',
            id: 'db-driver-mock',
            data: {
                interface: { execute: { input: {}, output: {} } },
                implementation: { execute: { return: '#.input' } }
            }
        });
    });

    it('maps query to command and passes parameters to the driver', async () => {
        const result = await executeService('db-access', 'get', {
            dbType: 'mock',
            query: 'SELECT 1',
            parameters: ['x']
        });
        expect(result.command).to.equal('SELECT 1');
        expect(result.parameters).to.deep.equal(['x']);
    });

    it('omits parameters when not provided', async () => {
        const result = await executeService('db-access', 'get', {
            dbType: 'mock',
            query: 'SELECT 1'
        });
        expect(result.command).to.equal('SELECT 1');
        expect(result.parameters).to.be.undefined;
    });

    it('throws for an unknown dbType', async () => {
        let error;
        try {
            await executeService('db-access', 'get', { dbType: 'no-such-driver', query: 'SELECT 1' });
        } catch (e) {
            error = e;
        }
        expect(error).to.exist;
    });
});
