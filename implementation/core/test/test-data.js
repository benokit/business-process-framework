import { expect } from 'chai';
import { getData } from 'core/data';
import { registerElement } from 'core/elements-registry';

describe('data tests', () =>
    it.only('shout get simple data', () => {
        const element = {
            type: 'data',
            id: 'test-data',
            data: {
                name: 'foo'
            }
        };
        registerElement(element);
        const data = getData(element.id);
        expect(data).to.deep.equal(element);
    })
)