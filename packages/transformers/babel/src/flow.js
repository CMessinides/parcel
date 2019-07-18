// @flow
import path from 'path';

/**
 * Generates a babel config for stripping away Flow types.
 */

const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx'];

export default async function getFlowConfig(config) {
  if (
    !(await config.isSource()) ||
    TYPESCRIPT_EXTENSIONS.includes(path.extname(config.searchPath))
  ) {
    return null;
  }

  return {
    plugins: [
      ['@babel/plugin-transform-flow-strip-types', {requireDirective: true}]
    ]
  };
}
