const { getInstanceOfClass } = require('system/instances-registry');

module.exports = {
    getInstance
};

function getInstance(request) {
    return getInstanceOfClass(request.params.type, request.params.instance)
}
