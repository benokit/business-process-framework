import { getElement } from '@business-framework/core';
import { selfAt } from '@business-framework/core/kinds';

export const characteristicsOf = entityType => selfAt(getElement(entityType), 'entity-type').data.characteristics ?? {};

export const characteristicOf = ({ entityType, name }) => characteristicsOf(entityType)[name] ?? null;
