import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { boot, packageElements, start, stop } from '@business-framework/core';

const SCOPE = '@business-framework';
const NODE_MODULES = fileURLToPath(new URL(`../../node_modules/${SCOPE}`, import.meta.url));

const hasElements = async name => (await readdir(path.join(NODE_MODULES, name)).catch(() => [])).includes('elements');

export const installedPackages = async () => (await Promise.all((await readdir(NODE_MODULES))
    .filter(name => name !== 'core')
    .map(async name => (await hasElements(name)) ? `${SCOPE}/${name}` : null)))
    .filter(Boolean)
    .sort();

export const startServer = async ({ packages, paths = [], elements = [] } = {}) => {
    await boot({ paths: [...(packages ?? await installedPackages()).map(packageElements), ...paths], elements });
    await start();
    return stop;
};
