import { existsSync } from 'fs';
import { resolve } from 'path';
import { describeScenarios } from './mocha.js';

const directory = resolve('test', 'scenarios');

if (existsSync(directory)) await describeScenarios('scenarios', [directory]);
