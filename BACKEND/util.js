// Utilidades compartidas: errores HTTP, validaciones, sesión y formato de juegos.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class HttpError extends Error {
    constructor(status, mensaje, campo) {
        super(mensaje);
        this.status = status;
        this.campo = campo;
    }
}

const GENEROS = ['Acción', 'Aventura', 'Carreras', 'Deportes', 'Estrategia', 'RPG', 'Simulación', 'Terror'];
const CLASIFICACIONES = ['E', 'T', 'M'];
const TIPOS_DLC = ['Expansión', 'Vehículos', 'Personajes', 'Cosméticos', 'Niveles'];
const PAQUETES_CREDITOS = [10, 20, 50, 100, 200];
const CREDITOS_INICIALES = 100;
const RECOMPENSA_RESENA = 10;

const RE_NOMBRE = /^[A-Za-z0-9_]{3,20}$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function texto(valor, campo, { min = 0, max = 1000, requerido = true, etiqueta = campo } = {}) {
    const v = typeof valor === 'string' ? valor.trim() : '';
    if (!v && requerido) throw new HttpError(400, `${etiqueta} es obligatorio.`, campo);
    if (v && v.length < min) throw new HttpError(400, `${etiqueta} debe tener al menos ${min} caracteres.`, campo);
    if (v.length > max) throw new HttpError(400, `${etiqueta} no puede pasar de ${max} caracteres.`, campo);
    return v;
}

function nombreUsuario(valor, campo = 'nombre') {
    const v = typeof valor === 'string' ? valor.trim() : '';
    if (!RE_NOMBRE.test(v)) {
        throw new HttpError(400, 'El nombre de usuario debe tener de 3 a 20 caracteres: letras, números o guion bajo.', campo);
    }
    return v;
}

function correo(valor, campo = 'correo') {
    const v = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
    if (!RE_CORREO.test(v) || v.length > 120) {
        throw new HttpError(400, 'Ingresa un correo válido (ej. nombre@dominio.com).', campo);
    }
    return v;
}

function password(valor, campo = 'password') {
    if (typeof valor !== 'string' || valor.length < 8) {
        throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.', campo);
    }
    if (valor.length > 128) throw new HttpError(400, 'La contraseña es demasiado larga.', campo);
    return valor;
}

function entero(valor, campo, { min = 1, max = 100000, etiqueta = campo } = {}) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new HttpError(400, `${etiqueta} debe ser un número entero entre ${min} y ${max}.`, campo);
    }
    return n;
}

function opcion(valor, lista, campo, etiqueta = campo) {
    if (!lista.includes(valor)) throw new HttpError(400, `${etiqueta} no es válido.`, campo);
    return valor;
}

function idParam(valor) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Recurso no encontrado.');
    return n;
}

// --- Portadas: se reciben como data URL (base64) y se guardan en FRONTEND/uploads ---
const UPLOADS_DIR = path.join(__dirname, '..', 'FRONTEND', 'uploads');
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_PORTADA = 2 * 1024 * 1024;

function guardarPortada(dataUrl) {
    if (dataUrl == null || dataUrl === '') return null;
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
    if (!m) throw new HttpError(400, 'La portada debe ser una imagen PNG, JPG o WEBP.', 'portada');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_PORTADA) throw new HttpError(400, 'La portada no puede pesar más de 2 MB.', 'portada');
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const nombre = `${crypto.randomBytes(12).toString('hex')}.${MIME_EXT[m[1]]}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, nombre), buf);
    return `/uploads/${nombre}`;
}

function borrarPortada(ruta) {
    if (!ruta || !ruta.startsWith('/uploads/')) return;
    fs.rmSync(path.join(UPLOADS_DIR, path.basename(ruta)), { force: true });
}

// --- Juegos ---
// Columnas comunes para leer un juego con su desarrollador y calificación.
// `extra` permite agregar columnas calculadas (p. ej. fecha de adquisición).
const selectJuego = (extra = '') => `
    SELECT j.*, ${extra ? extra + ',' : ''} u.nombre AS desarrollador_nombre,
           (SELECT ROUND(AVG(estrellas), 1) FROM resenas r WHERE r.juego_id = j.id) AS calificacion,
           (SELECT COUNT(*) FROM resenas r WHERE r.juego_id = j.id) AS num_resenas,
           (SELECT COUNT(*) FROM dlcs d WHERE d.juego_id = j.id) AS num_dlcs
    FROM juegos j JOIN usuarios u ON u.id = j.desarrollador_id`;

function formatoJuego(fila) {
    return {
        id: fila.id,
        titulo: fila.titulo,
        descripcion: fila.descripcion,
        genero: fila.genero,
        clasificacion: fila.clasificacion,
        precio: fila.precio,
        especificaciones: fila.especificaciones,
        portada: fila.portada,
        estado: fila.estado,
        creado_en: fila.creado_en,
        desarrollador: { id: fila.desarrollador_id, nombre: fila.desarrollador_nombre },
        calificacion: fila.calificacion,
        num_resenas: fila.num_resenas,
        num_dlcs: fila.num_dlcs,
    };
}

function usuarioPublico(u) {
    return {
        id: u.id,
        nombre: u.nombre,
        correo: u.correo,
        tipo: u.tipo,
        creditos: u.creditos,
        creado_en: u.creado_en,
    };
}

module.exports = {
    HttpError, texto, nombreUsuario, correo, password, entero, opcion, idParam,
    guardarPortada, borrarPortada, selectJuego, formatoJuego, usuarioPublico,
    GENEROS, CLASIFICACIONES, TIPOS_DLC, PAQUETES_CREDITOS, CREDITOS_INICIALES, RECOMPENSA_RESENA,
};
