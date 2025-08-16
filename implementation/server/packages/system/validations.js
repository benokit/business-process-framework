
function isAsyncFunction(fn) {
  return typeof fn === 'function' && fn.constructor.name === 'AsyncFunction';
}

module.exports = {
    isAsyncFunction
}