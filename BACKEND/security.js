// Hash de contraseñas con scrypt (incluido en Node) y tokens de sesión aleatorios.
const crypto = require('node:crypto');

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verificarPassword(password, guardado) {
    const [salt, hash] = String(guardado).split(':');
    if (!salt || !hash) return false;
    const calculado = crypto.scryptSync(password, salt, 64);
    const esperado = Buffer.from(hash, 'hex');
    return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

function nuevoToken() {
    return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verificarPassword, nuevoToken };
