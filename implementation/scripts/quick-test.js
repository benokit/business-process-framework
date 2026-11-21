import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const HISTORY = join(ROOT, '.test-history.json');
const MOCHA = join(ROOT, 'node_modules/.bin/mocha');
const DEFAULT_SECONDS = 10;
const CHANGED_BOOST = 3;
const FAILED_BOOST = 5;

const optionOf = (name, fallback) => process.argv.find(argument => argument.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const flagSet = name => process.argv.includes(`--${name}`);

const seed = Number(optionOf('seed', Date.now() % 1e9));
const budget = Number(optionOf('budget', 60));

const generator = state => () => {
    state = (state + 0x6D2B79F5) | 0;
    const mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    return (((mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed) >>> 14) / 2 ** 18 % 1;
};

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

const workspaceDirectories = () => readJson(join(ROOT, 'package.json')).workspaces.flatMap(pattern => pattern.endsWith('/*')
    ? readdirSync(join(ROOT, pattern.slice(0, -2)), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => `${pattern.slice(0, -2)}/${entry.name}`)
    : [pattern]).filter(directory => existsSync(join(ROOT, directory, 'package.json')));

const SCENARIOS = 'test/scenarios';
const SCENARIOS_RUNNER = join(ROOT, 'test-framework/scenarios/src/discover.js');

const testFilesOf = directory => [
    ...existsSync(join(ROOT, directory, 'test'))
        ? readdirSync(join(ROOT, directory, 'test'), { recursive: true }).filter(name => name.endsWith('.test.js')).map(name => `${directory}/test/${name}`)
        : [],
    ...existsSync(join(ROOT, directory, SCENARIOS)) ? [`${directory}/${SCENARIOS}`] : []
];

const specOf = file => file.name.endsWith(`/${SCENARIOS}`) ? SCENARIOS_RUNNER : join(ROOT, file.name);

const packageNames = directories => Object.fromEntries(directories.map(directory => [readJson(join(ROOT, directory, 'package.json')).name, directory]));

const dependenciesOf = (directory, names) => {
    const { dependencies = {}, devDependencies = {} } = readJson(join(ROOT, directory, 'package.json'));
    return Object.keys({ ...dependencies, ...devDependencies }).map(name => names[name]).filter(Boolean);
};

const dependentsOf = (changed, directories, names) => {
    const grown = [...new Set([...changed, ...directories.filter(directory => dependenciesOf(directory, names).some(dependency => changed.includes(dependency)))])];
    return grown.length === changed.length ? changed : dependentsOf(grown, directories, names);
};

const gitLines = args => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);

const changedPaths = () => [...gitLines(['diff', '--name-only', 'HEAD', '--', '.']), ...gitLines(['ls-files', '--others', '--exclude-standard', '.'])]
    .map(path => relative(ROOT, resolve(ROOT, '..', path)));

const changedDirectories = (paths, directories) => [...new Set(paths.flatMap(path => path.startsWith('../demo')
    ? ['server', 'tools']
    : directories.filter(directory => path.startsWith(`${directory}/`))))];

const history = () => existsSync(HISTORY) ? readJson(HISTORY) : { runs: 0, files: {} };

const describe = (file, past, changed, dependents) => {
    const record = past.files[file.name] ?? {};
    const age = record.lastRun === undefined ? past.runs + 1 : past.runs - record.lastRun;
    return {
        ...file,
        seconds: record.seconds ?? DEFAULT_SECONDS,
        mandatory: changed.includes(file.directory),
        weight: (1 + age) * (record.failed > 0 ? FAILED_BOOST : 1) * (dependents.includes(file.directory) ? CHANGED_BOOST : 1)
    };
};

const sampled = (files, random) => files
    .filter(file => !file.mandatory)
    .map(file => ({ file, key: Math.log(random()) / file.weight }))
    .sort((first, second) => second.key - first.key)
    .map(({ file }) => file)
    .reduce(({ chosen, used }, file) => used + file.seconds <= budget ? { chosen: [...chosen, file], used: used + file.seconds } : { chosen, used }, {
        chosen: [],
        used: files.filter(file => file.mandatory).reduce((total, file) => total + file.seconds, 0)
    }).chosen;

const configOf = directory => existsSync(join(ROOT, directory, '.mocharc.json')) ? readJson(join(ROOT, directory, '.mocharc.json')) : {};

const run = file => {
    const folder = mkdtempSync(join(tmpdir(), 'quick-test-'));
    const output = join(folder, 'result.json');
    const config = join(folder, 'mocharc.json');
    writeFileSync(config, JSON.stringify({ ...configOf(file.directory), spec: [specOf(file)] }));
    const started = Date.now();
    spawnSync(MOCHA, ['--config', config, '--no-package', '--exit', '--reporter', 'json', '--reporter-option', `output=${output}`], { cwd: join(ROOT, file.directory), stdio: 'ignore' });
    const { stats, failures } = existsSync(output) ? readJson(output) : { stats: { passes: 0, failures: 1 }, failures: [{ fullTitle: file.name, err: { message: 'mocha produced no result' } }] };
    return { ...file, seconds: (Date.now() - started) / 1000, passes: stats.passes, failures: failures.map(failure => `${failure.fullTitle}: ${failure.err.message}`) };
};

const remembered = (past, results) => ({
    runs: past.runs + 1,
    files: {
        ...past.files,
        ...Object.fromEntries(results.map(result => [result.name, {
            lastRun: past.runs + 1,
            seconds: Math.round(((past.files[result.name]?.seconds ?? result.seconds) + result.seconds) * 50) / 100,
            failed: result.failures.length > 0 ? (past.files[result.name]?.failed ?? 0) + 1 : 0
        }]))
    }
});

const directories = workspaceDirectories();
const names = packageNames(directories);
const changed = changedDirectories(changedPaths(), directories);
const dependents = dependentsOf(changed, directories, names).filter(directory => !changed.includes(directory));
const past = history();
const matching = optionOf('match', '');
const all = directories.flatMap(directory => testFilesOf(directory).map(name => ({ directory, name }))).filter(file => file.name.includes(matching)).map(file => describe(file, past, changed, dependents));
const chosen = flagSet('calibrate') ? all
    : flagSet('changed') ? all.filter(file => file.mandatory)
        : [...all.filter(file => file.mandatory), ...sampled(all, generator(seed))];
const estimate = files => Math.round(files.reduce((total, file) => total + file.seconds, 0));

console.log(`seed ${seed}, budget ${budget}s, changed packages: ${changed.join(', ') || 'none'}`);
console.log(`${chosen.length} of ${all.length} test files, about ${estimate(chosen)}s of ${estimate(all)}s`);
chosen.forEach(file => console.log(`  ${file.mandatory ? '*' : ' '} ${file.name}`));

if (!flagSet('dry-run')) {
    const results = chosen.map(file => {
        const result = run(file);
        console.log(`${result.failures.length === 0 ? 'ok  ' : 'FAIL'} ${result.name} ${result.passes} passing, ${result.seconds.toFixed(1)}s`);
        result.failures.forEach(failure => console.log(`       ${failure}`));
        return result;
    });
    writeFileSync(HISTORY, JSON.stringify(remembered(past, results), null, 1));
    const failed = results.filter(result => result.failures.length > 0);
    console.log(failed.length === 0 ? `all ${results.length} files pass; rerun with another seed to cover others` : `${failed.length} of ${results.length} files fail: reproduce with --seed=${seed}`);
    process.exitCode = failed.length === 0 ? 0 : 1;
}
