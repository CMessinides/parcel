// @flow
import semver from 'semver';

import type {ConfigClass, Engines} from '@parcel/types';
import getTargetEngines from './getTargetEngines';

import presetEnv from '@babel/preset-env';

/**
 * Generates a @babel/preset-env config for an asset.
 * This is done by finding the source module's target engines, and the app's
 * target engines, and doing a diff to include only the necessary plugins.
 */
export default async function getEnvConfig(config: ConfigClass) {
  // Load the target engines for the app and generate a @babel/preset-env config
  let targetEngines = config.env.engines;
  let envOptions = await getEnvOptions(targetEngines, true);

  // ? Why would targetEnv be null
  // if (!targetEnv) {
  //   return null;
  // }

  // If this is the app module, the source and target will be the same, so just compile everything.
  // Otherwise, load the source engines and generate a babel-present-env config.
  if (!(await config.isSource())) {
    let sourceEngines = await getTargetEngines(config);
    if (!sourceEngines) return null;

    let appPlugins = getEnvPlugins(targetEngines, true);
    let sourcePlugins = getEnvPlugins(sourceEngines, false);

    sourcePlugins = new Set(sourcePlugins.map(p => p[0]));
    appPlugins = appPlugins.filter(plugin => {
      return !sourcePlugins.has(plugin[0]);
    });

    if (appPlugins.length === 0) return null;

    // config should maybe be rehydrated so that we only use the plugins we need to?
  }

  return {
    presets: [['@babel/preset-env', envOptions]]
  };
}

// TODO: confusing name
function getEnvOptions(engines: Engines, useBuiltIns = false) {
  if (!engines) {
    return null;
  }

  // "Targets" is the name @babel/preset-env uses for what Parcel calls engines.
  // This should not be confused with Parcel's own targets.
  // Unlike Parcel's engines, @babel/preset-env expects to work with minimum
  // versions, not semver ranges, of its targets.
  let targets = {};
  for (let engineName of Object.keys(engines)) {
    let engineValue = engines[engineName];

    // if the engineValue is a string, it might be a semver range. Use the minimum
    // possible version instead.
    if (typeof engineValue === 'string') {
      let minVersion = getMinSemver(engineValue);
      targets[engineName] = minVersion ?? engineValue;
    } else {
      targets[engineName] = engineValue;
    }
  }

  return {
    targets,
    modules: false,
    useBuiltIns: useBuiltIns ? 'entry' : false,
    corejs: '3.0.0',
    shippedProposals: true
  };
}

function getEnvPlugins(engines: Engines, useBuiltIns = false) {
  let envOptions = getEnvOptions(engines, useBuiltIns);

  let {plugins} = presetEnv({assertVersion: () => true}, envOptions);

  return plugins;
}

// TODO: Replace with `minVersion` (https://github.com/npm/node-semver#ranges-1)
//       once semver has been upgraded across Parcel.
function getMinSemver(version) {
  try {
    let range = new semver.Range(version);
    let sorted = range.set.sort((a, b) => a[0].semver.compare(b[0].semver));
    return sorted[0][0].semver.version;
  } catch (err) {
    return null;
  }
}
