// @flow strict-local

import invariant from 'assert';
import nullthrows from 'nullthrows';

import type {
  Dependency as IDependency,
  GraphVisitor,
  Target
} from '@parcel/types';
import {md5FromObject} from '@parcel/utils';

import type Asset from './Asset';
import Dependency from './Dependency';
import Graph, {type GraphOpts} from './Graph';
import type {AssetGraphNode, AssetGroup, DependencyNode} from './types';

type AssetGraphOpts = {|
  ...GraphOpts<AssetGraphNode>,
  onNodeAdded?: (node: AssetGraphNode) => mixed,
  onNodeRemoved?: (node: AssetGraphNode) => mixed
|};

type InitOpts = {|
  entries?: Array<string>,
  targets?: Array<Target>,
  assetGroup?: AssetGroup
|};

const invertMap = <K, V>(map: Map<K, V>): Map<V, K> =>
  new Map([...map].map(([key, val]) => [val, key]));

export const nodeFromDep = (dep: Dependency): DependencyNode => ({
  id: dep.id,
  type: 'dependency',
  value: dep
});

export const nodeFromAssetGroup = (assetGroup: AssetGroup) => ({
  id: md5FromObject(assetGroup),
  type: 'asset_group',
  value: assetGroup
});

const nodeFromAsset = (asset: Asset) => ({
  id: asset.id,
  type: 'asset',
  value: asset
});

export default class AssetGraph extends Graph<AssetGraphNode> {
  onNodeAdded: ?(node: AssetGraphNode) => mixed;
  onNodeRemoved: ?(node: AssetGraphNode) => mixed;

  constructor({onNodeAdded, onNodeRemoved, ...graphOpts}: AssetGraphOpts = {}) {
    super(graphOpts);
    this.onNodeAdded = onNodeAdded;
    this.onNodeRemoved = onNodeRemoved;
  }

  initialize({entries, targets, assetGroup}: InitOpts) {
    let rootNode = {id: '@@root', type: 'root', value: null};
    this.setRootNode(rootNode);

    let nodes = [];
    if (entries) {
      if (!targets) {
        throw new Error('Targets are required when entries are specified');
      }

      for (let entry of entries) {
        for (let target of targets) {
          let node = nodeFromDep(
            new Dependency({
              moduleSpecifier: entry,
              target: target,
              env: target.env,
              isEntry: true
            })
          );

          nodes.push(node);
        }
      }
    } else if (assetGroup) {
      let node = nodeFromAssetGroup(assetGroup);
      nodes.push(node);
    }

    this.replaceNodesConnectedTo(rootNode, nodes);
  }

  addNode(node: AssetGraphNode) {
    this.onNodeAdded && this.onNodeAdded(node);
    return super.addNode(node);
  }

  removeNode(node: AssetGraphNode) {
    this.onNodeRemoved && this.onNodeRemoved(node);
    return super.removeNode(node);
  }

  resolveDependency(dependency: Dependency, assetGroup: AssetGroup | null) {
    if (!assetGroup) return;

    let depNode = nullthrows(this.nodes.get(dependency.id));
    let assetGroupNode = nodeFromAssetGroup(assetGroup);

    // Defer transforming this dependency if it is marked as weak, there are no side effects,
    // and no re-exported symbols are used by ancestor dependencies.
    // This helps with performance building large libraries like `lodash-es`, which re-exports
    // a huge number of functions since we can avoid even transforming the files that aren't used.
    let defer = false;
    if (dependency.isWeak && assetGroup.sideEffects === false) {
      let assets = this.getNodesConnectedTo(depNode);
      let symbols = invertMap(dependency.symbols);
      let firstAsset = assets[0];
      invariant(
        firstAsset.type === 'asset' || firstAsset.type === 'asset_reference'
      );
      let resolvedAsset =
        firstAsset.type === 'asset_reference'
          ? firstAsset.value.asset
          : firstAsset.value;
      let deps = this.getIncomingDependencies(resolvedAsset);
      defer = deps.every(
        d =>
          !d.symbols.has('*') &&
          ![...d.symbols.keys()].some(symbol => {
            let assetSymbol = resolvedAsset.symbols.get(symbol);
            return assetSymbol != null && symbols.has(assetSymbol);
          })
      );
    }

    if (!defer) {
      this.replaceNodesConnectedTo(depNode, [assetGroupNode]);
    }
  }

  resolveAssetGroup(assetGroup: AssetGroup, assets: Array<Asset>) {
    let assetGroupNode = nodeFromAssetGroup(assetGroup);
    assetGroupNode = nullthrows(this.nodes.get(assetGroupNode.id));

    let assetNodes = [];
    for (let asset of assets) {
      let assetNode = nodeFromAsset(asset);
      assetNodes.push(assetNode);
      let depNodes = [];
      for (let dep of asset.getDependencies()) {
        let depNode = nodeFromDep(dep);
        depNodes.push(this.nodes.get(depNode.id) || depNode);
      }
      this.replaceNodesConnectedTo(assetNode, depNodes);
    }
    this.replaceNodesConnectedTo(assetGroupNode, assetNodes);
  }

  getDependencies(asset: Asset): Array<IDependency> {
    let node = this.getNode(asset.id);
    if (!node) {
      return [];
    }

    return this.getNodesConnectedFrom(node).map(node => {
      invariant(node.type === 'dependency');
      return node.value;
    });
  }

  getDependencyResolution(dep: IDependency): ?Asset {
    let depNode = this.getNode(dep.id);
    if (!depNode) {
      return null;
    }

    let res: ?Asset = null;
    this.traverse((node, ctx, traversal) => {
      // Prefer real assets when resolving dependencies, but use the first
      // asset reference in absence of a real one.
      if (node.type === 'asset_reference' && !res) {
        res = node.value;
      }

      if (node.type === 'asset') {
        res = node.value;
        traversal.stop();
      }
    }, depNode);

    return res;
  }

  getIncomingDependencies(asset: Asset): Array<IDependency> {
    let node = this.getNode(asset.id);
    if (!node) {
      return [];
    }

    return this.findAncestors(node, node => node.type === 'dependency').map(
      node => {
        invariant(node.type === 'dependency');
        return node.value;
      }
    );
  }

  traverseAssets<TContext>(
    visit: GraphVisitor<Asset, TContext>,
    startNode: ?AssetGraphNode
  ): ?TContext {
    return this.filteredTraverse(
      node => (node.type === 'asset' ? node.value : null),
      visit,
      startNode
    );
  }

  getEntryAssets(): Array<Asset> {
    let entries = [];
    this.traverseAssets((asset, ctx, traversal) => {
      entries.push(asset);
      traversal.skipChildren();
    });

    return entries;
  }
}
