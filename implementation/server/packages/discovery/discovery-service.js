const { getInstance } = require('system/instances-registry');

function getInstanceMethod(request) {
    return getInstance(request.params.type, request.params.instance)
}

module.exports = {
    getInstance: getInstanceMethod
};
