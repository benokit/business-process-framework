
function splitAtFirstAt(str) {
  const idx = str.indexOf("@");
  if (idx === -1) {
    return [undefined, str];
  }
  return [str.slice(0, idx), str.slice(idx + 1)];
}

function getImplementation(implementationUrl) {
    const [fn, module] = splitAtFirstAt(implementationUrl);
    const impl = require(module);
    return fn ? impl[fn] : impl;
}

module.exports = {
    getImplementation
}