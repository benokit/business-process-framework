import { randomUUID } from 'crypto';

function guid() { return { value: randomUUID() }; }
function uuid() { return { value: randomUUID() }; }

export { guid, uuid };
