import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export const hashPassword = async ({ input: password }) => {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${(await scryptAsync(password, salt, KEY_LENGTH)).toString('hex')}`;
};

export const verifyPassword = async ({ input: { password, hash = '' } }) => {
    const [salt, key] = hash.split(':');
    if (!salt || !key) return false;
    return timingSafeEqual(Buffer.from(key, 'hex'), await scryptAsync(password, salt, KEY_LENGTH));
};
