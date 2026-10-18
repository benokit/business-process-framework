import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);

export const packageElements = name => path.join(path.dirname(require.resolve(`${name}/package.json`)), 'elements');
