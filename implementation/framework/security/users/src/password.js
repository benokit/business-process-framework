import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export async function hashPassword({ input }) {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = await scryptAsync(input, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword({ input: { password, hash } }) {
    if (!hash) return false;
    const [salt, keyHex] = hash.split(':');
    if (!salt || !keyHex) return false;
    const keyBuffer = Buffer.from(keyHex, 'hex');
    const derivedKey = await scryptAsync(password, salt, 64);
    return timingSafeEqual(keyBuffer, derivedKey);
}
