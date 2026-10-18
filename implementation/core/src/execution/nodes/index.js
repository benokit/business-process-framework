import { control } from './control.js';
import { calls } from './calls.js';
import { context } from './context.js';
import { middleware } from './middleware.js';

export const executors = { ...control, ...calls, ...context, ...middleware };
