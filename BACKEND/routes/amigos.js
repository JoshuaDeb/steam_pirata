// Amistades entre jugadores: lista, solicitudes, búsqueda y perfil público.
const express = require('express');
const { requiereTipo } = require('../sesion');
const U = require('../util');

module.exports = (db) => {
    const r = express.Router();
    r.use(requiereTipo('jugador'));

    const juegosEnComun = (a, b) => db.prepare(`
        SELECT j.id, j.titulo FROM adquisiciones x
        JOIN adquisiciones y ON y.juego_id = x.juego_id AND y.usuario_id = ?
        JOIN juegos j ON j.id = x.juego_id
        WHERE x.usuario_id = ? ORDER BY j.titulo`).all(b, a);

    const relacion = (yo, otro) => db.prepare(`
        SELECT * FROM amistades WHERE (de_id = ? AND para_id = ?) OR (de_id = ? AND para_id = ?)`)
        .get(yo, otro, otro, yo);

    // GET /api/amigos -> amigos, solicitudes recibidas y enviadas
    r.get('/', (req, res) => {
        const yo = req.usuario.id;
        const amigos = db.prepare(`
            SELECT a.id AS amistad_id, a.aceptada_en, u.id, u.nombre
            FROM amistades a JOIN usuarios u ON u.id = CASE WHEN a.de_id = ? THEN a.para_id ELSE a.de_id END
            WHERE a.estado = 'aceptada' AND ? IN (a.de_id, a.para_id)`).all(yo, yo)
            .map((f) => ({ ...f, juegos_en_comun: juegosEnComun(yo, f.id).length }));
        const recibidas = db.prepare(`
            SELECT a.id AS solicitud_id, a.creado_en, u.id, u.nombre
            FROM amistades a JOIN usuarios u ON u.id = a.de_id
            WHERE a.estado = 'pendiente' AND a.para_id = ? ORDER BY a.creado_en DESC`).all(yo);
        const enviadas = db.prepare(`
            SELECT a.id AS solicitud_id, a.creado_en, u.id, u.nombre
            FROM amistades a JOIN usuarios u ON u.id = a.para_id
            WHERE a.estado = 'pendiente' AND a.de_id = ? ORDER BY a.creado_en DESC`).all(yo);
        res.json({ amigos, recibidas, enviadas });
    });

    // Jugadores con los que aún no hay amistad ni solicitud pendiente.
    r.get('/buscar', (req, res) => {
        const yo = req.usuario.id;
        const q = String(req.query.q || '').trim();
        const jugadores = db.prepare(`
            SELECT u.id, u.nombre, u.creado_en,
                   (SELECT COUNT(*) FROM adquisiciones a WHERE a.usuario_id = u.id) AS juegos
            FROM usuarios u
            WHERE u.tipo = 'jugador' AND u.id <> ? AND u.nombre LIKE ?
              AND NOT EXISTS (SELECT 1 FROM amistades a
                              WHERE (a.de_id = ? AND a.para_id = u.id) OR (a.de_id = u.id AND a.para_id = ?))
            ORDER BY u.nombre COLLATE NOCASE LIMIT 50`).all(yo, `%${q}%`, yo, yo);
        res.json({ jugadores });
    });

    r.get('/usuarios/:id', (req, res) => {
        const id = U.idParam(req.params.id);
        const u = db.prepare('SELECT id, nombre, tipo, creado_en FROM usuarios WHERE id = ?').get(id);
        if (!u) throw new U.HttpError(404, 'Ese jugador no existe.');
        const rel = relacion(req.usuario.id, id);
        const total = db.prepare('SELECT COUNT(*) n FROM adquisiciones WHERE usuario_id = ?').get(id).n;
        const resenas = db.prepare('SELECT COUNT(*) n FROM resenas WHERE usuario_id = ?').get(id).n;
        res.json({
            usuario: {
                ...u,
                juegos: total,
                resenas,
                juegos_en_comun: juegosEnComun(req.usuario.id, id),
                relacion: !rel ? 'ninguna' : rel.estado === 'aceptada' ? 'amigos'
                    : rel.de_id === req.usuario.id ? 'enviada' : 'recibida',
            },
        });
    });

    r.post('/solicitudes', (req, res) => {
        const yo = req.usuario.id;
        const para = U.idParam(req.body.para_id);
        if (para === yo) throw new U.HttpError(400, 'No puedes enviarte una solicitud a ti mismo.');
        const otro = db.prepare('SELECT id, nombre, tipo FROM usuarios WHERE id = ?').get(para);
        if (!otro || otro.tipo !== 'jugador') throw new U.HttpError(404, 'Ese jugador no existe.');
        const rel = relacion(yo, para);
        if (rel?.estado === 'aceptada') throw new U.HttpError(409, `${otro.nombre} ya es tu amigo.`);
        if (rel?.de_id === yo) throw new U.HttpError(409, `Ya le enviaste una solicitud a ${otro.nombre}.`);
        if (rel) {
            // Esa persona ya te había enviado una solicitud: se acepta directamente.
            db.prepare(`UPDATE amistades SET estado = 'aceptada', aceptada_en = datetime('now') WHERE id = ?`).run(rel.id);
            return res.json({ ok: true, aceptada: true });
        }
        db.prepare('INSERT INTO amistades (de_id, para_id) VALUES (?, ?)').run(yo, para);
        res.status(201).json({ ok: true, aceptada: false });
    });

    r.post('/solicitudes/:id/aceptar', (req, res) => {
        const id = U.idParam(req.params.id);
        const s = db.prepare(`SELECT * FROM amistades WHERE id = ? AND para_id = ? AND estado = 'pendiente'`)
            .get(id, req.usuario.id);
        if (!s) throw new U.HttpError(404, 'La solicitud ya no existe.');
        db.prepare(`UPDATE amistades SET estado = 'aceptada', aceptada_en = datetime('now') WHERE id = ?`).run(id);
        res.json({ ok: true });
    });

    // Rechazar (si la recibiste) o cancelar (si la enviaste) una solicitud pendiente.
    r.delete('/solicitudes/:id', (req, res) => {
        const id = U.idParam(req.params.id);
        const info = db.prepare(`DELETE FROM amistades WHERE id = ? AND estado = 'pendiente' AND ? IN (de_id, para_id)`)
            .run(id, req.usuario.id);
        if (!info.changes) throw new U.HttpError(404, 'La solicitud ya no existe.');
        res.json({ ok: true });
    });

    // Eliminar amistad con el usuario indicado.
    r.delete('/:usuarioId', (req, res) => {
        const otro = U.idParam(req.params.usuarioId);
        const yo = req.usuario.id;
        const info = db.prepare(`DELETE FROM amistades WHERE estado = 'aceptada'
            AND ((de_id = ? AND para_id = ?) OR (de_id = ? AND para_id = ?))`).run(yo, otro, otro, yo);
        if (!info.changes) throw new U.HttpError(404, 'Esa amistad no existe.');
        res.json({ ok: true });
    });

    return r;
};
