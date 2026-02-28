import fs from 'fs/promises';
import path from 'path';
import { registerElement } from './elements-registry.js';

const definitionsFileExtensions = ['.eson'];

async function readElementsRecursively(definitionsPath) {
    let definitions = [];
    const files = await fs.readdir(definitionsPath, { withFileTypes: true });

    for (const file of files) {
        const filePath = path.join(definitionsPath, file.name);

        if (file.isDirectory()) {
            definitions = definitions.concat(await readElementsRecursively(filePath));
        } else if (definitionsFileExtensions.map(ext => file.name.endsWith(ext)).some(q => q)) {
            const json = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(json);
            if (Array.isArray(data)) {
                definitions = definitions.concat(data);
            } else {
                definitions.push(data);
            }
        }
    }
    return definitions;
}

async function loadDefinitions(paths) {
    let elements = [];
    for (const path of paths) {
        const elementsFromPath = await readElementsRecursively(path);
        elements = elements.concat(elementsFromPath);
    }
    elements.forEach(registerElement);
}

export {
    loadDefinitions
};
