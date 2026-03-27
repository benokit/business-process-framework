import { compile } from 'lambdajson-js';

const pureFunctionPrimitives = {};

function registerPureFunction(element) {
    let compiledFn;
    pureFunctionPrimitives[`$func/${element.id}`] = f => x => {
        if (!compiledFn) compiledFn = compile(element.data, pureFunctionPrimitives);
        return compiledFn(f(x));
    };
}

function getPureFunctionPrimitives() {
    return pureFunctionPrimitives;
}

export {
    registerPureFunction,
    getPureFunctionPrimitives
};
