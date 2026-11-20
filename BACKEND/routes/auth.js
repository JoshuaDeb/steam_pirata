// Registro, inicio y cierre de sesión.
const express = require('express');
const { hashPassword, verificarPassword } = require('../security');
const { crearSesion, cerrarSesion } = require('../sesion');
const { transaccion } = require('../db');
const U = require('../util');

// Límite simple contra fuerza bruta: 10 intentos fallidos por IP cada 15 minutos.
const intentos = new Map();
const VENTANA_MS = 15 * 60 * 1000;
function demasiadosIntentos(ip) {
    const ahora = Date.now();
    const reg = intentos.get(ip);
    if (!reg || ahora - reg.desde > VENTANA_MS) return false;
    return reg.n >= 10;
}
function registrarFallo(ip) {
    const ahora = Date.now();
    const reg = intentos.get(ip);
    if (!reg || ahora - reg.desde > VENTANA_MS) intentos.set(ip, { n: 1, desde: ahora });
    else reg.n++;
}

module.exports = (db) => {
    const r = express.Router();

    r.post('/registro', (req, res) => {
        const nombre = U.nombreUsuario(req.body.nombre);
        const correo = U.correo(req.body.correo);
        const password = U.password(req.body.password);
        const tipo = U.opcion(req.body.tipo, ['jugador', 'desarrollador'], 'tipo', 'El tipo de cuenta');

        if (db.prepare('SELECT 1 FROM usuarios WHERE nombre = ?').get(nombre)) {
            throw new U.HttpError(409, 'Ese nombre de usuario ya está en uso.', 'nombre');
        }
        if (db.prepare('SELECT 1 FROM usuarios WHERE correo = ?').get(correo)) {
            throw new U.HttpError(409, 'Ya existe una cuenta con ese correo.', 'correo');
        }

        const creditos = tipo === 'jugador' ? U.CREDITOS_INICIALES : 0;
        const id = transaccion(db, () => {
            const nuevo = Number(db.prepare(
                'INSERT INTO usuarios (nombre, correo, pass_hash, tipo, creditos) VALUES (?, ?, ?, ?, ?)')
                .run(nombre, correo, hashPassword(password), tipo, creditos).lastInsertRowid);
            if (tipo === 'jugador') {
                db.prepare(`INSERT INTO movimientos (usuario_id, cantidad, concepto, clave)
                            VALUES (?, ?, 'Saldo inicial de la cuenta', 'inicial')`).run(nuevo, creditos);
            }
            return nuevo;
        });

        crearSesion(db, res, id);
        const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
        res.status(201).json({ usuario: U.usuarioPublico(usuario) });
    });

    r.post('/login', (req, res) => {
        const ip = req.ip;
        if (demasiadosIntentos(ip)) {
            throw new U.HttpError(429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
        }
        const correo = typeof req.body.correo === 'string' ? req.body.correo.trim() : '';
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        if (!correo || !password) throw new U.HttpError(400, 'Escribe tu correo y tu contraseña.');

        const usuario = db.prepare('SELECT * FROM usuarios WHERE correo = ?').get(correo);
        if (!usuario || !verificarPassword(password, usuario.pass_hash)) {
            registrarFallo(ip);
            throw new U.HttpError(401, 'Correo o contraseña incorrectos.');
        }
        intentos.delete(ip);
        crearSesion(db, res, usuario.id);
        res.json({ usuario: U.usuarioPublico(usuario) });
    });

    r.post('/logout', (req, res) => {
        cerrarSesion(db, req, res);
        res.json({ ok: true });
    });

    return r;
};
