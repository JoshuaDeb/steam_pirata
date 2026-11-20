// Cuenta del usuario con sesión: perfil, contraseña, créditos, biblioteca y favoritos.
const express = require('express');
const { hashPassword, verificarPassword } = require('../security');
const { requiereSesion, requiereTipo, cerrarSesion } = require('../sesion');
const { transaccion } = require('../db');
const U = require('../util');

module.exports = (db) => {
    const r = express.Router();
    r.use(requiereSesion);

    const resumen = (id) => {
        const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
        const conteo = (sql) => db.prepare(sql).get(id).n;
        return {
            ...U.usuarioPublico(u),
            stats: u.tipo === 'jugador'
                ? {
                    adquiridos: conteo('SELECT COUNT(*) n FROM adquisiciones WHERE usuario_id = ?'),
                    favoritos: conteo('SELECT COUNT(*) n FROM favoritos WHERE usuario_id = ?'),
                    amigos: conteo(`SELECT COUNT(*) n FROM amistades WHERE estado = 'aceptada' AND ? IN (de_id, para_id)`),
                }
                : {
                    publicados: conteo(`SELECT COUNT(*) n FROM juegos WHERE desarrollador_id = ? AND estado = 'publicado'`),
                    retirados: conteo(`SELECT COUNT(*) n FROM juegos WHERE desarrollador_id = ? AND estado = 'retirado'`),
                    dlcs: conteo('SELECT COUNT(*) n FROM dlcs d JOIN juegos j ON j.id = d.juego_id WHERE j.desarrollador_id = ?'),
                },
        };
    };

    r.get('/', (req, res) => res.json({ usuario: resumen(req.usuario.id) }));

    // Editar nombre de usuario y/o correo
    r.patch('/', (req, res) => {
        const id = req.usuario.id;
        if (req.body.nombre !== undefined) {
            const nombre = U.nombreUsuario(req.body.nombre);
            if (db.prepare('SELECT 1 FROM usuarios WHERE nombre = ? AND id <> ?').get(nombre, id)) {
                throw new U.HttpError(409, 'Ese nombre de usuario ya está en uso.', 'nombre');
            }
            db.prepare('UPDATE usuarios SET nombre = ? WHERE id = ?').run(nombre, id);
        }
        if (req.body.correo !== undefined) {
            const correo = U.correo(req.body.correo);
            if (db.prepare('SELECT 1 FROM usuarios WHERE correo = ? AND id <> ?').get(correo, id)) {
                throw new U.HttpError(409, 'Ya existe una cuenta con ese correo.', 'correo');
            }
            db.prepare('UPDATE usuarios SET correo = ? WHERE id = ?').run(correo, id);
        }
        res.json({ usuario: resumen(id) });
    });

    r.put('/password', (req, res) => {
        const { actual, nueva, confirmacion } = req.body;
        if (typeof actual !== 'string' || !verificarPassword(actual, req.usuario.pass_hash)) {
            throw new U.HttpError(400, 'La contraseña actual no es correcta.', 'actual');
        }
        U.password(nueva, 'nueva');
        if (confirmacion !== undefined && confirmacion !== nueva) {
            throw new U.HttpError(400, 'Las contraseñas nuevas no coinciden.', 'confirmacion');
        }
        if (nueva === actual) throw new U.HttpError(400, 'La nueva contraseña debe ser distinta a la actual.', 'nueva');
        db.prepare('UPDATE usuarios SET pass_hash = ? WHERE id = ?').run(hashPassword(nueva), req.usuario.id);
        res.json({ ok: true });
    });

    r.delete('/', (req, res) => {
        if (req.body.confirmacion !== 'ELIMINAR') {
            throw new U.HttpError(400, 'Escribe ELIMINAR para confirmar.', 'confirmacion');
        }
        const portadas = db.prepare('SELECT portada FROM juegos WHERE desarrollador_id = ?').all(req.usuario.id);
        cerrarSesion(db, req, res);
        db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.usuario.id);
        portadas.forEach((p) => U.borrarPortada(p.portada));
        res.json({ ok: true });
    });

    // ----- Créditos (solo jugadores) -----
    r.get('/movimientos', (req, res) => {
        const movimientos = db.prepare(
            'SELECT id, cantidad, concepto, creado_en FROM movimientos WHERE usuario_id = ? ORDER BY creado_en DESC, id DESC')
            .all(req.usuario.id);
        res.json({ movimientos });
    });

    // Compra simulada: no se procesa ningún pago real ni se reciben datos de tarjeta.
    r.post('/creditos', requiereTipo('jugador'), (req, res) => {
        const paquete = Number(req.body.paquete);
        if (!U.PAQUETES_CREDITOS.includes(paquete)) throw new U.HttpError(400, 'Elige un paquete válido.', 'paquete');
        const metodos = { tarjeta: 'tarjeta', paypal: 'PayPal', spei: 'transferencia' };
        const metodo = metodos[req.body.metodo];
        if (!metodo) throw new U.HttpError(400, 'Elige una forma de pago válida.', 'metodo');
        transaccion(db, () => {
            db.prepare('UPDATE usuarios SET creditos = creditos + ? WHERE id = ?').run(paquete, req.usuario.id);
            db.prepare('INSERT INTO movimientos (usuario_id, cantidad, concepto) VALUES (?, ?, ?)')
                .run(req.usuario.id, paquete, `Compra de créditos · ${metodo}`);
        });
        res.status(201).json({ usuario: resumen(req.usuario.id) });
    });

    // ----- Biblioteca y favoritos (solo jugadores) -----
    r.get('/biblioteca', requiereTipo('jugador'), (req, res) => {
        const filas = db.prepare(`${U.selectJuego(`a.creado_en AS adquirido_en,
                (SELECT 1 FROM favoritos f WHERE f.juego_id = j.id AND f.usuario_id = a.usuario_id) AS es_favorito,
                (SELECT id FROM resenas r2 WHERE r2.juego_id = j.id AND r2.usuario_id = a.usuario_id) AS mi_resena`)}
            JOIN adquisiciones a ON a.juego_id = j.id AND a.usuario_id = ?
            ORDER BY a.creado_en DESC`)
            .all(req.usuario.id);
        res.json({
            juegos: filas.map((f) => ({
                ...U.formatoJuego(f), adquirido_en: f.adquirido_en, favorito: !!f.es_favorito, resenado: !!f.mi_resena,
            })),
        });
    });

    r.get('/favoritos', requiereTipo('jugador'), (req, res) => {
        const filas = db.prepare(`${U.selectJuego(`f.creado_en AS favorito_en,
                (SELECT 1 FROM adquisiciones a WHERE a.juego_id = j.id AND a.usuario_id = f.usuario_id) AS es_adquirido`)}
            JOIN favoritos f ON f.juego_id = j.id AND f.usuario_id = ?
            ORDER BY f.creado_en DESC`)
            .all(req.usuario.id);
        res.json({
            juegos: filas.map((f) => ({
                ...U.formatoJuego(f), favorito_en: f.favorito_en, adquirido: !!f.es_adquirido, favorito: true,
            })),
        });
    });

    return r;
};
