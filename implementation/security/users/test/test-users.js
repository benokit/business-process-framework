import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadElements } from '@business-framework/core/elements-loader';
import { executeService } from '@business-framework/core/execution';
import { registerElement } from '@business-framework/core/elements-registry';
import { hashPassword, verifyPassword } from '@business-framework/users';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR      = join(__dirname, '../elements');
const CORE_ELEMENTS_DIR = join(__dirname, '../../../core/elements');
const ENTITY_ELEMENTS_DIR = join(__dirname, '../../../entities/elements');
const INFRASTRUCTURE_MIDDLEWARE_DIR = join(__dirname, '../../../infrastructure/middleware/elements');

describe('password functions', () => {

    it('hashPassword returns a non-empty string', async () => {
        const hash = await hashPassword({ input: 'secret' });
        expect(hash).to.be.a('string').that.is.not.empty;
    });

    it('verifyPassword returns true for correct password', async () => {
        const hash = await hashPassword({ input: 'mypassword' });
        const result = await verifyPassword({ input: { password: 'mypassword', hash } });
        expect(result).to.be.true;
    });

    it('verifyPassword returns false for wrong password', async () => {
        const hash = await hashPassword({ input: 'mypassword' });
        const result = await verifyPassword({ input: { password: 'wrongpassword', hash } });
        expect(result).to.be.false;
    });

    it('verifyPassword returns false when hash is missing', async () => {
        const result = await verifyPassword({ input: { password: 'mypassword', hash: undefined } });
        expect(result).to.be.false;
    });

});

describe('user component methods', () => {

    before(async () => {
        await loadElements([ELEMENTS_DIR, CORE_ELEMENTS_DIR, ENTITY_ELEMENTS_DIR, INFRASTRUCTURE_MIDDLEWARE_DIR]);

        registerElement({
            kind: 'execution-node-template',
            id: 'mock-in-transaction-template',
            data: {
                keyword: 'inTransaction',
                implementation: [{ execute: '#.node.inTransaction', inputMap: '#.input' }]
            }
        });

        registerElement({
            kind: 'service',
            id: 'entity-event-publisher',
            data: {
                interface: { publish: { input: {}, output: {} } },
                implementation: { publish: { return: {} } }
            }
        });

        registerElement({
            kind: 'service',
            id: 'entity-database',
            data: {
                interface: {
                    read:   { input: {}, output: {} },
                    update: { input: {}, output: {} },
                    create: { input: {}, output: {} },
                    delete: { input: {}, output: {} },
                    amend:  { input: {}, output: {} }
                },
                implementation: {
                    read: [
                        { return: { entityType: 'user', businessKey: '#.input.businessKey', id: 'user-1', revision: 1, data: { username: '#.input.businessKey', email: 'alice@example.com', password_hash: null }, state: { dimensions: {} } } }
                    ],
                    update: [{ return: '#.input' }],
                    create: [{ return: '#.input' }],
                    delete: [{ return: '#.input' }],
                    amend:  [{ return: '#.input' }]
                }
            }
        });
    });

    it('set-password updates password_hash on the entity', async () => {
        const result = await executeService('entity', 'execute', {
            entityType: 'user',
            businessKey: 'alice',
            method: 'set-password',
            methodInput: { password: 'hunter2' }
        });
        expect(result.data.password_hash).to.be.a('string').that.includes(':');
    });

});
