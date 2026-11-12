import { expect } from 'chai';
import { mkdtemp, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { readElements, withoutComments } from '../src/loader.js';

describe('loader', () => {
    it('ignores line and block comments in .eson files', async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), 'eson-'));
        await writeFile(path.join(directory, 'a.eson'), '// first\n[\n    /* the element */ { "id": "a", "kind": "data", "data": {} } // trailing\n]\n');
        expect(await readElements([directory])).to.deep.equal([{ id: 'a', kind: 'data', data: {} }]);
    });

    it('keeps comment markers inside strings', () => {
        const text = '{ "uri": "http://x/*y*/", "quote": "a\\"//b" }';
        expect(withoutComments(text)).to.equal(text);
    });

    it('keeps the line and column of what stays', () => {
        expect(withoutComments('1 /* a\nb */ 2 // c\n3')).to.equal('1     \n     2     \n3');
    });
});
