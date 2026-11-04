import { getElement } from '@business-framework/core';
import { selfOf } from '@business-framework/core/kinds';

export const characteristicsOf = entityType => selfOf(getElement(entityType)).data.characteristics ?? {};
