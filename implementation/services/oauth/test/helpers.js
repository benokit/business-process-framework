export const OAUTH_ISSUER = process.env.OAUTH_ISSUER ?? 'http://localhost:8080/default';

export const skipWithoutIdentityProvider = async context => {
    try {
        if (!(await fetch(`${OAUTH_ISSUER}/.well-known/openid-configuration`)).ok) throw new Error();
    } catch {
        console.warn('\n  WARNING: OAuth identity provider not reachable — tests skipped\n');
        context.skip();
    }
};

export const tokenFor = async subject => {
    const response = await fetch(`${OAUTH_ISSUER}/token`, {
        method: 'POST',
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: subject, client_secret: 'secret', scope: 'bpf' })
    });
    return (await response.json()).access_token;
};
