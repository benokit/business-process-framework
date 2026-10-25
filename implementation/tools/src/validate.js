import { boot, packageElements, validate } from '@business-framework/core';
import { installedPackages } from '@business-framework/server';

export const bootApplication = async ({ packages, paths = [] } = {}) =>
    boot({ paths: [...(packages ?? await installedPackages()).map(packageElements), ...paths] });

export const validateApplication = async options => {
    await bootApplication(options);
    return validate();
};

export const report = problems => problems.map(({ code, message, data }) => `${data?.severity === 'warning' ? 'warning ' : ''}${code}: ${message}`).join('\n');
