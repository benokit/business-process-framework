#!/usr/bin/env node
import path from 'path';
import { validateWorkspace } from './validate-workspace.js';

const HELP = `\
Usage: bpf <command> [options]

Commands:
  --validate <path> [<path> ...]   Validate all .eson elements in the given paths
  --help                           Show this help message
`;

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
    console.log(HELP);
    process.exit(0);
}

if (args[0] === '--validate') {
    const rawPaths = args.slice(1);
    if (rawPaths.length === 0) {
        console.error('Error: --validate requires at least one path argument.');
        console.error('');
        console.error(HELP);
        process.exit(1);
    }

    const paths = rawPaths.map(p => path.resolve(p));
    const failures = await validateWorkspace(paths);

    if (failures.length === 0) {
        console.log('All elements valid.');
        process.exit(0);
    }

    for (const { element, file, line, schemaId, errors } of failures) {
        const label = element.id ? `"${element.id}"` : `(anonymous)`;
        const kind = element.kind ?? '(no kind)';
        console.error(`\n${file}:${line}`);
        console.error(`  Element ${label} (kind: ${kind}) failed schema "${schemaId}":`);
        for (const err of errors) {
            const location = err.instancePath || '/';
            console.error(`    ${location}: ${err.message}`);
        }
    }

    process.exit(1);
}

console.error(`Error: unknown command "${args[0]}".`);
console.error('');
console.error(HELP);
process.exit(1);
