import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadElements } from '@business-framework/core/elements-loader';
import { executeService } from '@business-framework/core/service';
import { registerElement } from '@business-framework/core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));

before(async function () {
    await loadElements([
        join(__dirname, '../../../core/elements'),
        join(__dirname, '../elements')
    ]);

    registerElement({
        kind: 'service',
        id: 'log-template-test',
        data: {
            interface: {
                logDefault:      { input: {}, output: {} },
                logWithLevel:    { input: {}, output: {} },
                logWithContext:  { input: {}, output: {} },
                logAndReturn:    { input: {}, output: {} },
                logError:        { input: {}, output: {} }
            },
            implementation: {
                logDefault:     { log: 'default message' },
                logWithLevel:   { log: 'warn message', level: 'warn' },
                logWithContext: { log: 'ctx message', context: { orderId: 7 } },
                logAndReturn:   [
                    { log: 'step logged' },
                    { return: { done: true } }
                ],
                logError:       { log: 'error message', level: 'error' }
            }
        }
    });
});

describe('log node template', function () {
    let captured;
    let stdoutWrite;
    let stderrWrite;

    beforeEach(function () {
        captured = { stdout: [], stderr: [] };
        stdoutWrite = process.stdout.write.bind(process.stdout);
        stderrWrite = process.stderr.write.bind(process.stderr);
        process.stdout.write = line => captured.stdout.push(line);
        process.stderr.write = line => captured.stderr.push(line);
    });

    afterEach(function () {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    });

    function lastStdout() {
        return JSON.parse(captured.stdout.at(-1));
    }

    function lastStderr() {
        return JSON.parse(captured.stderr.at(-1));
    }

    it('writes a log entry to stdout', async function () {
        await executeService('log-template-test', 'logDefault', {});
        expect(captured.stdout).to.have.length(1);
        expect(lastStdout().message).to.equal('default message');
    });

    it('defaults level to info', async function () {
        await executeService('log-template-test', 'logDefault', {});
        expect(lastStdout().level).to.equal('info');
    });

    it('respects the level field', async function () {
        await executeService('log-template-test', 'logWithLevel', {});
        expect(lastStdout().level).to.equal('warn');
    });

    it('merges context fields into the entry', async function () {
        await executeService('log-template-test', 'logWithContext', {});
        expect(lastStdout().orderId).to.equal(7);
    });

    it('routes error level to stderr', async function () {
        await executeService('log-template-test', 'logError', {});
        expect(captured.stderr).to.have.length(1);
        expect(captured.stdout).to.have.length(0);
        expect(lastStderr().message).to.equal('error message');
    });

    it('does not disrupt pipeline flow — subsequent steps still run', async function () {
        const result = await executeService('log-template-test', 'logAndReturn', {});
        expect(result).to.deep.equal({ done: true });
        expect(captured.stdout).to.have.length(1);
    });
});
