import path from 'path';
import pkg from 'glob';
import { loadElements } from '@business-framework/core/elements-loader';
import { executeService } from '@business-framework/core/execution';
const { sync: globSync } = pkg;

async function bootstrap(customPaths = []) {
    const frameworkPaths = globSync('node_modules/@business-framework/*/elements', {
        cwd: path.resolve(import.meta.dirname, '..'),
        absolute: true
    });

    await loadElements([...frameworkPaths, ...customPaths]);

    const { port } = await executeService('http-server', 'start', {
        port: parseInt(process.env.PORT ?? '3000', 10)
    });

    console.log(`Server started on port ${port}`);

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

async function shutdown() {
    console.log('Shutting down...');
    await executeService('http-server', 'stop', {});
    process.exit(0);
}

const customPaths = process.argv.slice(2).map(p => path.resolve(p));
bootstrap(customPaths).catch(err => {
    console.error('Bootstrap failed:', err);
    process.exit(1);
});
