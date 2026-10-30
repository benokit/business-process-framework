import { getElement } from '@business-framework/core';
import { selfOf } from '@business-framework/core/kinds';
import { fillsOf, orderFills } from '@business-framework/core/slots';

const orderedFills = database => {
    const { fills, targets } = fillsOf(selfOf(getElement(database)), 'migrations');
    return orderFills(fills, targets, 'migrations');
};

export const migrationsOf = database => orderedFills(database).map(fill => ({ id: fill.id, ...fill.data.value }));

const problemOf = ({ id, data: { target, value } }) => {
    if (id === undefined) return `a migration of ${target} has no id`;
    return ('command' in value) === ('run' in value) ? `migration ${id} needs either a command or run` : undefined;
};

export const migrationProblems = database => orderedFills(database).map(problemOf).filter(Boolean);
