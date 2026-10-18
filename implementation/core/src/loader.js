import { readdir, readFile } from 'fs/promises';
import path from 'path';

const isElementFile = entry => entry.isFile() && entry.name.endsWith('.eson');

const filesIn = async directory => (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(isElementFile)
    .filter(entry => !entry.parentPath.split(path.sep).includes('node_modules'))
    .map(entry => path.join(entry.parentPath, entry.name))
    .sort();

const elementsIn = async file => [JSON.parse(await readFile(file, 'utf8'))].flat();

export const readElements = async directories => {
    const files = (await Promise.all(directories.map(filesIn))).flat();
    return (await Promise.all(files.map(elementsIn))).flat();
};
