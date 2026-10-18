import { boot, packageElements, validate } from '@business-framework/core';
import { installedPackages } from '@business-framework/server';

export const validateApplication = async ({ packages, paths = [] } = {}) => {
    await boot({ paths: [...(packages ?? await installedPackages()).map(packageElements), ...paths] });
    return validate();
};

export const report = problems => problems.map(({ code, message }) => `${code}: ${message}`).join('\n');
