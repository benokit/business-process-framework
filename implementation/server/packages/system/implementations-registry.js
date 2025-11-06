
export async function getImplementation(module) {
    const impl = await import(module);
    return (methodId, context, input) => impl[methodId](context, input);
}
