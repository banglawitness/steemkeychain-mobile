const {getDefaultConfig} = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

function packageDir(name) {
  return path.dirname(require.resolve(`${name}/package.json`));
}

config.resolver.extraNodeModules = {
  assert: packageDir('assert'),
  buffer: packageDir('buffer'),
  crypto: packageDir('crypto-browserify'),
  events: packageDir('events'),
  path: packageDir('path-browserify'),
  process: packageDir('process'),
  stream: packageDir('stream-browserify'),
  util: packageDir('util'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws') {
    return {
      filePath: path.join(__dirname, 'src/shims/ws.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
