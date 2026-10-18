import { queryable } from '@business-framework/transaction';

export const insert = ({ input: { command, values }, _ctx }) => queryable(_ctx).query(command, values).then(() => null);
