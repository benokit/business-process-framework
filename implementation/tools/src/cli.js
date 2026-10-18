#!/usr/bin/env node
import path from 'path';
import { report, validateApplication } from './validate.js';

const paths = process.argv.slice(2).map(argument => path.resolve(argument));

validateApplication({ paths })
    .then(problems => {
        if (problems.length > 0) {
            console.error(report(problems));
            process.exit(1);
        }
        console.log('valid');
    })
    .catch(error => {
        console.error(`${error.code ?? 'error'}: ${error.message ?? error}`);
        process.exit(1);
    });
