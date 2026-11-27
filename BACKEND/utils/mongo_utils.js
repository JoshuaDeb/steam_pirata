const mongoose = require("mongoose");

// ---------- Identificadores ----------
function idValido(id) {
    return mongoose.isObjectIdOrHexString(id);
}

function leerId(valor) {
    if (typeof valor !== "string" || !idValido(valor)) {
        return null;
    }

    return valor.toLowerCase();
}

function mismoId(a, b) {
    return idValido(a) &&
        idValido(b) &&
        String(a).toLowerCase() === String(b).toLowerCase();
}

function contieneId(arreglo, id) {
    return Array.isArray(arreglo) &&
        arreglo.some(elemento => mismoId(elemento, id));
}

// ---------- Respuestas HTTP ----------
function datosUsuario(usuario) {
    return {
        id: String(usuario._id),
        nombre_usuario: usuario.nombre_usuario,
        correo: usuario.correo,
        role: usuario.role,
        creditos: usuario.creditos,
        descripcion_publica: usuario.descripcion_publica || "",
        foto_perfil: usuario.foto_perfil || null
    };
}

// ---------- Transacciones ----------
// Ejecutar varias operaciones como una sola transacción
async function transaccion(operaciones) {
    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            return await operaciones(session);
        });
    } finally {
        await session.endSession();
    }
}

// ---------- Búsquedas ----------
// Evitar que el texto de búsqueda se interprete como una expresión regular
function escaparRegex(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


module.exports = { idValido, leerId, mismoId, contieneId, datosUsuario, transaccion, escaparRegex };