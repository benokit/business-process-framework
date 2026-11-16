import { expect } from 'chai';
import { normalized } from '../src/postgres-client.js';

const failure = (code, message = 'x') => Object.assign(new Error(message), { code });

describe('postgresql failures', () => {
    it('classifies a server that can not be reached or lost as unavailable', () => {
        const codes = ['ECONNREFUSED', 'ECONNRESET', '57P01', '08006'].map(code => normalized(failure(code)).code);
        expect([...codes, normalized(new Error('Connection terminated unexpectedly')).code]).to.deep.equal(Array(5).fill('unavailable'));
    });

    it('names the violation of a constraint and leaves every other failure as it is', () => {
        expect(normalized(failure('23505')).code).to.equal('unique-violation');
        expect(normalized(failure('23503')).code).to.equal('foreign-key-violation');
        const syntax = failure('42601');
        expect(normalized(syntax)).to.equal(syntax);
    });
});
