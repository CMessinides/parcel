// @flow
import {loadPartialConfig, createConfigItem} from '@babel/core';
import getEnvOptions from './env';
import getJSXOptions from './jsx';
import getFlowOptions from './flow';

type BabelConfig = {
  plugins?: Array<any>,
  presets?: Array<any>
};

export async function load(config) {
  let partialConfig = loadPartialConfig({filename: config.searchPath});
  if (partialConfig && partialConfig.hasFilesystemConfig()) {
    config.setResult({
      internal: false,
      config: partialConfig.options
    });

    if (canBeCached(partialConfig)) {
      config.needsToBeRehydrated = true;
    } else {
      config.setResultHash(Date.now());
      config.needsToBeReloaded = true;
    }
    // // TODO: invalidate on startup
  } else {
    await buildDefaultBabelConfig(config);
  }
}

async function buildDefaultBabelConfig(config) {
  let babelOptions = await getEnvOptions(config);
  let jsxConfig = await getJSXOptions(config);
  babelOptions = mergeConfigs(babelOptions, jsxConfig);
  let flowConfig = await getFlowOptions(config);
  babelOptions = mergeConfigs(babelOptions, flowConfig);

  config.setResult({
    internal: true,
    config: babelOptions
  });
}

function mergeConfigs(result, config?: null | BabelConfig) {
  if (
    !config ||
    ((!config.presets || config.presets.length === 0) &&
      (!config.plugins || config.plugins.length === 0))
  ) {
    return result;
  }

  let merged = result;
  if (merged) {
    merged.presets = (merged.presets || []).concat(config.presets || []);
    merged.plugins = (merged.plugins || []).concat(config.plugins || []);
  } else {
    result = config;
  }

  return result;
}

function canBeCached(partialConfig) {
  for (let configItem of partialConfig.options.presets) {
    if (!configItem.file) {
      return false;
    }
  }

  for (let configItem of partialConfig.options.plugins) {
    if (!configItem.file) {
      return false;
    }
  }

  return true;
}

export function rehydrate(config) {
  config.config.options.presets = config.config.options.presets.map(
    configItem => createConfigItem(require(configItem.file.resolved).default)
  );
  config.config.options.plugins = config.config.options.plugins.map(
    configItem => createConfigItem(require(configItem.file.resolved).default)
  );
}
