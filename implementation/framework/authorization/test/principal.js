export const ROLE_HEADER = 'x-role';

export const headerPrincipal = [
    {
        id: 'header-principal',
        kind: 'principal-execution-node-wrapper',
        data: {
            keyword: 'asHeaderUser',
            node: { '!asHeaderUser': '@method' },
            implementation: {
                if: `#.input.headers.${ROLE_HEADER}`,
                then: { withContext: { user: { userId: 'tester', roles: [`#.input.headers.${ROLE_HEADER}`] } }, do: { next: true } },
                else: { next: true }
            }
        }
    },
    {
        id: 'authenticate-by-header',
        kind: 'slot-fill',
        data: { target: 'http-endpoint', slot: 'requestMiddleware', position: 'first', before: ['authorize-requests'], value: { asHeaderUser: { next: true } } }
    }
];
