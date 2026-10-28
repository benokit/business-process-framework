#!/usr/bin/env node
import path from 'path';
import { describeError, validate } from '@business-framework/core';
import { bootApplication, explain, failed, list, migrateApplication, outputSchemas, refs, renderers, traceApplication, vocabulary } from './index.js';

const USAGE = `usage: bpf <command> [--json] [<elements-path> ...]
  validate             problems of the application, or 'valid'
  explain <id>         the resolved element: kind chain, data, operations, slots and their fills
  refs <id>            the elements that reference an element, with the path and the kind of reference
  list [<kind>]        the elements with an id, or the instances of a kind and its subkinds
  vocabulary           node forms and templates, LambdaJSON primitives, pure functions
  trace <id> <op>      runs one operation and prints the elements it passes: [--input <json>] [--live] [--steps]
  migrate              starts the application and applies the database migrations not yet applied
  schema <command>     the JSON Schema of the --json output of a command
  render <command>     reads the --json output of a command from stdin and prints it as text

stdout carries the result (JSON with --json), stderr the diagnostics (with --json an error is {code, message, data}); the exit code is 0 on success, 1 on failure, 2 on bad usage.`;

const [command, ...rest] = process.argv.slice(2);
const FLAGS = ['--json', '--live', '--steps'];
const asJson = rest.includes('--json');
const steps = rest.includes('--steps');
const inputAt = rest.indexOf('--input');
const inputIndexes = inputAt < 0 ? [] : [inputAt, inputAt + 1];
const positional = rest.filter((argument, index) => !FLAGS.includes(argument) && !inputIndexes.includes(index));

const pretty = value => JSON.stringify(value, null, 2);

const output = (name, value) => asJson ? pretty(value) : renderers[name](value, { steps });

const stdin = async () => {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString());
};

const commands = {
    validate: async paths => {
        await bootApplication({ paths });
        const problems = validate({ warnings: true });
        if (failed(problems)) process.exitCode = 1;
        return output('validate', problems);
    },
    explain: async ([id, ...paths]) => {
        await bootApplication({ paths });
        return output('explain', explain(id));
    },
    refs: async ([id, ...paths]) => {
        await bootApplication({ paths });
        return output('refs', refs(id));
    },
    list: async ([kind, ...paths]) => {
        await bootApplication({ paths });
        return output('list', list(kind));
    },
    vocabulary: async paths => {
        await bootApplication({ paths });
        return output('vocabulary', vocabulary());
    },
    trace: async ([element, operation, ...paths]) => output('trace', await traceApplication({
        element, operation, paths, live: rest.includes('--live'), input: inputAt < 0 ? null : JSON.parse(rest[inputAt + 1])
    })),
    migrate: async paths => {
        const { applied } = await migrateApplication({ paths });
        return asJson ? pretty({ applied }) : applied.length ? applied.map(id => `applied ${id}`).join('\n') : 'nothing to apply';
    },
    schema: async ([name]) => pretty(outputSchemas[name]),
    render: async ([name]) => renderers[name](await stdin(), { steps })
};

const WITH_ID = ['explain', 'refs'];
const WITH_TWO = ['trace'];
const WITH_NAME = ['schema', 'render'];

const isPath = argument => argument.includes('/') || argument.startsWith('.');

const argumentsOf = () => {
    if (WITH_NAME.includes(command)) return [positional[0]];
    if (WITH_TWO.includes(command)) return [positional[0], positional[1], ...positional.slice(2).map(p => path.resolve(p))];
    if (WITH_ID.includes(command)) return [positional[0], ...positional.slice(1).map(p => path.resolve(p))];
    if (command === 'list') return isPath(positional[0] ?? '/') ? [undefined, ...positional.map(p => path.resolve(p))] : [positional[0], ...positional.slice(1).map(p => path.resolve(p))];
    return positional.map(p => path.resolve(p));
};

const run = commands[command];

const misused = run === undefined
    || (WITH_ID.includes(command) && positional.length === 0)
    || (WITH_TWO.includes(command) && positional.length < 2)
    || (WITH_NAME.includes(command) && !(positional[0] in renderers && positional[0] in outputSchemas));

if (misused) {
    console.error(USAGE);
    process.exit(2);
}

const failure = error => ({ code: error.code ?? 'error', message: error.message ?? String(error), data: error.data ?? {} });

run(argumentsOf())
    .then(text => console.log(text))
    .catch(error => {
        console.error(asJson ? JSON.stringify(failure(error)) : describeError(error));
        process.exit(1);
    });
