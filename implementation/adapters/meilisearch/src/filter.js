import { CoreError } from '@business-framework/core';
import { meilisearchString } from './quote.js';

const unsupported = expression => new CoreError('invalid', `a Meilisearch filter can't express ${JSON.stringify(expression)}`);

const isPath = operand => typeof operand === 'string' && operand.startsWith('#.');

const attributeOf = path => path.slice(2);

const unescaped = value => value.startsWith('\\') ? value.slice(1) : value;

const literalOf = value => typeof value === 'string' ? meilisearchString(unescaped(value)) : String(value);

const isLiteral = value => ['string', 'number', 'boolean'].includes(typeof value) && !isPath(value);

const equality = (left, right) => {
    const [path, value] = isPath(left) ? [left, right] : [right, left];
    if (!isPath(path) || !isLiteral(value)) throw unsupported({ $eq: [left, right] });
    return `${attributeOf(path)} = ${literalOf(value)}`;
};

const grouped = (operator, operands) => `(${operands.map(translate).join(` ${operator} `)})`;

const forms = {
    $and: operands => grouped('AND', operands),
    $or: operands => grouped('OR', operands),
    $not: operand => `NOT (${translate(operand)})`,
    $eq: ([left, right]) => equality(left, right),
    $neq: ([left, right]) => `NOT (${equality(left, right)})`,
    $includes: ({ collection, value }) => isPath(collection)
        ? equality(collection, value)
        : `${attributeOf(value)} IN [${collection.map(literalOf).join(', ')}]`
};

const translate = expression => {
    const [operator, ...others] = Object.keys(expression ?? {});
    if (forms[operator] === undefined || others.length > 0) throw unsupported(expression);
    return forms[operator](expression[operator]);
};

export const meilisearchFilter = translate;
