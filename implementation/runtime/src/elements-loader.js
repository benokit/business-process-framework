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

// Returns the 1-based line number for each top-level element in a JSON text.
function findElementLines(text) {
    const lines = [];
    let i = 0;
    let line = 1;
    let depth = 0;
    let inString = false;
    let escape = false;
    let isArray = null;

    while (i < text.length) {
        const ch = text[i];

        if (escape) { escape = false; i++; continue; }

        if (inString) {
            if (ch === '\\') escape = true;
            else if (ch === '"') inString = false;
            if (ch === '\n') line++;
            i++;
            continue;
        }

        if (ch === '\n') { line++; }
        else if (ch === '"') { inString = true; }
        else if (ch === '[') { if (depth === 0) isArray = true; depth++; }
        else if (ch === '{') {
            if (depth === 0) { isArray = false; lines.push(line); }
            else if (isArray && depth === 1) { lines.push(line); }
            depth++;
        } else if (ch === ']' || ch === '}') { depth--; }

        i++;
    }

    return lines;
}

async function readElementsRecursively(definitionsPath) {
    let definitions = [];
    const files = await fs.readdir(definitionsPath, { withFileTypes: true });

    for (const file of files) {
        const filePath = path.join(definitionsPath, file.name);

        if (file.isDirectory() && file.name !== 'node_modules') {
            definitions = definitions.concat(await readElementsRecursively(filePath));
        } else if (file.name.endsWith(ESON_SUFFIX) && !file.name.includes(ESON_INFIX)) {
            const json = await fs.readFile(filePath, 'utf8');
            const elementLines = findElementLines(json);
            const data = JSON.parse(json);
            const items = Array.isArray(data) ? data : [data];
            for (let idx = 0; idx < items.length; idx++) {
                items[idx]._source = { file: filePath, line: elementLines[idx] ?? 1 };
                definitions.push(items[idx]);
            }
        } else {
            const parsed = parseStringElementFileName(file.name);
            if (parsed) {
                const content = await fs.readFile(filePath, 'utf8');
                definitions.push({ id: parsed.id, kind: parsed.kind, data: content, _source: { file: filePath, line: 1 } });
            }
        }
    }
    return definitions;
}

async function loadElements(paths) {
    let elements = [];
    for (const p of paths) {
        elements = elements.concat(await readElementsRecursively(p));
    }
    elements.forEach(registerElement);
    return elements;
}

export {
    loadElements
};
