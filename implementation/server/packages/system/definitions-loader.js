const fs = require('fs/promises');
const path = require('path');
const { registerObject } = require('system/register');

const definitionsFileExtensions = ['.jsond'];

async function readDefinitions(definitionsPath) {
    let definitions = [];
    const files = await fs.readdir(definitionsPath, { withFileTypes: true });

    for (const file of files) {
        const filePath = path.join(definitionsPath, file.name);

        if (file.isDirectory()) {
            definitions = definitions.concat(await readDefinitions(filePath));
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
    let definitions = [];
    for (const path of paths) {
        const definitionsFromPath = await readDefinitions(path);
        definitions = definitions.concat(definitionsFromPath);
    }
    definitions.forEach(registerObject);
}

module.exports = {
    loadDefinitions
}
