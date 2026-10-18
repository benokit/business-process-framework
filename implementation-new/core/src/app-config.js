import { merge, set } from 'lodash-es';
import { lazy } from './registry.js';
import { instancesOf } from './kinds.js';

const PREFIX = 'BPF__';

const overrides = () => Object.entries(process.env)
    .filter(([key]) => key.startsWith(PREFIX))
    .map(([key, value]) => [key.slice(PREFIX.length).split('__'), value]);

const configuration = lazy(() => overrides().reduce(
    (config, [path, value]) => set(config, path, value),
    merge({}, ...instancesOf('app-config').map(element => element.data))));

export const getAppConfigSection = section => configuration()[section] ?? {};
