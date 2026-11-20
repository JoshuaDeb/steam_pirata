// Base de datos SQLite (módulo node:sqlite incluido en Node 22.5+; no requiere instalar nada extra).
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./security');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'steampirata.db');

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    correo        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash     TEXT NOT NULL,
    tipo          TEXT NOT NULL CHECK (tipo IN ('jugador', 'desarrollador')),
    creditos      INTEGER NOT NULL DEFAULT 0 CHECK (creditos >= 0),
    creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sesiones (
    token         TEXT PRIMARY KEY,
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_en     TEXT NOT NULL,
    creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS juegos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    desarrollador_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo          TEXT NOT NULL,
    descripcion     TEXT NOT NULL DEFAULT '',
    genero          TEXT NOT NULL,
    clasificacion   TEXT NOT NULL CHECK (clasificacion IN ('E', 'T', 'M')),
    precio          INTEGER NOT NULL CHECK (precio > 0),
    especificaciones TEXT NOT NULL DEFAULT '',
    portada         TEXT,
    estado          TEXT NOT NULL DEFAULT 'publicado' CHECK (estado IN ('publicado', 'retirado')),
    creado_en       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dlcs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    juego_id      INTEGER NOT NULL REFERENCES juegos(id) ON DELETE CASCADE,
    nombre        TEXT NOT NULL,
    tipo          TEXT NOT NULL,
    descripcion   TEXT NOT NULL DEFAULT '',
    creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS adquisiciones (
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    juego_id      INTEGER NOT NULL REFERENCES juegos(id) ON DELETE CASCADE,
    precio_pagado INTEGER NOT NULL,
    creado_en     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (usuario_id, juego_id)
);

CREATE TABLE IF NOT EXISTS favoritos (
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    juego_id      INTEGER NOT NULL REFERENCES juegos(id) ON DELETE CASCADE,
    creado_en     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (usuario_id, juego_id)
);

CREATE TABLE IF NOT EXISTS resenas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    juego_id      INTEGER NOT NULL REFERENCES juegos(id) ON DELETE CASCADE,
    estrellas     INTEGER NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
    texto         TEXT NOT NULL,
    respuesta     TEXT,
    respondida_en TEXT,
    creado_en     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (usuario_id, juego_id)
);

CREATE TABLE IF NOT EXISTS movimientos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    cantidad      INTEGER NOT NULL,
    concepto      TEXT NOT NULL,
    -- Clave para que la recompensa por reseña solo se otorgue una vez por juego.
    clave         TEXT,
    creado_en     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (usuario_id, clave)
);

CREATE TABLE IF NOT EXISTS amistades (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    de_id         INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    para_id       INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    estado        TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada')),
    creado_en     TEXT NOT NULL DEFAULT (datetime('now')),
    aceptada_en   TEXT,
    CHECK (de_id <> para_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS amistad_unica
    ON amistades (min(de_id, para_id), max(de_id, para_id));
`;

function abrir() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = new DatabaseSync(DB_PATH);
    db.exec(SCHEMA);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get();
    if (n === 0) sembrar(db);
    return db;
}

// Transacción simple: si la función lanza un error, se deshace todo.
function transaccion(db, fn) {
    db.exec('BEGIN');
    try {
        const r = fn();
        db.exec('COMMIT');
        return r;
    } catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}

// Datos de demostración para que el sitio no arranque vacío.
// Todas las cuentas demo usan la contraseña "demo1234".
function sembrar(db) {
    const pass = hashPassword('demo1234');
    const insUser = db.prepare(
        `INSERT INTO usuarios (nombre, correo, pass_hash, tipo, creditos, creado_en)
         VALUES (?, ?, ?, ?, ?, datetime('now', ?))`);
    const insMov = db.prepare(
        `INSERT INTO movimientos (usuario_id, cantidad, concepto, clave, creado_en)
         VALUES (?, ?, ?, ?, datetime('now', ?))`);
    const usuario = (nombre, correo, tipo, creditos, hace = '-20 days') => {
        const id = Number(insUser.run(nombre, correo, pass, tipo, creditos, hace).lastInsertRowid);
        if (tipo === 'jugador') insMov.run(id, 100, 'Saldo inicial de la cuenta', 'inicial', hace);
        return id;
    };

    transaccion(db, () => {
        const pixel = usuario('PixelStudio', 'dev@demo.com', 'desarrollador', 0);
        const ember = usuario('EmberWorks', 'ember@demo.com', 'desarrollador', 0);
        const north = usuario('NorthwindGames', 'northwind@demo.com', 'desarrollador', 0);

        const jugador = usuario('JugadorDemo', 'jugador@demo.com', 'jugador', 110, '-14 days');
        const otros = {};
        for (const [n, c] of [['NovaRider', 100], ['LunaByte', 100], ['CraftMage', 100], ['ZeroShift', 100],
            ['AtlasFox', 100], ['DriftKing', 100], ['PixelNova', 100], ['RunePilot', 100], ['CloudNinja', 100],
            ['MarianaGC', 100], ['TeoPlay', 100], ['RodriV', 100]]) {
            otros[n] = usuario(n, `${n.toLowerCase()}@demo.com`, 'jugador', c);
        }

        const insJuego = db.prepare(
            `INSERT INTO juegos (desarrollador_id, titulo, descripcion, genero, clasificacion, precio,
                                 especificaciones, portada, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const juego = (...a) => Number(insJuego.run(...a).lastInsertRowid);
        const img = (f) => `/assets/images/${f}`;

        const nebula = juego(pixel, 'Nebula Drift', 'Carreras antigravedad a través de cinturones de asteroides.',
            'Carreras', 'E', 40, 'Windows 10 · Intel i5 · 8 GB RAM · 20 GB', img('n64_diddykongracing_label_thumb.jpg'), 'publicado');
        const hollow = juego(pixel, 'Hollow Keep', 'Explora un castillo en ruinas lleno de secretos.',
            'Aventura', 'T', 60, 'Windows 10 · 8 GB RAM · 15 GB', img('hollow-knight-thumb.jpg'), 'publicado');
        const harvest = juego(pixel, 'Pixel Harvest', 'Cultiva, cosecha y construye tu granja pixelada.',
            'Simulación', 'E', 25, 'Windows 10 · 4 GB RAM · 2 GB', img('Logo_of_Stardew_Valley.png'), 'publicado');
        juego(pixel, 'Iron Tide', 'Estrategia naval por turnos.',
            'Estrategia', 'T', 50, 'Windows 10 · 8 GB RAM · 10 GB', null, 'retirado');
        const embervale = juego(ember, 'Ember Vale', 'Un viaje de rol por aldeas, cuevas y territorios olvidados.',
            'RPG', 'T', 80, 'Windows 10 · Intel i7 · 16 GB RAM · 40 GB', img('fire-emblem-warriors-cover_cover_small.jpg'), 'publicado');
        const aurora = juego(north, 'Aurora Protocol', 'Toma decisiones tácticas para dirigir una colonia distante.',
            'Terror', 'M', 45, 'Windows 10 · 8 GB RAM · 30 GB', img('The_Callisto_Protocol_cover_art.jpg'), 'retirado');

        const insDlc = db.prepare('INSERT INTO dlcs (juego_id, nombre, tipo, descripcion) VALUES (?, ?, ?, ?)');
        insDlc.run(nebula, 'Cinturón de Orión', 'Expansión', '3 pistas nuevas en un cinturón de asteroides.');
        insDlc.run(nebula, 'Pack de naves clásicas', 'Vehículos', '5 vehículos con diseño retro.');
        insDlc.run(hollow, 'Las criptas olvidadas', 'Expansión', 'Una nueva zona subterránea con jefes inéditos.');

        const insAdq = db.prepare(
            `INSERT INTO adquisiciones (usuario_id, juego_id, precio_pagado, creado_en) VALUES (?, ?, ?, datetime('now', ?))`);
        const insRes = db.prepare(
            `INSERT INTO resenas (usuario_id, juego_id, estrellas, texto, respuesta, respondida_en, creado_en)
             VALUES (?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', ?) END, datetime('now', ?))`);

        // Biblioteca del jugador demo (los créditos de semilla ya reflejan estas compras como regalo inicial).
        insAdq.run(jugador, nebula, 0, '-13 days');
        insAdq.run(jugador, harvest, 0, '-10 days');
        insAdq.run(jugador, aurora, 0, '-12 days');
        insRes.run(jugador, nebula, 5, 'Las pistas son una locura y la sensación de velocidad se siente muy bien.',
            null, null, null, '-12 days');
        insMov.run(jugador, 10, 'Primera reseña · Nebula Drift', `resena:${nebula}`, '-12 days');
        const insFav = db.prepare('INSERT INTO favoritos (usuario_id, juego_id, creado_en) VALUES (?, ?, datetime(\'now\', ?))');
        insFav.run(jugador, nebula, '-9 days');
        insFav.run(jugador, embervale, '-5 days');
        insFav.run(jugador, harvest, '-3 days');

        // Reseñas de la comunidad
        const resenas = [
            [otros.MarianaGC, nebula, 5, 'Las pistas del cinturón de asteroides son una locura. La sensación de velocidad se siente muy bien, tanto con control como con teclado.', '¡Gracias, Mariana! Las pistas de asteroides fueron lo que más pulimos.'],
            [otros.TeoPlay, nebula, 5, 'Perfecto para partidas cortas. Cada carrera dura unos tres minutos y siempre quieres una más.', null],
            [otros.RodriV, nebula, 4, 'Muy buen juego, aunque la dificultad sube de golpe en la tercera copa. Me faltó un modo de práctica.', 'Tomamos nota, Rodrigo: un modo de práctica libre está en nuestra lista de pendientes.'],
            [otros.NovaRider, nebula, 4, 'Gran banda sonora y controles precisos. Ojalá agreguen más pistas.', null],
            [otros.LunaByte, hollow, 4, 'Atmósfera increíble y jefes muy bien diseñados.', null],
            [otros.CraftMage, hollow, 5, 'Cada rincón del castillo esconde algo. Muy recomendable.', null],
            [otros.AtlasFox, embervale, 5, 'Una historia preciosa y un mundo enorme para explorar.', null],
            [otros.ZeroShift, embervale, 4, 'El sistema de combate es muy satisfactorio.', null],
        ];
        for (const [u, j, e, t, r] of resenas) {
            insAdq.run(u, j, 0, '-8 days');
            insRes.run(u, j, e, t, r, r, '-6 days', '-7 days');
        }
        insAdq.run(otros.NovaRider, harvest, 0, '-8 days');
        insAdq.run(otros.CraftMage, nebula, 0, '-8 days');
        insAdq.run(otros.CraftMage, harvest, 0, '-8 days');

        // Amistades del jugador demo
        const insAm = db.prepare(
            `INSERT INTO amistades (de_id, para_id, estado, creado_en, aceptada_en)
             VALUES (?, ?, ?, datetime('now', ?), CASE WHEN ? = 'aceptada' THEN datetime('now', ?) END)`);
        insAm.run(jugador, otros.NovaRider, 'aceptada', '-12 days', 'aceptada', '-11 days');
        insAm.run(otros.LunaByte, jugador, 'aceptada', '-17 days', 'aceptada', '-17 days');
        insAm.run(jugador, otros.CraftMage, 'aceptada', '-22 days', 'aceptada', '-22 days');
        insAm.run(otros.ZeroShift, jugador, 'pendiente', '-10 days', 'pendiente', null);
        insAm.run(otros.AtlasFox, jugador, 'pendiente', '-12 days', 'pendiente', null);
        insAm.run(jugador, otros.DriftKing, 'pendiente', '-11 days', 'pendiente', null);
    });
}

module.exports = { abrir, transaccion, DB_PATH };

// `npm run reset-db` borra la base y la vuelve a crear con los datos demo.
if (require.main === module && process.argv.includes('--reset')) {
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + ext, { force: true });
    abrir().close();
    console.log('Base de datos reiniciada en', DB_PATH);
}
