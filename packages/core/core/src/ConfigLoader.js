// @flow
import nullthrows from 'nullthrows';

import type {ConfigRequest, ParcelOptions} from '@parcel/types';
import {md5FromString} from '@parcel/utils';

import Config from './Config';
import type ParcelConfig from './ParcelConfig';
import loadParcelConfig from './loadParcelConfig';
import loadPlugin from './loadParcelPlugin';

export default class ConfigLoader {
  options: ParcelOptions;
  parcelConfig: ParcelConfig;

  constructor(options: ParcelOptions) {
    this.options = options;
  }

  load(configRequest: ConfigRequest) {
    if (!configRequest.plugin) {
      return this.loadParcelConfig(configRequest);
    }

    return this.loadPluginConfig(configRequest);
  }

  async loadParcelConfig(configRequest: ConfigRequest) {
    let {filePath} = configRequest;
    let config = new Config({searchPath: filePath});

    let {config: parcelConfig, extendedFiles} = nullthrows(
      await loadParcelConfig(filePath, this.options)
    );

    config.setResolvedPath(parcelConfig.filePath);
    config.setResult(parcelConfig);
    this.parcelConfig = parcelConfig;

    let devDeps = [];
    switch (configRequest.meta.actionType) {
      case 'transformation':
        devDeps = parcelConfig.getTransformerNames(filePath);
        break;
      case 'dependency':
        devDeps = parcelConfig.getResolverNames();
        break;
    }
    devDeps.forEach(devDep => config.setDevDep(devDep));

    config.setResultHash(md5FromString(JSON.stringify(devDeps)));

    config.setWatchGlob('**/.parcelrc');

    // TODO: if extended config comes from a package, yarn.lock change should invalidate config request
    // let reliesOnLockFile = false;
    for (let extendedFile of extendedFiles) {
      // // ? Does this work for Windows
      // if (extendedFile.includes('/node_modules/')) {
      //   reliesOnLockFile = true;
      // }

      config.addIncludedFile(extendedFile);
    }

    // if (reliesOnLockFile) {
    //   config.addInvalidatingFile(this.options.lockFilePath);
    // }

    return config;
  }

  async loadPluginConfig({
    plugin,
    filePath,
    meta: {parcelConfigPath}
  }: ConfigRequest) {
    let config = new Config({searchPath: filePath});
    plugin = await loadPlugin(nullthrows(plugin), parcelConfigPath);

    plugin.loadConfig && plugin.loadConfig(config);

    return config;
  }
}