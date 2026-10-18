import { createHmac, timingSafeEqual } from 'crypto';

const LIFETIME_SECONDS = 24 * 60 * 60;

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

const sign = (secret, content) => createHmac('sha256', secret).update(content).digest('base64url');

const now = () => Math.floor(Date.now() / 1000);

export const generateToken = ({ input: { principal: { userId, ...claims }, secret } }) => {
    const content = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, ...claims, iat: now(), exp: now() + LIFETIME_SECONDS })}`;
    return `${content}.${sign(secret, content)}`;
};

const signatureMatches = (secret, header, payload, signature) => {
    const expected = Buffer.from(sign(secret, `${header}.${payload}`), 'base64url');
    const actual = Buffer.from(signature, 'base64url');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const claimsOf = payload => {
    try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
};

export const verifyToken = ({ input: { header, secret } }) => {
    const [header64, payload, signature, ...rest] = (header?.startsWith('Bearer ') ? header.slice(7) : '').split('.');
    if (!signature || rest.length > 0 || !signatureMatches(secret, header64, payload, signature)) return null;
    const { sub, exp, iat, ...claims } = claimsOf(payload) ?? {};
    return sub && exp >= now() && iat ? { userId: sub, ...claims } : null;
};
