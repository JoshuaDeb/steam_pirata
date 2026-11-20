// Panel del desarrollador: publicar, editar y retirar juegos; administrar DLC; responder reseñas.
const express = require('express');
const { requiereTipo } = require('../sesion');
const U = require('../util');

module.exports = (db) => {
    const r = express.Router();
    r.use(requiereTipo('desarrollador'));

    // Busca un juego del desarrollador con sesión o responde 404.
    const miJuego = (req, id) => {
        const j = db.prepare('SELECT * FROM juegos WHERE id = ? AND desarrollador_id = ?').get(id, req.usuario.id);
        if (!j) throw new U.HttpError(404, 'Ese videojuego no existe en tu panel.');
        return j;
    };

    const leerJuego = (body, previo = {}) => ({
        titulo: U.texto(body.titulo ?? previo.titulo, 'titulo', { max: 60, etiqueta: 'El título' }),
        descripcion: U.texto(body.descripcion ?? previo.descripcion, 'descripcion', { max: 1000, requerido: false, etiqueta: 'La descripción' }),
        genero: U.opcion(body.genero ?? previo.genero, U.GENEROS, 'genero', 'El género'),
        clasificacion: U.opcion(body.clasificacion ?? previo.clasificacion, U.CLASIFICACIONES, 'clasificacion', 'La clasificación'),
        precio: U.entero(body.precio ?? previo.precio, 'precio', { min: 1, max: 10000, etiqueta: 'El precio' }),
        especificaciones: U.texto(body.especificaciones ?? previo.especificaciones, 'especificaciones', { max: 300, requerido: false, etiqueta: 'Las especificaciones' }),
    });

    const leerDlc = (body) => ({
        nombre: U.texto(body.nombre, 'nombre', { max: 60, etiqueta: 'El nombre del DLC' }),
        tipo: U.opcion(body.tipo, U.TIPOS_DLC, 'tipo', 'El tipo de contenido'),
        descripcion: U.texto(body.descripcion, 'descripcion', { max: 300, requerido: false, etiqueta: 'La descripción' }),
    });

    const detalle = (id) => {
        const f = db.prepare(`${U.selectJuego('(SELECT COUNT(*) FROM adquisiciones a WHERE a.juego_id = j.id) AS jugadores')} WHERE j.id = ?`).get(id);
        return {
            ...U.formatoJuego(f),
            jugadores: f.jugadores,
            dlcs: db.prepare('SELECT id, nombre, tipo, descripcion FROM dlcs WHERE juego_id = ? ORDER BY id').all(id),
            resenas: db.prepare(`
                SELECT r.id, r.estrellas, r.texto, r.respuesta, r.respondida_en, r.creado_en, u.nombre AS usuario_nombre
                FROM resenas r JOIN usuarios u ON u.id = r.usuario_id
                WHERE r.juego_id = ? ORDER BY r.creado_en DESC`).all(id),
        };
    };

    r.get('/juegos', (req, res) => {
        const ids = db.prepare('SELECT id FROM juegos WHERE desarrollador_id = ? ORDER BY creado_en, id').all(req.usuario.id);
        res.json({ juegos: ids.map((x) => detalle(x.id)) });
    });

    r.post('/juegos', (req, res) => {
        const d = leerJuego(req.body);
        const portada = U.guardarPortada(req.body.portada);
        const id = Number(db.prepare(`
            INSERT INTO juegos (desarrollador_id, titulo, descripcion, genero, clasificacion, precio, especificaciones, portada)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(req.usuario.id, d.titulo, d.descripcion, d.genero, d.clasificacion, d.precio, d.especificaciones, portada)
            .lastInsertRowid);
        res.status(201).json({ juego: detalle(id) });
    });

    r.put('/juegos/:id', (req, res) => {
        const previo = miJuego(req, U.idParam(req.params.id));
        const d = leerJuego(req.body, previo);
        let portada = previo.portada;
        if (req.body.portada) {
            portada = U.guardarPortada(req.body.portada);
            U.borrarPortada(previo.portada);
        }
        db.prepare(`UPDATE juegos SET titulo = ?, descripcion = ?, genero = ?, clasificacion = ?, precio = ?,
                    especificaciones = ?, portada = ? WHERE id = ?`)
            .run(d.titulo, d.descripcion, d.genero, d.clasificacion, d.precio, d.especificaciones, portada, previo.id);
        res.json({ juego: detalle(previo.id) });
    });

    r.post('/juegos/:id/retirar', (req, res) => {
        const j = miJuego(req, U.idParam(req.params.id));
        db.prepare(`UPDATE juegos SET estado = 'retirado' WHERE id = ?`).run(j.id);
        res.json({ juego: detalle(j.id) });
    });

    r.post('/juegos/:id/publicar', (req, res) => {
        const j = miJuego(req, U.idParam(req.params.id));
        db.prepare(`UPDATE juegos SET estado = 'publicado' WHERE id = ?`).run(j.id);
        res.json({ juego: detalle(j.id) });
    });

    // ----- DLC -----
    r.post('/juegos/:id/dlcs', (req, res) => {
        const j = miJuego(req, U.idParam(req.params.id));
        const d = leerDlc(req.body);
        db.prepare('INSERT INTO dlcs (juego_id, nombre, tipo, descripcion) VALUES (?, ?, ?, ?)')
            .run(j.id, d.nombre, d.tipo, d.descripcion);
        res.status(201).json({ juego: detalle(j.id) });
    });

    const miDlc = (req, id) => {
        const d = db.prepare(`SELECT d.* FROM dlcs d JOIN juegos j ON j.id = d.juego_id
                              WHERE d.id = ? AND j.desarrollador_id = ?`).get(id, req.usuario.id);
        if (!d) throw new U.HttpError(404, 'Ese DLC no existe en tu panel.');
        return d;
    };

    r.put('/dlcs/:id', (req, res) => {
        const previo = miDlc(req, U.idParam(req.params.id));
        const d = leerDlc(req.body);
        db.prepare('UPDATE dlcs SET nombre = ?, tipo = ?, descripcion = ? WHERE id = ?')
            .run(d.nombre, d.tipo, d.descripcion, previo.id);
        res.json({ juego: detalle(previo.juego_id) });
    });

    r.delete('/dlcs/:id', (req, res) => {
        const d = miDlc(req, U.idParam(req.params.id));
        db.prepare('DELETE FROM dlcs WHERE id = ?').run(d.id);
        res.json({ juego: detalle(d.juego_id) });
    });

    // ----- Responder reseñas de mis juegos (texto vacío = borrar respuesta) -----
    r.put('/resenas/:id/respuesta', (req, res) => {
        const id = U.idParam(req.params.id);
        const resena = db.prepare(`SELECT r.* FROM resenas r JOIN juegos j ON j.id = r.juego_id
                                   WHERE r.id = ? AND j.desarrollador_id = ?`).get(id, req.usuario.id);
        if (!resena) throw new U.HttpError(404, 'Esa reseña no existe en tus juegos.');
        const texto = U.texto(req.body.texto, 'texto', { max: 600, requerido: false, etiqueta: 'La respuesta' });
        db.prepare(`UPDATE resenas SET respuesta = ?, respondida_en = CASE WHEN ? = '' THEN NULL ELSE datetime('now') END
                    WHERE id = ?`).run(texto || null, texto, id);
        res.json({ juego: detalle(resena.juego_id) });
    });

    return r;
};
