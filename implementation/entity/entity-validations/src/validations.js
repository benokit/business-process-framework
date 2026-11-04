import { isDeepStrictEqual } from 'node:util';
import { selvesOf } from '@business-framework/core/kinds';
import { traitKeyOf, traitsOf } from '@business-framework/entities/traits';

const STATES_KIND = 'states-trait';

const VALIDATION_KIND = 'validation-trait';

const DIMENSION = 'validity';

const validityOf = errors => Object.keys(errors).length === 0 ? 'valid' : 'invalid';

const written = (record, key, value) => isDeepStrictEqual(record.data[key], value) ? [] : [{ key, command: 'validate', value }];

export const validationWrites = ({ record, key, errors }) => {
    const statesKey = traitKeyOf({ entityType: record.entityType, kind: STATES_KIND });
    return [
        ...written(record, key, errors),
        ...statesKey === null ? [] : written(record, statesKey, { ...record.data[statesKey], [DIMENSION]: validityOf(errors) })
    ];
};

const statesUseOf = entityType => traitsOf(entityType)[traitKeyOf({ entityType, kind: STATES_KIND })];

const movesValidity = ([, dimensions]) => Object.entries(dimensions[DIMENSION] ?? {}).some(([source, target]) => target !== true && source !== target);

export const validationProblems = () => selvesOf('entity-type')
    .filter(({ id }) => traitKeyOf({ entityType: id, kind: VALIDATION_KIND }) !== null && statesUseOf(id) !== undefined)
    .flatMap(({ id }) => Object.entries(statesUseOf(id).configuration.transitions ?? {})
        .filter(movesValidity)
        .map(([name]) => `${id}: transition '${name}' moves the dimension ${DIMENSION}, which the validations own`));
