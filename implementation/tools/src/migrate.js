import { invoke } from '@business-framework/core';
import { installedPackages, startServer } from '@business-framework/server';

const PORT_OF_ITS_OWN = { kind: 'app-config', data: { 'http-server': { port: 0 } } };

export const migrateApplication = async ({ packages, paths = [] } = {}) => {
    const stop = await startServer({ packages: packages ?? await installedPackages(), paths, elements: [PORT_OF_ITS_OWN] });
    try {
        return await invoke({ instanceOf: 'database' }, 'migrate', null);
    } finally {
        await stop();
    }
};
