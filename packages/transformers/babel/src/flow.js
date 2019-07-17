// @flow

/**
 * Generates a babel config for stripping away Flow types.
 */
export default async function getFlowConfig(config) {
  if (!(await config.isSource())) {
    return null;
  }

  return {
    plugins: ['@babel/plugin-transform-flow-strip-types']
  };
}
