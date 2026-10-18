export class CoreError extends Error {
    constructor(code, message, data = {}) {
        super(message);
        this.code = code;
        this.data = data;
    }
}

export const fail = (code, message, data) => {
    throw new CoreError(code, message, data);
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
