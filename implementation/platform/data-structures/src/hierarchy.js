import { getElement } from '@business-framework/core';

const namesBelow = tree => Object.entries(tree).flatMap(([name, children]) => [name, ...namesBelow(children)]);

const subtreeOf = (tree, node) => node in tree ? tree[node] : Object.values(tree).map(children => subtreeOf(children, node)).find(found => found !== undefined);

export const hierarchySubtree = ({ hierarchy, node }) => {
    const found = typeof node === 'string' ? subtreeOf(getElement(hierarchy).data.tree, node) : undefined;
    return found === undefined ? [] : [node, ...namesBelow(found)];
};

const isTree = tree => tree !== null && typeof tree === 'object' && !Array.isArray(tree) && Object.values(tree).every(isTree);

export const hierarchyProblems = hierarchy => {
    const { tree } = getElement(hierarchy).data;
    if (!isTree(tree)) return [`${hierarchy}: the tree maps each node to an object of its children`];
    const names = namesBelow(tree);
    return [
        ...names.filter((name, index) => names.indexOf(name) !== index).map(name => `${hierarchy}: '${name}' is in the hierarchy twice`),
        ...names.filter(name => name !== name.toLowerCase()).map(name => `${hierarchy}: '${name}' has uppercase letters`)
    ];
};
