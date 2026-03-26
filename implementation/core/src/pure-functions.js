import { compile } from 'lambdajson-js';

const pureFunctionPrimitives = {};

function registerPureFunction(element) {
    let compiledFn;
    pureFunctionPrimitives[`$func/${element.id}`] = compiledArg => ({ vars, input }) => {
        if (!compiledFn) compiledFn = compile(element.data);
        return compiledFn(compiledArg({ vars, input }));
    };
}

function getPureFunctionPrimitives() {
    return pureFunctionPrimitives;
}

export {
    registerPureFunction,
    getPureFunctionPrimitives
};
