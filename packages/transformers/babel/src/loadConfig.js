// @flow
import path from 'path';
import {loadPartialConfig, createConfigItem} from '@babel/core';

import {loadConfig as loadGenericConfig} from '@parcel/utils';

import getEnvOptions from './env';
import getJSXOptions from './jsx';
import getFlowOptions from './flow';
import getTypescriptOptions from './typescript';

type BabelConfig = {
  plugins?: Array<any>,
  presets?: Array<any>
};

const TYPESCRIPT_EXTNAME_RE = /^\.tsx?/;
const BABEL_TRANSFORMER_DIR = path.dirname(__dirname);

export async function load(config) {
  let partialConfig = loadPartialConfig({filename: config.searchPath});
  if (partialConfig && partialConfig.hasFilesystemConfig()) {
    let {babelrc, config: configjs} = partialConfig;

    if (babelrc != null && configjs == null) {
      config.setResolvedPath(babelrc);
    }

    config.setResult({
      internal: false,
      config: partialConfig.options
    });

    if (canBeRehydrated(partialConfig)) {
      config.shouldRehydrate();
      await definePluginDependencies(config);
    } else {
      config.setResultHash(Date.now());
      config.shouldReload();
      // TODO: invalidate on startup
    }
  } else {
    await buildDefaultBabelConfig(config);
  }
}

async function buildDefaultBabelConfig(config) {
  let babelOptions;
  if (path.extname(config.searchPath).match(TYPESCRIPT_EXTNAME_RE)) {
    babelOptions = await getTypescriptOptions(config);
  } else {
    babelOptions = await getFlowOptions(config);
  }

  babelOptions = mergeConfigs(babelOptions, await getEnvOptions(config));
  babelOptions = mergeConfigs(babelOptions, await getJSXOptions(config));

  if (babelOptions != null) {
    babelOptions.presets = (babelOptions.presets || []).map(preset =>
      createConfigItem(preset, {type: 'preset', dirname: BABEL_TRANSFORMER_DIR})
    );
    babelOptions.plugins = (babelOptions.plugins || []).map(plugin =>
      createConfigItem(plugin, {type: 'plugin', dirname: BABEL_TRANSFORMER_DIR})
    );
    config.shouldRehydrate();
  }

  config.setResult({
    internal: true,
    config: babelOptions
  });
  await definePluginDependencies(config);
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

function canBeRehydrated(partialConfig) {
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

async function definePluginDependencies(config) {
  let babelConfig = config.result.config;
  if (babelConfig == null) {
    return;
  }

  let configItems = [...babelConfig.presets, ...babelConfig.plugins];
  await Promise.all(
    configItems.map(async configItem => {
      let {config: pkg} = await loadGenericConfig(
        configItem.file.resolved,
        ['package.json'],
        {parse: true}
      );
      config.setDevDep(pkg.name, pkg.version);
    })
  );
}

export function rehydrate(config) {
  config.config.options.presets = config.config.options.presets.map(
    configItem => createConfigItem(require(configItem.file.resolved).default)
  );
  config.config.options.plugins = config.config.options.plugins.map(
    configItem => createConfigItem(require(configItem.file.resolved).default)
  );
}
