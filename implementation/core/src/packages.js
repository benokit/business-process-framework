import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { fail } from './errors.js';

const require = createRequire(import.meta.url);

const packageRoot = name => path.dirname(require.resolve(`${name}/package.json`));

export const packageElements = name => path.join(packageRoot(name), 'elements');

const packageNameOf = specifier => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');

const pathOf = uri => {
    if (uri.startsWith('file:')) return fileURLToPath(uri);
    const name = packageNameOf(uri);
    return path.join(packageRoot(name), uri.slice(name.length));
};

export const readUri = uri => {
    try {
        return readFileSync(pathOf(uri), 'utf8');
    } catch (error) {
        return fail('unreadable-uri', `can't read '${uri}': ${error.message}`, { uri });
    }
};
