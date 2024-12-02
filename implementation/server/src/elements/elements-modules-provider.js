const vm = require('vm');
const path = require('path');
const { getDefinition } = require('elements-definitions-provider');

const elementsModulesCache = {};

function getModule(moduleName) {

  if (elementsModulesCache[moduleName]) {
    return moduleCache[moduleName].exports;
  }

  const { moduleCode } = getDefinition({ elementType: 'js-module', elementName: moduleName });

  const exports = {};
  const module = { exports };
  
  const script = new vm.Script(moduleCode, {
    filename: path.basename(moduleName),
  });

  const sandbox = {
    exports,
    module,
    require,
    console,
  };

  vm.createContext(sandbox);
  script.runInContext(sandbox);

  moduleCache[moduleName] = module;
  return module.exports;
}

exports.getModule = getModule;