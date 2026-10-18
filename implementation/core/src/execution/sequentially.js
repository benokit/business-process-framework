export const sequentially = (items, step, initial) =>
    items.reduce(async (previous, item) => step(item, await previous), Promise.resolve(initial));

export const mapSequentially = (items, transform) =>
    sequentially(items, async (item, results) => [...results, await transform(item)], []);
