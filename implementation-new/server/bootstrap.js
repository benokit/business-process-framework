#!/usr/bin/env node
import path from 'path';
import { startServer } from './src/server.js';

const paths = process.argv.slice(2).map(argument => path.resolve(argument));

const run = async () => {
    const stop = await startServer({ paths });
    console.log('Server started');
    const shutdown = async () => {
        await stop();
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
};

run().catch(error => {
    console.error('Bootstrap failed:', error);
    process.exit(1);
});
