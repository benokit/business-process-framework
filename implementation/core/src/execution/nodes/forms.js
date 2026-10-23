export const NODE_KEYS = ['inputMap', 'outputKey'];

export const nodeForms = {
    set: [],
    if: ['then', 'else'],
    switch: [],
    forEach: [],
    try: ['catch', 'finally'],
    throw: [],
    return: [],
    invoke: ['operation'],
    execute: [],
    low: [],
    withContext: ['do'],
    middleware: ['action'],
    next: []
};

export const PIPELINE_KEYS = ['then', 'else', 'forEach', 'try', 'catch', 'finally', 'do', 'action'];
