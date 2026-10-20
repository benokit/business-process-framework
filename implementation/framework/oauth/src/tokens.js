import { createRemoteJWKSet, jwtVerify } from 'jose';

const keySets = new Map();

const discoverKeySet = async issuer => {
    const response = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!response.ok) throw new Error(`OAuth discovery failed for ${issuer}: ${response.status}`);
    return createRemoteJWKSet(new URL((await response.json()).jwks_uri));
};

const keySetOf = issuer => {
    if (!keySets.has(issuer)) keySets.set(issuer, discoverKeySet(issuer).catch(error => {
        keySets.delete(issuer);
        throw error;
    }));
    return keySets.get(issuer);
};

const isRejection = error => /^ERR_(JWT|JWS)_|^ERR_JWKS_NO_MATCHING_KEY$/.test(error.code ?? '');

export const verifyToken = async ({ input: { header, issuer, audience } }) => {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return null;
    try {
        return (await jwtVerify(token, await keySetOf(issuer), { issuer, ...(audience && { audience }) })).payload;
    } catch (error) {
        if (isRejection(error)) return null;
        throw error;
    }
};
