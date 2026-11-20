// Pruebas de la API con una base de datos temporal: `npm test`
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'steampirata-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
const { crearApp } = require('../server');
const { abrir } = require('../db');

let base;
let server;
let db;

test.before(async () => {
    db = abrir();
    server = crearApp(db).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://localhost:${server.address().port}`;
});
test.after(() => {
    server.close();
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
});

// Cliente con "navegador" propio: guarda la cookie de sesión.
function cliente() {
    let cookie = '';
    return async (method, url, body) => {
        const res = await fetch(base + url, {
            method,
            headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const set = res.headers.get('set-cookie');
        if (set) cookie = set.split(';')[0];
        return { status: res.status, body: await res.json() };
    };
}

test('registro, sesión, login y logout', async () => {
    const c = cliente();
    let r = await c('GET', '/api/me');
    assert.equal(r.status, 401);

    r = await c('POST', '/api/auth/registro', { nombre: 'x', correo: 'malo', password: '123', tipo: 'jugador' });
    assert.equal(r.status, 400);
    assert.equal(r.body.campo, 'nombre');

    r = await c('POST', '/api/auth/registro', { nombre: 'Nuevo_1', correo: 'nuevo@test.com', password: 'secreta123', tipo: 'jugador' });
    assert.equal(r.status, 201);
    assert.equal(r.body.usuario.creditos, 100);

    r = await c('GET', '/api/me');
    assert.equal(r.status, 200);
    assert.equal(r.body.usuario.nombre, 'Nuevo_1');

    r = await cliente()('POST', '/api/auth/registro', { nombre: 'nuevo_1', correo: 'otro@test.com', password: 'secreta123', tipo: 'jugador' });
    assert.equal(r.status, 409, 'nombre duplicado sin importar mayúsculas');

    await c('POST', '/api/auth/logout');
    assert.equal((await c('GET', '/api/me')).status, 401);

    r = await c('POST', '/api/auth/login', { correo: 'nuevo@test.com', password: 'incorrecta' });
    assert.equal(r.status, 401);
    r = await c('POST', '/api/auth/login', { correo: 'NUEVO@test.com', password: 'secreta123' });
    assert.equal(r.status, 200);
    assert.equal((await c('GET', '/api/me')).status, 200);
});

test('catálogo, compra, favoritos y reseña con recompensa única', async () => {
    const c = cliente();
    await c('POST', '/api/auth/registro', { nombre: 'Comprador', correo: 'c@test.com', password: 'secreta123', tipo: 'jugador' });

    let r = await c('GET', '/api/juegos?orden=precio_asc');
    assert.equal(r.status, 200);
    assert.ok(r.body.juegos.length >= 4);
    assert.ok(r.body.juegos.every((j) => j.estado === 'publicado'));
    const barato = r.body.juegos[0];

    r = await c('GET', '/api/juegos?genero=Carreras&calificacion_min=4');
    assert.ok(r.body.juegos.every((j) => j.genero === 'Carreras' && j.calificacion >= 4));

    r = await c('POST', `/api/juegos/${barato.id}/resenas`, { estrellas: 5, texto: 'Todavía no lo tengo' });
    assert.equal(r.status, 403);

    r = await c('POST', `/api/juegos/${barato.id}/adquirir`);
    assert.equal(r.status, 201);
    assert.equal(r.body.creditos, 100 - barato.precio);
    assert.equal((await c('POST', `/api/juegos/${barato.id}/adquirir`)).status, 409);

    // El más caro de la semilla (80) supera el saldo restante (75): debe rechazarse.
    const caro = (await c('GET', '/api/juegos?orden=precio_desc')).body.juegos[0];
    assert.ok(caro.precio > 100 - barato.precio);
    r = await c('POST', `/api/juegos/${caro.id}/adquirir`);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /créditos suficientes/);

    assert.equal((await c('PUT', `/api/juegos/${barato.id}/favorito`)).status, 200);
    r = await c('GET', '/api/me/favoritos');
    assert.equal(r.body.juegos.length, 1);
    assert.equal(r.body.juegos[0].adquirido, true);

    const antes = (await c('GET', '/api/me')).body.usuario.creditos;
    r = await c('POST', `/api/juegos/${barato.id}/resenas`, { estrellas: 4, texto: 'Muy divertido, lo recomiendo.' });
    assert.equal(r.status, 201);
    assert.equal(r.body.recompensa, 10);
    r = await c('POST', `/api/juegos/${barato.id}/resenas`, { estrellas: 5, texto: 'Edité mi reseña, ahora 5 estrellas.' });
    assert.equal(r.body.recompensa, 0);
    assert.equal((await c('GET', '/api/me')).body.usuario.creditos, antes + 10);

    r = await c('GET', '/api/me/biblioteca');
    assert.equal(r.body.juegos.length, 1);
    r = await c('GET', '/api/me/movimientos');
    assert.ok(r.body.movimientos.some((m) => m.cantidad === -barato.precio));

    r = await c('POST', '/api/me/creditos', { paquete: 50, metodo: 'paypal' });
    assert.equal(r.status, 201);
    assert.equal(r.body.usuario.creditos, antes + 60);
});

test('amistades', async () => {
    const a = cliente();
    const b = cliente();
    const ra = await a('POST', '/api/auth/registro', { nombre: 'AmigoA', correo: 'a@test.com', password: 'secreta123', tipo: 'jugador' });
    const rb = await b('POST', '/api/auth/registro', { nombre: 'AmigoB', correo: 'b@test.com', password: 'secreta123', tipo: 'jugador' });

    let r = await a('GET', '/api/amigos/buscar?q=AmigoB');
    assert.equal(r.body.jugadores.length, 1);
    r = await a('POST', '/api/amigos/solicitudes', { para_id: rb.body.usuario.id });
    assert.equal(r.status, 201);
    assert.equal((await a('POST', '/api/amigos/solicitudes', { para_id: rb.body.usuario.id })).status, 409);

    r = await b('GET', '/api/amigos');
    assert.equal(r.body.recibidas.length, 1);
    assert.equal((await b('POST', `/api/amigos/solicitudes/${r.body.recibidas[0].solicitud_id}/aceptar`)).status, 200);

    r = await a('GET', '/api/amigos');
    assert.equal(r.body.amigos.length, 1);
    assert.equal((await a('GET', `/api/amigos/usuarios/${rb.body.usuario.id}`)).body.usuario.relacion, 'amigos');
    assert.equal((await a('DELETE', `/api/amigos/${rb.body.usuario.id}`)).status, 200);
    assert.equal((await b('GET', '/api/amigos')).body.amigos.length, 0);
    assert.ok(ra.body.usuario.id);
});

test('panel de desarrollador y permisos por tipo de cuenta', async () => {
    const dev = cliente();
    const jug = cliente();
    await dev('POST', '/api/auth/registro', { nombre: 'Estudio', correo: 'e@test.com', password: 'secreta123', tipo: 'desarrollador' });
    await jug('POST', '/api/auth/registro', { nombre: 'Jugadora', correo: 'j@test.com', password: 'secreta123', tipo: 'jugador' });

    assert.equal((await jug('GET', '/api/dev/juegos')).status, 403);
    assert.equal((await dev('GET', '/api/me/biblioteca')).status, 403);

    let r = await dev('POST', '/api/dev/juegos', { titulo: 'Starlight Forge', genero: 'RPG', clasificacion: 'T', precio: 0 });
    assert.equal(r.status, 400);
    assert.equal(r.body.campo, 'precio');
    r = await dev('POST', '/api/dev/juegos', { titulo: 'Starlight Forge', descripcion: 'Forja armas', genero: 'RPG', clasificacion: 'T', precio: 30 });
    assert.equal(r.status, 201);
    const id = r.body.juego.id;

    r = await dev('POST', `/api/dev/juegos/${id}/dlcs`, { nombre: 'Pack', tipo: 'Cosméticos', descripcion: 'Skins' });
    assert.equal(r.body.juego.dlcs.length, 1);
    r = await dev('PUT', `/api/dev/juegos/${id}`, { precio: 20 });
    assert.equal(r.body.juego.precio, 20);

    r = await jug('GET', '/api/juegos?q=Starlight');
    assert.equal(r.body.juegos.length, 1);
    await jug('POST', `/api/juegos/${id}/adquirir`);
    await jug('POST', `/api/juegos/${id}/resenas`, { estrellas: 3, texto: 'Está bien, le falta contenido.' });

    const resena = (await dev('GET', '/api/dev/juegos')).body.juegos.find((j) => j.id === id).resenas[0];
    r = await dev('PUT', `/api/dev/resenas/${resena.id}/respuesta`, { texto: '¡Gracias! Pronto habrá más.' });
    assert.equal(r.body.juego.resenas[0].respuesta, '¡Gracias! Pronto habrá más.');

    await dev('POST', `/api/dev/juegos/${id}/retirar`);
    assert.equal((await jug('GET', '/api/juegos?q=Starlight')).body.juegos.length, 0);
    assert.equal((await jug('GET', '/api/me/biblioteca')).body.juegos[0].estado, 'retirado', 'sigue en la biblioteca');
});

test('perfil: editar datos, contraseña y eliminar cuenta', async () => {
    const c = cliente();
    await c('POST', '/api/auth/registro', { nombre: 'Perfil', correo: 'p@test.com', password: 'secreta123', tipo: 'jugador' });
    assert.equal((await c('PATCH', '/api/me', { correo: 'p@test' })).status, 400);
    assert.equal((await c('PATCH', '/api/me', { nombre: 'Perfil2', correo: 'p2@test.com' })).body.usuario.correo, 'p2@test.com');
    assert.equal((await c('PUT', '/api/me/password', { actual: 'mala', nueva: 'otraclave1' })).status, 400);
    assert.equal((await c('PUT', '/api/me/password', { actual: 'secreta123', nueva: 'otraclave1', confirmacion: 'otraclave1' })).status, 200);
    assert.equal((await cliente()('POST', '/api/auth/login', { correo: 'p2@test.com', password: 'otraclave1' })).status, 200);
    assert.equal((await c('DELETE', '/api/me', { confirmacion: 'no' })).status, 400);
    assert.equal((await c('DELETE', '/api/me', { confirmacion: 'ELIMINAR' })).status, 200);
    assert.equal((await cliente()('POST', '/api/auth/login', { correo: 'p2@test.com', password: 'otraclave1' })).status, 401);
});
