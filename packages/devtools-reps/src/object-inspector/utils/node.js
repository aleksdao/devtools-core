/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 // @flow
const { get, has } = require("lodash");
const { maybeEscapePropertyName } = require("../../reps/rep-utils");
const ArrayRep = require("../../reps/array");
const GripArrayRep = require("../../reps/grip-array");
const GripMap = require("../../reps/grip-map");
const GripMapEntryRep = require("../../reps/grip-map-entry");

const MAX_NUMERICAL_PROPERTIES = 100;

const NODE_TYPES = {
  BUCKET: Symbol("[n…n]"),
  DEFAULT_PROPERTIES: Symbol("[default properties]"),
  ENTRIES: Symbol("<entries>"),
  GET: Symbol("<get>"),
  GRIP: Symbol("GRIP"),
  MAP_ENTRY_KEY: Symbol("<key>"),
  MAP_ENTRY_VALUE: Symbol("<value>"),
  PROMISE_REASON: Symbol("<reason>"),
  PROMISE_STATE: Symbol("<state>"),
  PROMISE_VALUE: Symbol("<value>"),
  PROXY_HANDLER: Symbol("<handler>"),
  PROXY_TARGET: Symbol("<target>"),
  SET: Symbol("<set>"),
  PROTOTYPE: Symbol("__proto__"),
};

import type {
  CachedNodes,
  GripProperties,
  LoadedProperties,
  Node,
  NodeContents,
  RdpGrip,
} from "../types";

let WINDOW_PROPERTIES = {};

if (typeof window === "object") {
  WINDOW_PROPERTIES = Object.getOwnPropertyNames(window);
}

const SAFE_PATH_PREFIX = "##-";

function getType(item: Node) : Symbol {
  return item.type;
}

function getValue(
  item: Node
) : RdpGrip | NodeContents {
  if (has(item, "contents.value")) {
    return get(item, "contents.value");
  }

  if (has(item, "contents.getterValue")) {
    return get(item, "contents.getterValue", undefined);
  }

  if (nodeHasAccessors(item)) {
    return item.contents;
  }

  return undefined;
}

function nodeIsBucket(item: Node) : boolean {
  return getType(item) === NODE_TYPES.BUCKET;
}

function nodeIsEntries(item: Node) : boolean {
  return getType(item) === NODE_TYPES.ENTRIES;
}

function nodeIsMapEntry(item: Node) : boolean {
  return GripMapEntryRep.supportsObject(getValue(item));
}

function nodeHasChildren(item: Node) : boolean {
  return Array.isArray(item.contents);
}

function nodeIsObject(item: Node) : boolean {
  const value = getValue(item);
  return value && value.type === "object";
}

function nodeIsArrayLike(item: Node) : boolean {
  const value = getValue(item);
  return GripArrayRep.supportsObject(value)
    || ArrayRep.supportsObject(value);
}

function nodeIsFunction(item: Node) : boolean {
  const value = getValue(item);
  return value && value.class === "Function";
}

function nodeIsOptimizedOut(item: Node) : boolean {
  const value = getValue(item);
  return !nodeHasChildren(item) && value && value.optimizedOut;
}

function nodeIsMissingArguments(item: Node) : boolean {
  const value = getValue(item);
  return !nodeHasChildren(item) && value && value.missingArguments;
}

function nodeHasProperties(item: Node) : boolean {
  return !nodeHasChildren(item) && nodeIsObject(item);
}

function nodeIsPrimitive(item: Node) : boolean {
  return !nodeHasChildren(item)
    && !nodeHasProperties(item)
    && !nodeIsEntries(item)
    && !nodeIsMapEntry(item)
    && !nodeHasAccessors(item)
    && !nodeIsBucket(item);
}

function nodeIsDefaultProperties(
  item: Node
) : boolean {
  return getType(item) === NODE_TYPES.DEFAULT_PROPERTIES;
}

function isDefaultWindowProperty(name:string) : boolean {
  return WINDOW_PROPERTIES.includes(name);
}

function nodeIsPromise(item: Node) : boolean {
  const value = getValue(item);
  if (!value) {
    return false;
  }

  return value.class == "Promise";
}

function nodeIsProxy(item: Node) : boolean {
  const value = getValue(item);
  if (!value) {
    return false;
  }

  return value.class == "Proxy";
}

function nodeIsPrototype(
  item: Node
) : boolean {
  return getType(item) === NODE_TYPES.PROTOTYPE;
}

function nodeIsWindow(
  item: Node
) : boolean {
  const value = getValue(item);
  if (!value) {
    return false;
  }

  return value.class == "Window";
}

function nodeIsGetter(
  item: Node
) : boolean {
  return getType(item) === NODE_TYPES.GET;
}

function nodeIsSetter(
  item: Node
) : boolean {
  return getType(item) === NODE_TYPES.SET;
}

function nodeHasAccessors(item: Node) : boolean {
  return !!getNodeGetter(item) || !!getNodeSetter(item);
}

function nodeSupportsNumericalBucketing(item: Node) : boolean {
  // We exclude elements with entries since it's the <entries> node
  // itself that can have buckets.
  return (nodeIsArrayLike(item) && !nodeHasEntries(item))
    || nodeIsEntries(item)
    || nodeIsBucket(item);
}

function nodeHasEntries(
  item : Node
) : boolean {
  const value = getValue(item);
  if (!value) {
    return false;
  }

  return value.class === "Map"
    || value.class === "Set"
    || value.class === "WeakMap"
    || value.class === "WeakSet";
}

function nodeHasAllEntriesInPreview(item : Node) : boolean {
  const { preview } = getValue(item) || {};
  if (!preview) {
    return false;
  }

  const {
    entries,
    items,
    length,
    size,
  } = preview;

  if (!entries && !items) {
    return false;
  }

  return entries
    ? entries.length === size
    : items.length === length;
}

function nodeNeedsNumericalBuckets(item : Node) : boolean {
  return nodeSupportsNumericalBucketing(item)
    && getNumericalPropertiesCount(item) > MAX_NUMERICAL_PROPERTIES;
}

function makeNodesForPromiseProperties(
  item: Node
) : Array<Node> {
  const { promiseState: { reason, value, state } } = getValue(item);

  const properties = [];

  if (state) {
    properties.push(
      createNode(
        item,
        "<state>",
        `${item.path}/${SAFE_PATH_PREFIX}state`,
        { value: state },
        NODE_TYPES.PROMISE_STATE
      )
    );
  }

  if (reason) {
    properties.push(
      createNode(
        item,
        "<reason>",
        `${item.path}/${SAFE_PATH_PREFIX}reason`,
        { value: reason },
        NODE_TYPES.PROMISE_REASON
      )
    );
  }

  if (value) {
    properties.push(
      createNode(
        item,
        "<value>",
        `${item.path}/${SAFE_PATH_PREFIX}value`,
        { value: value },
        NODE_TYPES.PROMISE_VALUE
      )
    );
  }

  return properties;
}

function makeNodesForProxyProperties(
  item: Node
) : Array<Node> {
  const {
    proxyHandler,
    proxyTarget,
  } = getValue(item);

  return [
    createNode(
      item,
      "<target>",
      `${item.path}/${SAFE_PATH_PREFIX}target`,
      { value: proxyTarget },
      NODE_TYPES.PROXY_TARGET
    ),
    createNode(
      item,
      "<handler>",
      `${item.path}/${SAFE_PATH_PREFIX}handler`,
      { value: proxyHandler },
      NODE_TYPES.PROXY_HANDLER
    ),
  ];
}

function makeNodesForEntries(
  item : Node
) : Node {
  const {path} = item;
  const nodeName = "<entries>";
  const entriesPath = `${path}/${SAFE_PATH_PREFIX}entries`;

  if (nodeHasAllEntriesInPreview(item)) {
    let entriesNodes = [];
    const { preview } = getValue(item);
    if (preview.entries) {
      entriesNodes = preview.entries.map(([key, value], index) => {
        return createNode(item, index, `${entriesPath}/${index}`, {
          value: GripMapEntryRep.createGripMapEntry(key, value)
        });
      });
    } else if (preview.items) {
      entriesNodes = preview.items.map((value, index) => {
        return createNode(item, index, `${entriesPath}/${index}`, {value});
      });
    }
    return createNode(item, nodeName, entriesPath, entriesNodes, NODE_TYPES.ENTRIES);
  }
  return createNode(item, nodeName, entriesPath, null, NODE_TYPES.ENTRIES);
}

function makeNodesForMapEntry(
  item: Node
) : Array<Node> {
  const nodeValue = getValue(item);
  if (!nodeValue || !nodeValue.preview) {
    return [];
  }

  const {key, value} = nodeValue.preview;
  const path = item.path;

  return [
    createNode(item, "<key>", `${path}/##key`, {value: key}, NODE_TYPES.MAP_ENTRY_KEY),
    createNode(item, "<value>", `${path}/##value`, {value}, NODE_TYPES.MAP_ENTRY_VALUE),
  ];
}

function getNodeGetter(item: Node): ?Object {
  return get(item, "contents.get", undefined);
}

function getNodeSetter(item: Node): ?Object {
  return get(item, "contents.set", undefined);
}

function makeNodesForAccessors(item: Node) : Array<Node> {
  const accessors = [];

  const getter = getNodeGetter(item);
  if (getter && getter.type !== "undefined") {
    accessors.push(createNode(
      item,
      "<get>",
      `${item.path}/${SAFE_PATH_PREFIX}get`,
      { value: getter },
      NODE_TYPES.GET
    ));
  }

  const setter = getNodeSetter(item);
  if (setter && setter.type !== "undefined") {
    accessors.push(createNode(
      item,
      "<set>",
      `${item.path}/${SAFE_PATH_PREFIX}set`,
      { value: setter },
      NODE_TYPES.SET
    ));
  }

  return accessors;
}

function sortProperties(properties: Array<any>) : Array<any> {
  return properties.sort((a, b) => {
    // Sort numbers in ascending order and sort strings lexicographically
    const aInt = parseInt(a, 10);
    const bInt = parseInt(b, 10);

    if (isNaN(aInt) || isNaN(bInt)) {
      return a > b ? 1 : -1;
    }

    return aInt - bInt;
  });
}

function makeNumericalBuckets(
  parent: Node
) : Array<Node> {
  const parentPath = parent.path;
  const numProperties = getNumericalPropertiesCount(parent);

  // We want to have at most a hundred slices.
  const bucketSize = 10 ** Math.max(2, Math.ceil(Math.log10(numProperties)) - 2);
  const numBuckets = Math.ceil(numProperties / bucketSize);

  let buckets = [];
  for (let i = 1; i <= numBuckets; i++) {
    const minKey = (i - 1) * bucketSize;
    const maxKey = Math.min(i * bucketSize - 1, numProperties - 1);
    const startIndex = nodeIsBucket(parent) ? parent.meta.startIndex : 0;
    const minIndex = startIndex + minKey;
    const maxIndex = startIndex + maxKey;
    const bucketKey = `${SAFE_PATH_PREFIX}bucket_${minIndex}-${maxIndex}`;
    const bucketName = `[${minIndex}…${maxIndex}]`;

    buckets.push(createNode(
      parent,
      bucketName,
      `${parentPath}/${bucketKey}`,
      null,
      NODE_TYPES.BUCKET,
      {
        startIndex: minIndex,
        endIndex: maxIndex,
      }
    ));
  }
  return buckets;
}

function makeDefaultPropsBucket(
  propertiesNames: Array<string>,
  parent: Node,
  ownProperties: Object
) : Array<Node> {
  const parentPath = parent.path;

  const userPropertiesNames = [];
  const defaultProperties = [];

  propertiesNames.forEach(name => {
    if (isDefaultWindowProperty(name)) {
      defaultProperties.push(name);
    } else {
      userPropertiesNames.push(name);
    }
  });

  let nodes = makeNodesForOwnProps(userPropertiesNames, parent, ownProperties);

  if (defaultProperties.length > 0) {
    const defaultPropertiesNode = createNode(
      parent,
      "[default properties]",
      `${parentPath}/${SAFE_PATH_PREFIX}default`,
      null,
      NODE_TYPES.DEFAULT_PROPERTIES
    );

    const defaultNodes = defaultProperties.map((name, index) =>
      createNode(
        defaultPropertiesNode,
        maybeEscapePropertyName(name),
        `${parentPath}/${SAFE_PATH_PREFIX}bucket${index}/${name}`,
        ownProperties[name]
      )
    );
    nodes.push(
      setNodeChildren(defaultPropertiesNode, defaultNodes)
    );
  }
  return nodes;
}

function makeNodesForOwnProps(
  propertiesNames: Array<string>,
  parent: Node,
  ownProperties: Object
) : Array<Node> {
  const parentPath = parent.path;
  return propertiesNames.map(name =>
    createNode(
      parent,
      maybeEscapePropertyName(name),
      `${parentPath}/${name}`,
      ownProperties[name]
    )
  );
}

function makeNodesForProperties(
  objProps: GripProperties,
  parent: Node
) : Array<Node> {
  const {
    ownProperties = {},
    ownSymbols,
    prototype,
    safeGetterValues,
  } = objProps;

  const parentPath = parent.path;
  const parentValue = getValue(parent);

  let allProperties = Object.assign({}, ownProperties, safeGetterValues);

  // Ignore properties that are neither non-concrete nor getters/setters.
  const propertiesNames = sortProperties(Object.keys(allProperties)).filter(name => {
    if (!allProperties[name]) {
      return false;
    }

    const properties = Object.getOwnPropertyNames(allProperties[name]);
    return properties
      .some(property => ["value", "getterValue", "get", "set"].includes(property));
  });

  let nodes = [];
  if (parentValue && parentValue.class == "Window") {
    nodes = makeDefaultPropsBucket(propertiesNames, parent, allProperties);
  } else {
    nodes = makeNodesForOwnProps(propertiesNames, parent, allProperties);
  }

  if (Array.isArray(ownSymbols)) {
    ownSymbols.forEach((ownSymbol, index) => {
      nodes.push(
        createNode(
          parent,
          ownSymbol.name,
          `${parentPath}/${SAFE_PATH_PREFIX}symbol-${index}`,
          ownSymbol.descriptor || null
        )
      );
    }, this);
  }

  if (nodeIsPromise(parent)) {
    nodes.push(...makeNodesForPromiseProperties(parent));
  }

  if (nodeHasEntries(parent)) {
    nodes.push(makeNodesForEntries(parent));
  }

  // Add the prototype if it exists and is not null
  if (prototype && prototype.type !== "null") {
    nodes.push(makeNodeForPrototype(objProps, parent));
  }

  return nodes;
}

function makeNodeForPrototype(
  objProps: GripProperties,
  parent: Node
) : ?Node {
  const {
    prototype,
  } = objProps || {};

  // Add the prototype if it exists and is not null
  if (prototype && prototype.type !== "null") {
    return createNode(
      parent,
      "__proto__",
      `${parent.path}/__proto__`,
      { value: prototype },
      NODE_TYPES.PROTOTYPE
    );
  }

  return null;
}

function createNode(
  parent: Node,
  name: string,
  path: string,
  contents: any,
  type: ?Symbol = NODE_TYPES.GRIP,
  meta: ?Object
) : ?Node {
  if (contents === undefined) {
    return null;
  }

  // The path is important to uniquely identify the item in the entire
  // tree. This helps debugging & optimizes React's rendering of large
  // lists. The path will be separated by property name,
  // i.e. `{ foo: { bar: { baz: 5 }}}` will have a path of `foo/bar/baz`
  // for the inner object.
  return {
    parent,
    name,
    path,
    contents,
    type,
    meta,
  };
}

function setNodeChildren(
  node: Node,
  children: Array<Node>
) : Node {
  node.contents = children;
  return node;
}

function getChildren(options: {
  cachedNodes: CachedNodes,
  loadedProperties: LoadedProperties,
  item: Node
}) : Array<Node> {
  const {
    cachedNodes,
    loadedProperties = new Map(),
    item,
  } = options;

  const key = item.path;
  if (cachedNodes && cachedNodes.has(key)) {
    return cachedNodes.get(key);
  }

  const loadedProps = loadedProperties.get(key);
  const {
    ownProperties,
    ownSymbols,
    safeGetterValues,
    prototype
  } = loadedProps || {};
  const hasLoadedProps = ownProperties || ownSymbols || safeGetterValues || prototype;

  // Because we are dynamically creating the tree as the user
  // expands it (not precalculated tree structure), we cache child
  // arrays. This not only helps performance, but is necessary
  // because the expanded state depends on instances of nodes
  // being the same across renders. If we didn't do this, each
  // node would be a new instance every render.
  // If the node needs properties, we only add children to
  // the cache if the properties are loaded.
  const addToCache = (children: Array<Node>) => {
    if (cachedNodes) {
      cachedNodes.set(item.path, children);
    }
    return children;
  };

  // Nodes can either have children already, or be an object with
  // properties that we need to go and fetch.
  if (nodeHasChildren(item)) {
    return addToCache(item.contents);
  }

  if (nodeHasAccessors(item)) {
    return addToCache(makeNodesForAccessors(item));
  }

  if (nodeIsMapEntry(item)) {
    return addToCache(makeNodesForMapEntry(item));
  }

  if (nodeIsProxy(item)) {
    const nodes = makeNodesForProxyProperties(item);
    const protoNode = makeNodeForPrototype(loadedProps, item);
    if (protoNode) {
      return addToCache(nodes.concat(protoNode));
    }
    return nodes;
  }

  if (nodeNeedsNumericalBuckets(item)) {
    const bucketNodes = makeNumericalBuckets(item);
    // Even if we have numerical buckets, we might have loaded non indexed properties,
    // like length for example.
    if (hasLoadedProps) {
      return addToCache(bucketNodes.concat(makeNodesForProperties(loadedProps, item)));
    }

    // We don't cache the result here so we can have the prototype, properties and symbols
    // when they are loaded.
    return bucketNodes;
  }

  if (!nodeIsEntries(item) && !nodeIsBucket(item) && !nodeHasProperties(item)) {
    return [];
  }

  if (!hasLoadedProps) {
    return [];
  }

  return addToCache(makeNodesForProperties(loadedProps, item));
}

function getParent(item: Node) : Node | null {
  return item.parent;
}

function getNumericalPropertiesCount(item: Node) : number {
  if (nodeIsBucket(item)) {
    return item.meta.endIndex - item.meta.startIndex + 1;
  }

  const value = getValue(getClosestGripNode(item));
  if (!value) {
    return 0;
  }

  if (GripArrayRep.supportsObject(value)) {
    return GripArrayRep.getLength(value);
  }

  if (GripMap.supportsObject(value)) {
    return GripMap.getLength(value);
  }

  // TODO: We can also have numerical properties on Objects, but at the
  // moment we don't have a way to distinguish them from non-indexed properties,
  // as they are all computed in a ownPropertiesLength property.

  return 0;
}

function getClosestGripNode(item: Node) : Node | null {
  const type = getType(item);
  if (
    type !== NODE_TYPES.BUCKET
    && type !== NODE_TYPES.DEFAULT_PROPERTIES
    && type !== NODE_TYPES.ENTRIES
  ) {
    return item;
  }

  const parent = getParent(item);
  if (!parent) {
    return null;
  }

  return getClosestGripNode(parent);
}

function getClosestNonBucketNode(item: Node) : Node | null {
  const type = getType(item);

  if (type !== NODE_TYPES.BUCKET) {
    return item;
  }

  const parent = getParent(item);
  if (!parent) {
    return null;
  }

  return getClosestNonBucketNode(parent);
}

function shouldLoadItemIndexedProperties(
  item: Node,
  loadedProperties: LoadedProperties = new Map()
) : boolean {
  const gripItem = getClosestGripNode(item);
  const value = getValue(gripItem);

  return value
    && nodeHasProperties(gripItem)
    && !loadedProperties.has(item.path)
    && !nodeIsProxy(item)
    && !nodeNeedsNumericalBuckets(item)
    && !nodeIsEntries(getClosestNonBucketNode(item))
    // The data is loaded when expanding the window node.
    && !nodeIsDefaultProperties(item);
}

function shouldLoadItemNonIndexedProperties(
  item: Node,
  loadedProperties: LoadedProperties = new Map()
) : boolean {
  const gripItem = getClosestGripNode(item);
  const value = getValue(gripItem);

  return value
    && nodeHasProperties(gripItem)
    && !loadedProperties.has(item.path)
    && !nodeIsProxy(item)
    && !nodeIsEntries(getClosestNonBucketNode(item))
    && !nodeIsBucket(item)
    // The data is loaded when expanding the window node.
    && !nodeIsDefaultProperties(item);
}

function shouldLoadItemEntries(
  item: Node,
  loadedProperties: LoadedProperties = new Map()
) : boolean {
  const gripItem = getClosestGripNode(item);
  const value = getValue(gripItem);

  return value
    && nodeIsEntries(getClosestNonBucketNode(item))
    && !nodeHasAllEntriesInPreview(gripItem)
    && !loadedProperties.has(item.path)
    && !nodeNeedsNumericalBuckets(item);
}

function shouldLoadItemPrototype(
  item: Node,
  loadedProperties: LoadedProperties = new Map()
) : boolean {
  const value = getValue(item);

  return value
    && !loadedProperties.has(item.path)
    && !nodeIsBucket(item)
    && !nodeIsMapEntry(item)
    && !nodeIsEntries(item)
    && !nodeIsDefaultProperties(item)
    && !nodeHasAccessors(item)
    && !nodeIsPrimitive(item);
}

function shouldLoadItemSymbols(
  item: Node,
  loadedProperties: LoadedProperties = new Map()
) : boolean {
  const value = getValue(item);

  return value
    && !loadedProperties.has(item.path)
    && !nodeIsBucket(item)
    && !nodeIsMapEntry(item)
    && !nodeIsEntries(item)
    && !nodeIsDefaultProperties(item)
    && !nodeHasAccessors(item)
    && !nodeIsPrimitive(item)
    && !nodeIsProxy(item);
}

module.exports = {
  createNode,
  getChildren,
  getClosestGripNode,
  getClosestNonBucketNode,
  getParent,
  getNumericalPropertiesCount,
  getValue,
  makeNodesForEntries,
  makeNodesForPromiseProperties,
  makeNodesForProperties,
  makeNumericalBuckets,
  nodeHasAccessors,
  nodeHasAllEntriesInPreview,
  nodeHasChildren,
  nodeHasEntries,
  nodeHasProperties,
  nodeIsBucket,
  nodeIsDefaultProperties,
  nodeIsEntries,
  nodeIsFunction,
  nodeIsGetter,
  nodeIsMapEntry,
  nodeIsMissingArguments,
  nodeIsObject,
  nodeIsOptimizedOut,
  nodeIsPrimitive,
  nodeIsPromise,
  nodeIsPrototype,
  nodeIsProxy,
  nodeIsSetter,
  nodeIsWindow,
  nodeNeedsNumericalBuckets,
  nodeSupportsNumericalBucketing,
  setNodeChildren,
  shouldLoadItemEntries,
  shouldLoadItemIndexedProperties,
  shouldLoadItemNonIndexedProperties,
  shouldLoadItemPrototype,
  shouldLoadItemSymbols,
  sortProperties,
  NODE_TYPES,
  // Export for testing purpose.
  SAFE_PATH_PREFIX,
};
