// @flow
import path from 'path';

import * as fs from '@parcel/fs';
import type {
  Environment,
  FilePath,
  Glob,
  PackageJSON,
  PackageName,
  ParcelOptions
} from '@parcel/types';
import {loadConfig} from '@parcel/utils';

const NODE_MODULES = `${path.sep}node_modules${path.sep}`;

type ConfigOpts = {|
  searchPath: FilePath,
  env: Environment,
  options: ParcelOptions,
  resolvedPath?: FilePath,
  result?: any,
  includedFiles?: Set<FilePath>,
  watchGlob?: Glob,
  devDeps?: Map<PackageName, ?string>,
  rehydrate?: boolean,
  reload?: boolean
|};

export default class Config {
  searchPath: FilePath;
  env: Environment;
  options: ParcelOptions;
  resolvedPath: ?FilePath;
  result: ?any;
  resultHash: ?string;
  includedFiles: Set<FilePath>;
  watchGlob: ?Glob;
  devDeps: Map<PackageName, ?string>;
  pkg: ?PackageJSON;
  rehydrate: ?boolean;
  reload: ?boolean;

  constructor({
    searchPath,
    env,
    options,
    resolvedPath,
    result,
    includedFiles,
    watchGlob,
    devDeps,
    rehydrate,
    reload
  }: ConfigOpts) {
    this.searchPath = searchPath;
    this.env = env;
    this.options = options;
    this.resolvedPath = resolvedPath;
    this.result = result || null;
    this.includedFiles = includedFiles || new Set();
    this.watchGlob = watchGlob;
    this.devDeps = devDeps || new Map();
    this.rehydrate = rehydrate;
    this.reload = reload;
  }

  setResolvedPath(filePath: FilePath) {
    this.resolvedPath = filePath;
  }

  setResult(result: any) {
    this.result = result;
  }

  setResultHash(resultHash: string) {
    this.resultHash = resultHash;
  }

  addIncludedFile(filePath: FilePath) {
    this.includedFiles.add(filePath);
  }

  setDevDep(name: PackageName, version?: string) {
    this.devDeps.set(name, version);
  }

  getDevDepVersion(name: PackageName) {
    return this.devDeps.get(name);
  }

  setWatchGlob(glob: string) {
    this.watchGlob = glob;
  }

  shouldRehydrate() {
    this.rehydrate = true;
  }

  shouldReload() {
    this.reload = true;
  }

  // This will be more useful when we have edge types
  getInvalidations() {
    let invalidations = [];

    if (this.watchGlob) {
      invalidations.push({
        action: 'add',
        pattern: this.watchGlob
      });
    }

    for (let filePath of [this.resolvedPath, ...this.includedFiles]) {
      invalidations.push({
        action: 'change',
        pattern: filePath
      });

      invalidations.push({
        action: 'unlink',
        pattern: filePath
      });
    }

    return invalidations;
  }

  async getConfig(
    filePaths: Array<FilePath>,
    options: ?{packageKey?: string, parse?: boolean}
  ): Promise<Config | null> {
    let packageKey = options?.packageKey;
    let parse = options && options.parse;

    if (packageKey != null) {
      let pkg = await this.getPackage();
      if (pkg && pkg[packageKey]) {
        return pkg[packageKey];
      }
    }

    let conf = await loadConfig(
      this.searchPath,
      filePaths,
      parse == null ? null : {parse}
    );
    if (!conf) {
      return null;
    }

    for (let file of conf.files) {
      this.addIncludedFile(file);
    }

    return conf.config;
  }

  async getPackage(): Promise<PackageJSON | null> {
    if (this.pkg) {
      return this.pkg;
    }

    this.pkg = await this.getConfig(['package.json']);
    return this.pkg;
  }

  // TODO: pick a better name?
  async isSource() {
    let pkg = await this.getPackage();
    return (
      !!(
        pkg &&
        pkg.source &&
        (await fs.realpath(this.searchPath)) !== this.searchPath
      ) || !this.searchPath.includes(NODE_MODULES)
    );
  }
}
