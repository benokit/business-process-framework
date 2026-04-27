import { getElementsOfKind } from './elements-registry.js';

let appConfigCache = null;

function invalidateAppConfig() {
    appConfigCache = null;
}

function applyEnvOverrides(config) {
    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith('BPF__')) continue;
        const segments = key.slice('BPF__'.length).split('__');
        let target = config;
        for (let i = 0; i < segments.length - 1; i++) {
            if (target[segments[i]] == null || typeof target[segments[i]] !== 'object') {
                target[segments[i]] = {};
            }
            target = target[segments[i]];
        }
        target[segments[segments.length - 1]] = value;
    }
}

function getAppConfig() {
    if (!appConfigCache) {
        appConfigCache = {};
        for (const element of getElementsOfKind('app-config').items) {
            Object.assign(appConfigCache, element.data);
        }
        applyEnvOverrides(appConfigCache);
    }
    return appConfigCache;
}

export { getAppConfig, invalidateAppConfig };
