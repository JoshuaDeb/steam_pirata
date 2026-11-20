// Catálogo público, detalle de juego, adquisición, favoritos y reseñas.
const express = require('express');
const { requiereSesion, requiereTipo } = require('../sesion');
const { transaccion } = require('../db');
const U = require('../util');

module.exports = (db) => {
    const r = express.Router();
    r.use(requiereSesion);

    const estadoJugador = (usuarioId, juegoId) => ({
        adquirido: !!db.prepare('SELECT 1 FROM adquisiciones WHERE usuario_id = ? AND juego_id = ?').get(usuarioId, juegoId),
        favorito: !!db.prepare('SELECT 1 FROM favoritos WHERE usuario_id = ? AND juego_id = ?').get(usuarioId, juegoId),
    });

    // GET /api/juegos?q=&genero=&clasificacion=&precio_max=&calificacion_min=&orden=&pagina=
    r.get('/', (req, res) => {
        const q = req.query;
        const where = [`j.estado = 'publicado'`];
        const params = [];
        if (q.q) { where.push('j.titulo LIKE ?'); params.push(`%${String(q.q).trim()}%`); }
        if (q.genero && U.GENEROS.includes(q.genero)) { where.push('j.genero = ?'); params.push(q.genero); }
        if (q.clasificacion && U.CLASIFICACIONES.includes(q.clasificacion)) {
            where.push('j.clasificacion = ?'); params.push(q.clasificacion);
        }
        const precioMax = Number(q.precio_max);
        if (Number.isFinite(precioMax) && precioMax > 0) { where.push('j.precio <= ?'); params.push(precioMax); }
        const califMin = Number(q.calificacion_min);
        const having = Number.isFinite(califMin) && califMin > 0 ? 'WHERE calificacion >= ?' : '';
        if (having) params.push(califMin);

        const ordenes = {
            nombre: 'titulo COLLATE NOCASE ASC',
            precio_asc: 'precio ASC, titulo COLLATE NOCASE',
            precio_desc: 'precio DESC, titulo COLLATE NOCASE',
            calificacion: 'calificacion IS NULL, calificacion DESC, num_resenas DESC',
        };
        const orden = ordenes[q.orden] || ordenes.nombre;

        const base = `SELECT * FROM (${U.selectJuego()} WHERE ${where.join(' AND ')}) ${having}`;
        const total = db.prepare(`SELECT COUNT(*) n FROM (${base})`).get(...params).n;
        const porPagina = 12;
        const paginas = Math.max(1, Math.ceil(total / porPagina));
        const pagina = Math.min(paginas, Math.max(1, parseInt(q.pagina, 10) || 1));
        const filas = db.prepare(`${base} ORDER BY ${orden} LIMIT ? OFFSET ?`)
            .all(...params, porPagina, (pagina - 1) * porPagina);

        const juegos = filas.map((f) => ({ ...U.formatoJuego(f), ...estadoJugador(req.usuario.id, f.id) }));
        res.json({ juegos, total, pagina, paginas, por_pagina: porPagina });
    });

    // Detalle con DLC y reseñas. Un juego retirado solo lo ve quien lo tiene o su desarrollador.
    r.get('/:id', (req, res) => {
        const id = U.idParam(req.params.id);
        const fila = db.prepare(`${U.selectJuego()} WHERE j.id = ?`).get(id);
        if (!fila) throw new U.HttpError(404, 'Ese videojuego no existe.');
        const estado = estadoJugador(req.usuario.id, id);
        if (fila.estado === 'retirado' && !estado.adquirido && fila.desarrollador_id !== req.usuario.id) {
            throw new U.HttpError(404, 'Ese videojuego ya no está disponible.');
        }
        const dlcs = db.prepare('SELECT id, nombre, tipo, descripcion FROM dlcs WHERE juego_id = ? ORDER BY id').all(id);
        const resenas = db.prepare(`
            SELECT r.id, r.estrellas, r.texto, r.respuesta, r.respondida_en, r.creado_en,
                   u.id AS usuario_id, u.nombre AS usuario_nombre
            FROM resenas r JOIN usuarios u ON u.id = r.usuario_id
            WHERE r.juego_id = ? ORDER BY r.creado_en DESC, r.id DESC`).all(id);
        const mia = resenas.find((x) => x.usuario_id === req.usuario.id) || null;
        res.json({ juego: { ...U.formatoJuego(fila), ...estado, dlcs, resenas, mi_resena: mia } });
    });

    r.post('/:id/adquirir', requiereTipo('jugador'), (req, res) => {
        const id = U.idParam(req.params.id);
        const resultado = transaccion(db, () => {
            const juego = db.prepare('SELECT * FROM juegos WHERE id = ?').get(id);
            if (!juego) throw new U.HttpError(404, 'Ese videojuego no existe.');
            if (juego.estado !== 'publicado') throw new U.HttpError(400, 'Este videojuego ya no se puede adquirir.');
            if (db.prepare('SELECT 1 FROM adquisiciones WHERE usuario_id = ? AND juego_id = ?').get(req.usuario.id, id)) {
                throw new U.HttpError(409, 'Ya tienes este videojuego en tu biblioteca.');
            }
            const { creditos } = db.prepare('SELECT creditos FROM usuarios WHERE id = ?').get(req.usuario.id);
            if (creditos < juego.precio) {
                throw new U.HttpError(400, `No tienes créditos suficientes: necesitas ${juego.precio} y tienes ${creditos}.`);
            }
            db.prepare('UPDATE usuarios SET creditos = creditos - ? WHERE id = ?').run(juego.precio, req.usuario.id);
            db.prepare('INSERT INTO adquisiciones (usuario_id, juego_id, precio_pagado) VALUES (?, ?, ?)')
                .run(req.usuario.id, id, juego.precio);
            db.prepare('INSERT INTO movimientos (usuario_id, cantidad, concepto) VALUES (?, ?, ?)')
                .run(req.usuario.id, -juego.precio, `Adquisición · ${juego.titulo}`);
            return { creditos: creditos - juego.precio, titulo: juego.titulo };
        });
        res.status(201).json({ ok: true, ...resultado });
    });

    r.put('/:id/favorito', requiereTipo('jugador'), (req, res) => {
        const id = U.idParam(req.params.id);
        const juego = db.prepare('SELECT estado FROM juegos WHERE id = ?').get(id);
        if (!juego) throw new U.HttpError(404, 'Ese videojuego no existe.');
        const adquirido = db.prepare('SELECT 1 FROM adquisiciones WHERE usuario_id = ? AND juego_id = ?').get(req.usuario.id, id);
        if (juego.estado !== 'publicado' && !adquirido) throw new U.HttpError(400, 'Este videojuego ya no está disponible.');
        db.prepare('INSERT OR IGNORE INTO favoritos (usuario_id, juego_id) VALUES (?, ?)').run(req.usuario.id, id);
        res.json({ favorito: true });
    });

    r.delete('/:id/favorito', requiereTipo('jugador'), (req, res) => {
        const id = U.idParam(req.params.id);
        db.prepare('DELETE FROM favoritos WHERE usuario_id = ? AND juego_id = ?').run(req.usuario.id, id);
        res.json({ favorito: false });
    });

    // Crear o editar la reseña propia. La primera reseña de cada juego da 10 créditos (una sola vez).
    r.post('/:id/resenas', requiereTipo('jugador'), (req, res) => {
        const id = U.idParam(req.params.id);
        const estrellas = U.entero(req.body.estrellas, 'estrellas', { min: 1, max: 5, etiqueta: 'La calificación' });
        const texto = U.texto(req.body.texto, 'texto', { min: 10, max: 600, etiqueta: 'Tu opinión' });
        const juego = db.prepare('SELECT titulo FROM juegos WHERE id = ?').get(id);
        if (!juego) throw new U.HttpError(404, 'Ese videojuego no existe.');
        if (!db.prepare('SELECT 1 FROM adquisiciones WHERE usuario_id = ? AND juego_id = ?').get(req.usuario.id, id)) {
            throw new U.HttpError(403, 'Solo puedes reseñar videojuegos que tienes en tu biblioteca.');
        }
        const resultado = transaccion(db, () => {
            const previa = db.prepare('SELECT id FROM resenas WHERE usuario_id = ? AND juego_id = ?').get(req.usuario.id, id);
            if (previa) {
                db.prepare(`UPDATE resenas SET estrellas = ?, texto = ?, creado_en = datetime('now') WHERE id = ?`)
                    .run(estrellas, texto, previa.id);
            } else {
                db.prepare('INSERT INTO resenas (usuario_id, juego_id, estrellas, texto) VALUES (?, ?, ?, ?)')
                    .run(req.usuario.id, id, estrellas, texto);
            }
            const premio = db.prepare(`INSERT OR IGNORE INTO movimientos (usuario_id, cantidad, concepto, clave)
                                       VALUES (?, ?, ?, ?)`)
                .run(req.usuario.id, U.RECOMPENSA_RESENA, `Primera reseña · ${juego.titulo}`, `resena:${id}`);
            const recompensa = premio.changes ? U.RECOMPENSA_RESENA : 0;
            if (recompensa) db.prepare('UPDATE usuarios SET creditos = creditos + ? WHERE id = ?').run(recompensa, req.usuario.id);
            return { editada: !!previa, recompensa };
        });
        const { creditos } = db.prepare('SELECT creditos FROM usuarios WHERE id = ?').get(req.usuario.id);
        res.status(resultado.editada ? 200 : 201).json({ ok: true, ...resultado, creditos });
    });

    return r;
};
