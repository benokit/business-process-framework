import { expect } from 'chai';
import { log } from '../src/logger.js';

describe('logger', function () {
    let stdoutLines;
    let stderrLines;
    let stdoutWrite;
    let stderrWrite;

    beforeEach(function () {
        stdoutLines = [];
        stderrLines = [];
        stdoutWrite = process.stdout.write.bind(process.stdout);
        stderrWrite = process.stderr.write.bind(process.stderr);
        process.stdout.write = line => stdoutLines.push(line);
        process.stderr.write = line => stderrLines.push(line);
    });

    afterEach(function () {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    });

    function lastEntry(lines) {
        return JSON.parse(lines.at(-1));
    }

    it('writes a JSON line to stdout', function () {
        log({ input: { message: 'hello' } });
        expect(stdoutLines).to.have.length(1);
        expect(stdoutLines[0]).to.match(/\n$/);
    });

    it('includes timestamp, level, and message fields', function () {
        const before = new Date().toISOString();
        log({ input: { message: 'test message' } });
        const after = new Date().toISOString();
        const entry = lastEntry(stdoutLines);
        expect(entry.message).to.equal('test message');
        expect(entry.level).to.equal('info');
        expect(entry.timestamp).to.be.a('string');
        expect(entry.timestamp >= before).to.be.true;
        expect(entry.timestamp <= after).to.be.true;
    });

    it('defaults level to info', function () {
        log({ input: { message: 'x' } });
        expect(lastEntry(stdoutLines).level).to.equal('info');
    });

    it('writes warn to stdout', function () {
        log({ input: { message: 'x', level: 'warn' } });
        expect(stdoutLines).to.have.length(1);
        expect(stderrLines).to.have.length(0);
    });

    it('writes error to stderr', function () {
        log({ input: { message: 'x', level: 'error' } });
        expect(stderrLines).to.have.length(1);
        expect(stdoutLines).to.have.length(0);
        expect(lastEntry(stderrLines).level).to.equal('error');
    });

    it('writes fatal to stderr', function () {
        log({ input: { message: 'x', level: 'fatal' } });
        expect(stderrLines).to.have.length(1);
        expect(stdoutLines).to.have.length(0);
    });

    it('merges context fields into the entry', function () {
        log({ input: { message: 'x', context: { orderId: 42, status: 'ok' } } });
        const entry = lastEntry(stdoutLines);
        expect(entry.orderId).to.equal(42);
        expect(entry.status).to.equal('ok');
    });

    it('context does not override standard fields', function () {
        log({ input: { message: 'x', level: 'warn', context: { level: 'debug', message: 'overridden' } } });
        const entry = lastEntry(stdoutLines);
        expect(entry.level).to.equal('warn');
        expect(entry.message).to.equal('x');
    });

    it('returns null', function () {
        const result = log({ input: { message: 'x' } });
        expect(result).to.be.null;
    });
});
