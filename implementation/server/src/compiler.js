const fs = require('fs/promises');

const definitions = {
    schemas: {},
    interfaces: {},
    types: {},
    classes: {}
}

async function getDefinitionsOnPath(definitionsPath) {
    let definitions = [];
    try {
        const files = await fs.readdir(dir, { withFileTypes: true });

        for (const file of files) {
            const filePath = path.join(dir, file.name);

            if (file.isDirectory()) {
                definitions = definitions.concat(await getDefinitionsOnPath(filePath));
            } else if (file.name.endsWith('.json')) {
                try {
                    const data = await fs.readFile(filePath, 'utf8');
                    definitions.push({ filePath, content: JSON.parse(data) });
                } catch (error) {
                    console.error(`Error reading/parsing JSON file ${filePath}:`, error.message);
                }
            }
        }
    } catch (error) {
        console.error(`Error reading directory ${dir}:`, error.message);
    }
    return definitions;
}