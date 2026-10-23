#!/usr/bin/env node
import path from 'path';
import { validate } from '@business-framework/core';
import { bootApplication, explain, renderExplanation, renderVocabulary, report, vocabulary } from './index.js';

const USAGE = `usage: bpf <command> [--json] [<elements-path> ...]
  validate             problems of the application, or 'valid'
  explain <id>         the resolved element: kind chain, data, operations, slots and their fills
  vocabulary           node forms and templates, LambdaJSON primitives, pure functions`;

const [command, ...rest] = process.argv.slice(2);
const asJson = rest.includes('--json');
const positional = rest.filter(argument => argument !== '--json');

const output = (value, render) => asJson ? JSON.stringify(value, null, 2) : render(value);

const commands = {
    validate: async paths => {
        await bootApplication({ paths });
        const problems = validate();
        if (problems.length > 0) {
            process.exitCode = 1;
            return asJson ? JSON.stringify(problems, null, 2) : report(problems);
        }
        return asJson ? '[]' : 'valid';
    },
    explain: async ([id, ...paths]) => {
        await bootApplication({ paths });
        return output(explain(id), renderExplanation);
    },
    vocabulary: async paths => {
        await bootApplication({ paths });
        return output(await vocabulary(), renderVocabulary);
    }
};

const run = commands[command];

if (run === undefined || (command === 'explain' && positional.length === 0)) {
    console.error(USAGE);
    process.exit(2);
}

run(command === 'explain' ? [positional[0], ...positional.slice(1).map(p => path.resolve(p))] : positional.map(p => path.resolve(p)))
    .then(text => (process.exitCode ? console.error : console.log)(text))
    .catch(error => {
        console.error(`${error.code ?? 'error'}: ${error.message ?? error}`);
        process.exit(1);
    });
