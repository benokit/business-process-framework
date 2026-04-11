import fs from 'fs/promises';
import path from 'path';
import { registerElement } from './elements-registry.js';

const ESON_SUFFIX = '.eson';
const ESON_INFIX = '.eson.';

function parseStringElementFileName(name) {
    const idx = name.indexOf(ESON_INFIX);
    if (idx === -1) return null;
    const id = name.slice(0, idx);
    const kind = name.slice(idx + ESON_INFIX.length);
    if (!id || !kind) return null;
    return { id, kind };
}

async function readElementsRecursively(definitionsPath) {
    let definitions = [];
    const files = await fs.readdir(definitionsPath, { withFileTypes: true });

    for (const file of files) {
        const filePath = path.join(definitionsPath, file.name);

        if (file.isDirectory()) {
            definitions = definitions.concat(await readElementsRecursively(filePath));
        } else if (file.name.endsWith(ESON_SUFFIX) && !file.name.includes(ESON_INFIX)) {
            const json = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(json);
            if (Array.isArray(data)) {
                definitions = definitions.concat(data);
            } else {
                definitions.push(data);
            }
        } else {
            const parsed = parseStringElementFileName(file.name);
            if (parsed) {
                const content = await fs.readFile(filePath, 'utf8');
                definitions.push({ id: parsed.id, kind: parsed.kind, data: content });
            }
        }
    }
    return definitions;
}

async function loadElements(paths) {
    let elements = [];
    for (const path of paths) {
        const elementsFromPath = await readElementsRecursively(path);
        elements = elements.concat(elementsFromPath);
    }
    elements.forEach(registerElement);
}

export {
    loadElements
};
