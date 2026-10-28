export class CoreError extends Error {
    constructor(code, message, data = {}, cause = undefined) {
        super(message, cause === undefined ? undefined : { cause });
        this.code = code;
        this.data = data;
    }
}

export const fail = (code, message, data) => {
    throw new CoreError(code, message, data);
};

const framed = (error, label) => {
    if (error instanceof CoreError) error.data = { ...error.data, frames: [label.map(part => typeof part === 'function' ? part() : part).join(' '), ...error.data.frames ?? []] };
    return error;
};

export const withFrame = (run, ...label) => {
    try {
        const result = run();
        return result instanceof Promise ? result.catch(error => { throw framed(error, label); }) : result;
    } catch (error) {
        throw framed(error, label);
    }
};

export const describe = error => {
    const frames = error.data?.frames ?? [];
    return `${error.code ?? 'error'}: ${error.message ?? error}${frames.length > 0 ? `\n  at ${frames.join(' > ')}` : ''}`;
};

export const problemsOf = check => {
    try {
        check();
        return [];
    } catch (error) {
        return [error instanceof CoreError
            ? { code: error.code, message: error.message, data: error.data }
            : { code: 'error', message: String(error?.message ?? error), data: {} }];
    }
};
