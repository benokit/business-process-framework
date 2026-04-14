import { getElementsOfKind, getElement } from '@business-framework/core/elements-registry';
import { executeService } from '@business-framework/core/execution';

async function createModels({ _ctx, input: { dbType } }) {
    const { items } = getElementsOfKind(`data-model/${dbType}`);
    const driver = getElement(`db-driver-${dbType}`);
    const sorted = [...items].sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
    for (const model of sorted) {
        const command = getElement(model.data.command).data;
        await executeService(driver.id, 'execute', { command }, _ctx);
    }
}

export { createModels };
