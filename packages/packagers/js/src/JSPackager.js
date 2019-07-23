// @flow strict-local

import invariant from 'assert';
import {Packager} from '@parcel/plugin';
import fs from 'fs';
import {concat, link, generate} from '@parcel/scope-hoisting';
import SourceMap from '@parcel/source-map';
import {countLines} from '@parcel/utils';
import path from 'path';

const PRELUDE = fs
  .readFileSync(__dirname + '/prelude.js', 'utf8')
  .trim()
  .replace(/;$/, '');

export default new Packager({
  async package({bundle, bundleGraph, sourceMapPath, options}) {
    // If scope hoisting is enabled, we use a different code path.
    if (options.scopeHoist) {
      let ast = await concat(bundle, bundleGraph);
      ast = link(bundle, ast, options);
      return generate(bundle, ast, options);
    }

    // For development, we just concatenate all of the code together
    // rather then enabling scope hoisting, which would be too slow.
    let codePromises = [];
    let mapPromises = [];
    bundle.traverse(node => {
      if (node.type === 'asset') {
        codePromises.push(node.value.getCode());
        mapPromises.push(node.value.getMap());
      }
    });

    let [code, maps] = await Promise.all([
      Promise.all(codePromises),
      Promise.all(mapPromises)
    ]);

    let assets = '';
    let i = 0;
    let first = true;
    let map = new SourceMap();
    let lineOffset = countLines(PRELUDE);

    let stubsWritten = new Set();
    bundle.traverse(node => {
      let wrapped = first ? '' : ',';

      if (node.type === 'dependency') {
        let resolution = bundleGraph.getDependencyResolution(node.value);
        if (
          resolution &&
          resolution.type !== 'js' &&
          !stubsWritten.has(resolution.id)
        ) {
          // if this is a reference to another javascript asset, we should not include
          // its output, as its contents should already be loaded.
          invariant(!bundle.hasAsset(resolution));
          wrapped += JSON.stringify(resolution.id) + ':[function() {},{}]';
        } else {
          return;
        }
      }

      if (node.type === 'asset') {
        let asset = node.value;
        invariant(
          asset.type === 'js',
          'all assets in js bundle must be js assets'
        );

        let deps = {};
        let dependencies = bundle.getDependencies(asset);
        for (let dep of dependencies) {
          let resolution = bundle.getDependencyResolution(dep);
          if (resolution) {
            deps[dep.moduleSpecifier] = resolution.id;
          }
        }

        let output = code[i] || '';
        wrapped +=
          JSON.stringify(asset.id) +
          ':[function(require,module,exports) {\n' +
          output +
          '\n},';
        wrapped += JSON.stringify(deps);
        wrapped += ']';

        if (options.sourceMaps) {
          let assetMap =
            maps[i] ??
            SourceMap.generateEmptyMap(
              path
                .relative(options.projectRoot, asset.filePath)
                .replace(/\\+/g, '/'),
              output
            );

          map.addMap(assetMap, lineOffset);
          lineOffset += countLines(output) + 1;
        }
        i++;
      }

      assets += wrapped;
      first = false;
    });

    let entryAsset = bundle.getEntryAssets()[0];
    // $FlowFixMe
    let interpreter: ?string = bundle.target.env.isBrowser()
      ? null
      : entryAsset.meta.interpreter;

    return {
      contents:
        // If the entry asset included a hashbang, repeat it at the top of the bundle
        (interpreter != null ? `#!${interpreter}\n` : '') +
        (PRELUDE +
          '({' +
          assets +
          '},{},' +
          JSON.stringify(
            bundle
              .getEntryAssets()
              .reverse()
              .map(asset => asset.id)
          ) +
          ', ' +
          'null' +
          ')\n\n' +
          '//# sourceMappingURL=' +
          sourceMapPath +
          '\n'),
      map
    };
  }
});
