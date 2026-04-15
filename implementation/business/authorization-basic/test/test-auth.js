import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadElements } from '@business-framework/core/elements-loader';
import { executeService } from '@business-framework/core/execution';
import { registerElement } from '@business-framework/core/elements-registry';
import { generateToken, verifyToken } from '@business-framework/authorization-basic';
import { hashPassword } from '@business-framework/users';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR        = join(__dirname, '../elements');
const CORE_ELEMENTS_DIR   = join(__dirname, '../../../core/elements');
const ENTITY_ELEMENTS_DIR = join(__dirname, '../../../entities/elements');
const USERS_ELEMENTS_DIR  = join(__dirname, '../../users/elements');

describe('JWT functions', () => {

    it('generateToken returns a JWT string', () => {
        const token = generateToken({ input: { userId: 'alice', username: 'alice', email: 'alice@example.com' } });
        expect(token).to.be.a('string');
        expect(token.split('.')).to.have.length(3);
    });

    it('verifyToken returns payload for valid Bearer token', () => {
        const token = generateToken({ input: { userId: 'alice', username: 'alice', email: 'alice@example.com' } });
        const payload = verifyToken({ input: `Bearer ${token}` });
        expect(payload).to.deep.equal({ userId: 'alice', username: 'alice', email: 'alice@example.com' });
    });

    it('verifyToken returns null when Authorization header is absent', () => {
        expect(verifyToken({ input: null })).to.be.null;
        expect(verifyToken({ input: undefined })).to.be.null;
    });

    it('verifyToken returns null for a tampered token', () => {
        const token = generateToken({ input: { userId: 'alice', username: 'alice', email: 'alice@example.com' } });
        const parts = token.split('.');
        parts[1] = Buffer.from(JSON.stringify({ sub: 'hacker', exp: 9999999999 })).toString('base64url');
        const result = verifyToken({ input: `Bearer ${parts.join('.')}` });
        expect(result).to.be.null;
    });

    it('verifyToken returns null for a non-Bearer header', () => {
        const token = generateToken({ input: { userId: 'alice', username: 'alice', email: 'alice@example.com' } });
        expect(verifyToken({ input: `Basic ${token}` })).to.be.null;
    });

});

describe('auth-login service', () => {

    before(async () => {
        await loadElements([ELEMENTS_DIR, CORE_ELEMENTS_DIR, ENTITY_ELEMENTS_DIR, USERS_ELEMENTS_DIR]);

        registerElement({
            kind: 'execution-node-template',
            id: 'mock-in-transaction-template-auth',
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
    });

    it('login returns a JWT token for valid credentials', async () => {
        const hash = await hashPassword({ input: 'secret123' });

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
                    read: {
                        return: {
                            entityType: 'user',
                            businessKey: 'alice',
                            id: 'user-1',
                            revision: 1,
                            data: { username: 'alice', email: 'alice@example.com', isActive: true, password_hash: hash },
                            state: { dimensions: {} }
                        }
                    },
                    update: { return: '#.input' },
                    create: { return: '#.input' },
                    delete: { return: '#.input' },
                    amend:  { return: '#.input' }
                }
            }
        });

        const result = await executeService('auth-login', 'login', { username: 'alice', password: 'secret123' });
        expect(result.token).to.be.a('string');
        const payload = verifyToken({ input: `Bearer ${result.token}` });
        expect(payload.username).to.equal('alice');
    });

    it('login throws for wrong password', async () => {
        let error;
        try {
            await executeService('auth-login', 'login', { username: 'alice', password: 'wrongpassword' });
        } catch (e) {
            error = e;
        }
        expect(error).to.exist;
        expect(error.cause).to.include('invalid credentials');
    });

});
