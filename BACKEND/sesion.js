// Manejo de sesiones con cookie HttpOnly. El token se guarda en la tabla `sesiones`.
const { nuevoToken } = require('./security');
const { HttpError } = require('./util');

const COOKIE = 'sp_sesion';
const DURACION_DIAS = 7;

function leerCookies(req) {
    const out = {};
    for (const parte of (req.headers.cookie || '').split(';')) {
        const i = parte.indexOf('=');
        if (i > 0) out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
    }
    return out;
}

function crearSesion(db, res, usuarioId) {
    const token = nuevoToken();
    db.prepare(`INSERT INTO sesiones (token, usuario_id, expira_en)
                VALUES (?, ?, datetime('now', ?))`).run(token, usuarioId, `+${DURACION_DIAS} days`);
    res.cookie(COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: DURACION_DIAS * 24 * 60 * 60 * 1000,
        path: '/',
    });
}

function cerrarSesion(db, req, res) {
    const token = leerCookies(req)[COOKIE];
    if (token) db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
    res.clearCookie(COOKIE, { path: '/' });
}

// Middleware: si hay una sesión válida, deja al usuario en req.usuario.
function cargarUsuario(db) {
    const buscar = db.prepare(`
        SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token = ? AND s.expira_en > datetime('now')`);
    return (req, _res, next) => {
        const token = leerCookies(req)[COOKIE];
        req.usuario = token ? buscar.get(token) || null : null;
        next();
    };
}

function requiereSesion(req, _res, next) {
    if (!req.usuario) return next(new HttpError(401, 'Inicia sesión para continuar.'));
    next();
}

function requiereTipo(tipo) {
    return (req, _res, next) => {
        if (!req.usuario) return next(new HttpError(401, 'Inicia sesión para continuar.'));
        if (req.usuario.tipo !== tipo) {
            return next(new HttpError(403, tipo === 'jugador'
                ? 'Esta acción solo está disponible para cuentas de jugador.'
                : 'Esta acción solo está disponible para cuentas de desarrollador.'));
        }
        next();
    };
}

module.exports = { crearSesion, cerrarSesion, cargarUsuario, requiereSesion, requiereTipo };
