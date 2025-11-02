
function splitAtFirstAt(str) {
  const idx = str.indexOf('@');
  if (idx === -1) {
    return [undefined, str];
  }
  return [str.slice(0, idx), str.slice(idx + 1)];
}

async function getImplementation(implementationUrl) {
    const [fn, module] = splitAtFirstAt(implementationUrl);
    const impl = await import(module);
    return fn ? impl[fn] : impl.default;
}

export {
    getImplementation
};