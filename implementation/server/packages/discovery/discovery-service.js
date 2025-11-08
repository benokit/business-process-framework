import { getInstance } from 'system/instances-registry.js';

export {
    getInstanceForRequest as getInstance
};

function getInstanceForRequest(request) {
    return [getInstance(request.params.instance)].filter(i => i.class === request.params.class)[0];
}
