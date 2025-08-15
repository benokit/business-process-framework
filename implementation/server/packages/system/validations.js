
function isFunction(fn) {
  return typeof fn === 'function';
}

function isAsyncFunction(fn) {
  return typeof fn === 'function' && fn.constructor.name === 'AsyncFunction';
}

function isArray(o) {
    return Array.isArray(o);
}

module.exports = {
    isFunction,
    isAsyncFunction,
    isArray
}