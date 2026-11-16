import { expect } from 'chai';
import { normalized, savepoint } from '../src/postgres-client.js';

const failure = (code, message = 'x') => Object.assign(new Error(message), { code });

describe('postgresql failures', () => {
    it('classifies a server that can not be reached or lost as unavailable', () => {
        const codes = ['ECONNREFUSED', 'ECONNRESET', '57P01', '08006'].map(code => normalized(failure(code)).code);
        expect([...codes, normalized(new Error('Connection terminated unexpectedly')).code]).to.deep.equal(Array(5).fill('unavailable'));
    });

    it('refuses a savepoint name that is not a plain identifier, so no statement can be smuggled in', async () => {
        const error = await savepoint({ input: { sessionId: 1, name: 'sp1; DROP TABLE entities' } }).catch(failed => failed);
        expect(error.code).to.equal('invalid');
    });

    it('names the violation of a constraint and leaves every other failure as it is', () => {
        expect(normalized(failure('23505')).code).to.equal('unique-violation');
        expect(normalized(failure('23503')).code).to.equal('foreign-key-violation');
        const syntax = failure('42601');
        expect(normalized(syntax)).to.equal(syntax);
    });
});
