// @flow

/**
 * Generates a babel config for stripping away Flow types.
 */
export default async function getFlowConfig() {
  return {
    plugins: ['@babel/plugin-transform-flow-strip-types']
  };
}
