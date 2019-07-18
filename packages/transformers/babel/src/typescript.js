// @flow
import path from 'path';

export default function getTypescriptOptions(config) {
  return {
    plugins: [
      [
        '@babel/plugin-transform-typescript',
        {isTSX: path.extname(config.searchPath) === '.tsx'}
      ]
    ]
  };
}
