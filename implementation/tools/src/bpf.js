#!/usr/bin/env node
import path from 'path';
import { validate } from '@business-framework/core';
import { bootApplication, explain, list, migrateApplication, refs, renderExplanation, renderList, renderRefs, renderVocabulary, report, vocabulary } from './index.js';

const USAGE = `usage: bpf <command> [--json] [<elements-path> ...]
  validate             problems of the application, or 'valid'
  explain <id>         the resolved element: kind chain, data, operations, slots and their fills
  refs <id>            the elements that reference an element, with the path and the kind of reference
  list [<kind>]        the elements with an id, or the instances of a kind and its subkinds
  vocabulary           node forms and templates, LambdaJSON primitives, pure functions
  migrate              starts the application and applies the database migrations not yet applied`;

const [command, ...rest] = process.argv.slice(2);
const asJson = rest.includes('--json');
const positional = rest.filter(argument => argument !== '--json');

const output = (value, render) => asJson ? JSON.stringify(value, null, 2) : render(value);

const commands = {
    validate: async paths => {
        await bootApplication({ paths });
        const problems = validate({ warnings: true });
        const failed = problems.some(problem => problem.data?.severity !== 'warning');
        if (failed) process.exitCode = 1;
        if (asJson) return JSON.stringify(problems, null, 2);
        return [report(problems), failed ? '' : 'valid'].filter(Boolean).join('\n');
    },
    explain: async ([id, ...paths]) => {
        await bootApplication({ paths });
        return output(explain(id), renderExplanation);
    },
    refs: async ([id, ...paths]) => {
        await bootApplication({ paths });
        return output(refs(id), renderRefs);
    },
    list: async ([kind, ...paths]) => {
        await bootApplication({ paths });
        return output(list(kind), renderList);
    },
    vocabulary: async paths => {
        await bootApplication({ paths });
        return output(vocabulary(), renderVocabulary);
    },
    migrate: async paths => {
        const { applied } = await migrateApplication({ paths });
        return output({ applied }, () => applied.length ? applied.map(id => `applied ${id}`).join('\n') : 'nothing to apply');
    }
};

const WITH_ID = ['explain', 'refs'];

const isPath = argument => argument.includes('/') || argument.startsWith('.');

const argumentsOf = () => {
    if (WITH_ID.includes(command)) return [positional[0], ...positional.slice(1).map(p => path.resolve(p))];
    if (command === 'list') return isPath(positional[0] ?? '/') ? [undefined, ...positional.map(p => path.resolve(p))] : [positional[0], ...positional.slice(1).map(p => path.resolve(p))];
    return positional.map(p => path.resolve(p));
};

const run = commands[command];

if (run === undefined || (WITH_ID.includes(command) && positional.length === 0)) {
    console.error(USAGE);
    process.exit(2);
}

run(argumentsOf())
    .then(text => (process.exitCode ? console.error : console.log)(text))
    .catch(error => {
        console.error(`${error.code ?? 'error'}: ${error.message ?? error}`);
        process.exit(1);
    });
