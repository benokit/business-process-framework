import path from 'path';
import pkg from 'glob';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { executeService, executeMethod } from '@business-framework/runtime/execution';
import { getElementsOfKind } from '@business-framework/runtime/elements-registry';
const { sync: globSync } = pkg;

async function bootstrap(customPaths = []) {
    const frameworkPaths = globSync('node_modules/@business-framework/*/elements', {
        cwd: path.resolve(import.meta.dirname, '..'),
        absolute: true
    });

    await loadElements([...frameworkPaths, ...customPaths]);

    await runStartupItems();

    await ensureAdminUser();

    const { port } = await executeService('http-server', 'start', {
        port: parseInt(process.env.PORT ?? '3000', 10)
    });

    console.log(`Server started on port ${port}`);

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

async function runStartupItems() {
    const { items } = getElementsOfKind('on-startup');
    for (const item of items) {
        await executeMethod(item.data, {}, {});
    }
}

async function shutdown() {
    console.log('Shutting down...');
    await executeService('http-server', 'stop', {});
    process.exit(0);
}

async function ensureAdminUser() {
    const username = process.env.ADMIN_USERNAME ?? 'admin';
    const password = process.env.ADMIN_PASSWORD ?? 'admin';
    const email    = process.env.ADMIN_EMAIL    ?? 'admin@localhost';

    const existing = await executeService('entity', 'read', { entityType: 'user', businessKey: username });
    if (existing) {
        console.log(`Admin user "${username}" already exists, skipping.`);
        return;
    }

    await executeService('entity', 'create', {
        entityType: 'user',
        data: { username, email }
    });
    await executeService('entity', 'execute', {
        entityType: 'user',
        businessKey: username,
        method: 'set-password',
        methodInput: { password }
    });
    console.log(`Admin user "${username}" created.`);
}

const customPaths = process.argv.slice(2).map(p => path.resolve(p));
bootstrap(customPaths).catch(err => {
    console.error('Bootstrap failed:', err);
    process.exit(1);
});
