import EventEmitter from 'events'
const emitter = new EventEmitter(); 

export {
  publish,
  registerConsumer
}

function publish({ namespace }, { channelName, message }) {
  const destination = namespace ? `${namespace}.${channelName}` : channelName;
  emitter.emit(destination, message);
}

function registerConsumer({ namespace }, { channelName, handler }) {
  const destination = namespace ? `${namespace}.${channelName}` : channelName;
  emitter.on(destination, handler);
}