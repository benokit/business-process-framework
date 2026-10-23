import { fileURLToPath } from 'url';
import { allElements, register, reset } from './registry.js';
import { readElements } from './loader.js';
import { composeElements } from './data.js';
import { recordAuthors } from './context.js';
import { preparePureFunctions } from './mappings.js';
import { enableChecks } from './schemas.js';
import { runLifecycle } from './lifecycle.js';

export { invoke } from './execution/invoke.js';
export { execute } from './execution/pipeline.js';
export { validate } from './validation.js';
export { CoreError } from './errors.js';
export { findElement, getElement } from './registry.js';
export { packageElements } from './packages.js';

const CORE_ELEMENTS = fileURLToPath(new URL('../elements', import.meta.url));

export const boot = async ({ paths = [], elements = [] } = {}) => {
    reset();
    [...await readElements([CORE_ELEMENTS, ...paths]), ...elements].forEach(register);
    composeElements(allElements()).forEach(recordAuthors);
    await preparePureFunctions();
    await runLifecycle('load');
    enableChecks();
};

export const start = () => runLifecycle('start');

export const stop = () => runLifecycle('stop');
