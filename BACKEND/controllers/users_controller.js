const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const Usuario = require("../models/usuario");
const Videojuego = require("../models/videojuego");
const Dlc = require("../models/dlc");
const Resena = require("../models/resena");
const Amistad = require("../models/amistad");
const Biblioteca = require("../models/biblioteca");
const Favorito = require("../models/favorito");
const Compra = require("../models/compra");
const { recalcularCalificaciones } = require("../utils/calificaciones");


// ---------- Utilidades ----------

// Convertir un valor en un ID válido (entero positivo) o null
function leerIdPositivo(valor) {
    const id = Number(valor);

    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Datos públicos del usuario (sin passwordHash)
function usuarioPublico(usuario) {
    return {
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario,
        correo: usuario.correo,
        role: usuario.role,
        creditos: usuario.creditos,
        descripcion_publica: usuario.descripcion_publica || "",
        foto_perfil: usuario.foto_perfil || null
    };
}


// ---------- Datos de la cuenta ----------

async function actualizarNombre(req, res) {
    const id = Number(req.params.id);
    const { nombre_usuario } = req.body;

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Identificador de usuario inválido" });
    }

    if (typeof nombre_usuario !== "string" ||
        nombre_usuario.trim().length < 3 ||
        nombre_usuario.trim().length > 30) {
        return res.status(400).json({ message: "El nombre debe tener entre 3 y 30 caracteres" });
    }

    const nombre = nombre_usuario.trim();

    try {
        // Comprobar que el nombre no esté ocupado por otro usuario (sin importar mayúsculas)
        const nombreExiste = await Usuario.exists({ id: { $ne: id }, nombre_usuario: nombre })
            .collation({ locale: "es", strength: 2 });

        if (nombreExiste) {
            return res.status(409).json({ message: "El nombre de usuario ya está registrado" });
        }

        const usuario = await Usuario.findOneAndUpdate(
            { id },
            { nombre_usuario: nombre },
            { new: true, runValidators: true }
        ).lean();

        if (!usuario) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        res.status(200).json({
            message: "Nombre actualizado correctamente",
            user: usuarioPublico(usuario)
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "El nombre de usuario ya está registrado" });
        }

        console.error("Error al actualizar usuario:", error);
        res.status(500).json({ message: "Error al actualizar el usuario" });
    }
}

async function actualizarCorreo(req, res) {
    const id = Number(req.params.id);
    const { correo } = req.body;

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Identificador de usuario inválido" });
    }

    if (typeof correo !== "string") {
        return res.status(400).json({ message: "El correo electrónico no es válido" });
    }

    const email = correo.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "El correo electrónico no es válido" });
    }

    try {
        if (await Usuario.exists({ id: { $ne: id }, correo: email })) {
            return res.status(409).json({ message: "El correo electrónico ya está registrado" });
        }

        const usuario = await Usuario.findOneAndUpdate(
            { id },
            { correo: email },
            { new: true, runValidators: true }
        ).lean();

        if (!usuario) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        res.status(200).json({
            message: "Correo actualizado correctamente",
            user: usuarioPublico(usuario)
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "El correo electrónico ya está registrado" });
        }

        console.error("Error al actualizar correo:", error);
        res.status(500).json({ message: "Error al actualizar el correo electrónico" });
    }
}

async function actualizarDescripcion(req, res) {
    const id = Number(req.params.id);
    const { descripcion_publica, favoritos_perfil } = req.body;

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Identificador de usuario inválido" });
    }

    if (
        typeof descripcion_publica !== "string" ||
        descripcion_publica.trim().length < 1 ||
        descripcion_publica.trim().length > 300
    ) {
        return res.status(400).json({ message: "La descripción debe tener entre 1 y 300 caracteres" });
    }

    try {
        const usuario = await Usuario.findOne({ id });

        if (!usuario) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        // Validar los tres videojuegos destacados del perfil
        if (favoritos_perfil !== undefined) {
            if (usuario.role !== "jugador" || !Array.isArray(favoritos_perfil) || favoritos_perfil.length !== 3) {
                return res.status(400).json({ message: "La selección de favoritos no es válida" });
            }

            // Permitir posiciones vacías y validar los IDs
            const idsElegidos = favoritos_perfil.filter(idJuego => idJuego !== null);

            if (idsElegidos.some(idJuego => !Number.isSafeInteger(idJuego) || idJuego <= 0) ||
                new Set(idsElegidos).size !== idsElegidos.length) {
                return res.status(400).json({ message: "Los videojuegos seleccionados deben ser distintos" });
            }

            // Solo se pueden destacar videojuegos adquiridos
            const adquiridos = await Biblioteca.countDocuments({
                usuario_id: id,
                videojuego_id: { $in: idsElegidos }
            });

            if (adquiridos !== idsElegidos.length) {
                return res.status(400).json({ message: "Solo puedes destacar videojuegos de tu biblioteca" });
            }

            usuario.favoritos_perfil = favoritos_perfil;
        }

        usuario.descripcion_publica = descripcion_publica.trim();
        await usuario.save();

        res.status(200).json({
            message: "Descripción pública actualizada correctamente",
            user: {
                ...usuarioPublico(usuario),
                favoritos_perfil: usuario.favoritos_perfil.length ? usuario.favoritos_perfil : [null, null, null]
            }
        });
    } catch (error) {
        console.error("Error al actualizar descripción:", error);
        res.status(500).json({ message: "Error al actualizar la descripción pública" });
    }
}

async function cambiarContrasena(req, res) {
    const id = Number(req.params.id);
    const { contrasena_actual, contrasena_nueva, confirmar_contrasena } = req.body;

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Identificador de usuario inválido" });
    }

    if (
        typeof contrasena_actual !== "string" ||
        typeof contrasena_nueva !== "string" ||
        typeof confirmar_contrasena !== "string" ||
        !contrasena_actual ||
        !contrasena_nueva.trim() ||
        !confirmar_contrasena
    ) {
        return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    if (contrasena_nueva.length < 8) {
        return res.status(400).json({ message: "La nueva contraseña debe tener al menos 8 caracteres" });
    }

    if (contrasena_nueva !== confirmar_contrasena) {
        return res.status(400).json({ message: "Las nuevas contraseñas no coinciden" });
    }

    try {
        // passwordHash tiene select:false, hay que pedirlo
        const usuario = await Usuario.findOne({ id }).select("+passwordHash");

        if (!usuario) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        if (!(await bcrypt.compare(contrasena_actual, usuario.passwordHash))) {
            return res.status(401).json({ message: "La contraseña actual es incorrecta" });
        }

        if (contrasena_actual === contrasena_nueva) {
            return res.status(400).json({ message: "La nueva contraseña debe ser diferente a la actual" });
        }

        usuario.passwordHash = await bcrypt.hash(contrasena_nueva, 10);
        await usuario.save();

        res.status(200).json({ message: "Contraseña actualizada correctamente" });
    } catch (error) {
        console.error("Error al cambiar contraseña:", error);
        res.status(500).json({ message: "Error al actualizar la contraseña" });
    }
}

async function eliminarCuenta(req, res) {
    const id = Number(req.params.id);
    const { contrasena_actual, confirmacion } = req.body || {};

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Identificador de usuario inválido" });
    }

    if (typeof contrasena_actual !== "string" || !contrasena_actual) {
        return res.status(400).json({ message: "Debes introducir tu contraseña actual" });
    }

    if (confirmacion !== "ELIMINAR") {
        return res.status(400).json({ message: "Debes escribir ELIMINAR para confirmar" });
    }

    let sesion;

    try {
        const usuario = await Usuario.findOne({ id }).select("+passwordHash").lean();

        if (!usuario) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        if (!(await bcrypt.compare(contrasena_actual, usuario.passwordHash))) {
            return res.status(401).json({ message: "La contraseña actual es incorrecta" });
        }

        // Todo se borra junto o no se borra nada (transacción)
        sesion = await mongoose.startSession();
        let totalRetirados = 0;

        await sesion.withTransaction(async () => {
            if (usuario.role === "desarrollador") {
                // Retirar del catálogo sus juegos, conservando juegos, DLC, bibliotecas y reseñas
                const resultado = await Videojuego.updateMany(
                    { id_desarrollador: id, estado: "publicado" },
                    { estado: "retirado" },
                    { session: sesion }
                );
                totalRetirados = resultado.modifiedCount;
            } else {
                // Juegos que tenían reseñas de este jugador (para recalcular su promedio)
                const juegosResenados = await Resena.distinct("juego_id", { usuario_id: id }).session(sesion);

                await Biblioteca.deleteMany({ usuario_id: id }, { session: sesion });
                await Favorito.deleteMany({ usuario_id: id }, { session: sesion });
                await Resena.deleteMany({ usuario_id: id }, { session: sesion });
                await Compra.deleteMany({ usuario_id: id }, { session: sesion });
                await Amistad.deleteMany(
                    { $or: [{ solicitante_id: id }, { receptor_id: id }] },
                    { session: sesion }
                );

                await recalcularCalificaciones(juegosResenados, sesion);
            }

            // Eliminar al usuario al final
            await Usuario.deleteOne({ id }, { session: sesion });
        });

        const respuesta = { message: "Cuenta eliminada correctamente" };

        if (usuario.role === "desarrollador") {
            respuesta.videojuegos_retirados = totalRetirados;
        }

        res.status(200).json(respuesta);
    } catch (error) {
        console.error("Error al eliminar cuenta:", error);
        res.status(500).json({ message: "Error al eliminar la cuenta" });
    } finally {
        if (sesion) await sesion.endSession();
    }
}

// Consultar los datos públicos del usuario (incluye el saldo de créditos actualizado)
async function obtenerUsuario(req, res) {
    const id = leerIdPositivo(req.params.id);

    if (id === null) {
        return res.status(400).json({ message: "Identificador de usuario inválido" });
    }

    try {
        const usuario = await Usuario.findOne({ id }).lean();

        if (!usuario) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        res.status(200).json({ user: usuarioPublico(usuario) });
    } catch (error) {
        console.error("Error al consultar el usuario:", error);
        res.status(500).json({ message: "Error al consultar el usuario" });
    }
}


// ---------- Biblioteca y favoritos ----------
// Cada registro de bibliotecas y favoritos solo guarda dos referencias:
// { usuario_id, videojuego_id }. Se ordenan por _id para conservar el orden
// en que se agregaron.

// Combinar los registros (solo IDs) con los datos del videojuego, su desarrollador y sus DLC
async function armarJuegos(registros) {
    const ids = registros.map(registro => registro.videojuego_id);

    const videojuegos = await Videojuego.find({ id: { $in: ids } }).select("-_id").lean();
    const desarrolladores = await Usuario.find(
        { id: { $in: videojuegos.map(juego => juego.id_desarrollador) } },
        "id nombre_usuario"
    ).lean();
    const dlcs = await Dlc.find({ id_videojuego: { $in: ids } }).select("-_id").lean();

    return registros
        .map(registro => {
            const juego = videojuegos.find(item => item.id === registro.videojuego_id);

            if (!juego) return null;

            const desarrollador = desarrolladores.find(user => user.id === juego.id_desarrollador);

            return {
                ...juego,
                desarrollador: desarrollador ? desarrollador.nombre_usuario : "Desarrollador desconocido",
                dlcs: dlcs.filter(dlc => dlc.id_videojuego === juego.id)
            };
        })
        .filter(Boolean);
}

// Leer un usuario jugador a partir del :id de la URL.
// Devuelve el usuario o responde con el error y devuelve null.
async function obtenerJugador(req, res) {
    const id = leerIdPositivo(req.params.id);

    if (id === null) {
        res.status(400).json({ message: "Identificador de usuario inválido" });
        return null;
    }

    const usuario = await Usuario.findOne({ id }).lean();

    if (!usuario) {
        res.status(404).json({ message: "Usuario no encontrado" });
        return null;
    }

    if (usuario.role !== "jugador") {
        res.status(403).json({ message: "Solo los jugadores tienen biblioteca y favoritos" });
        return null;
    }

    return usuario;
}

// Consultar la biblioteca del usuario
async function listarBiblioteca(req, res) {
    try {
        const usuario = await obtenerJugador(req, res);
        if (!usuario) return;

        const registros = await Biblioteca.find({ usuario_id: usuario.id }).sort({ _id: 1 }).lean();
        const videojuegos = await armarJuegos(registros);

        res.status(200).json({ total: videojuegos.length, videojuegos });
    } catch (error) {
        console.error("Error al consultar la biblioteca:", error);
        res.status(500).json({ message: "Error al consultar la biblioteca" });
    }
}

// Adquirir un videojuego: lo agrega a la biblioteca y transfiere los créditos al desarrollador
async function agregarABiblioteca(req, res) {
    const idJuego = leerIdPositivo(req.body?.videojuego_id);

    if (idJuego === null) {
        return res.status(400).json({ message: "Identificador de videojuego inválido" });
    }

    let sesion;

    try {
        const usuario = await obtenerJugador(req, res);
        if (!usuario) return;

        const juego = await Videojuego.findOne({ id: idJuego }).lean();

        if (!juego) {
            return res.status(404).json({ message: "Videojuego no encontrado" });
        }

        if (juego.estado !== "publicado") {
            return res.status(409).json({ message: "Este videojuego ya no está disponible en el catálogo" });
        }

        if (await Biblioteca.exists({ usuario_id: usuario.id, videojuego_id: idJuego })) {
            return res.status(409).json({ message: "Ya tienes este videojuego en tu biblioteca" });
        }

        const desarrollador = await Usuario.exists({ id: juego.id_desarrollador, role: "desarrollador" });

        if (!desarrollador) {
            return res.status(409).json({ message: "El videojuego no tiene un desarrollador válido" });
        }

        if (!Number.isSafeInteger(juego.precio_creditos) || juego.precio_creditos < 1) {
            return res.status(500).json({ message: "Datos de créditos inválidos" });
        }

        if (usuario.creditos < juego.precio_creditos) {
            return res.status(409).json({ message: "No tienes créditos suficientes para adquirir este videojuego" });
        }

        // Transferencia atómica: o se hace todo o no se hace nada
        sesion = await mongoose.startSession();
        let jugadorActualizado = null;

        await sesion.withTransaction(async () => {
            // Descontar solo si todavía le alcanza (evita saldo negativo con dos clics rápidos)
            jugadorActualizado = await Usuario.findOneAndUpdate(
                { id: usuario.id, creditos: { $gte: juego.precio_creditos } },
                { $inc: { creditos: -juego.precio_creditos } },
                { new: true, session: sesion }
            ).lean();

            if (!jugadorActualizado) return;

            await Usuario.updateOne(
                { id: juego.id_desarrollador },
                { $inc: { creditos: juego.precio_creditos } },
                { session: sesion }
            );

            await Biblioteca.create(
                [{ usuario_id: usuario.id, videojuego_id: idJuego }],
                { session: sesion }
            );
        });

        if (!jugadorActualizado) {
            return res.status(409).json({ message: "No tienes créditos suficientes para adquirir este videojuego" });
        }

        res.status(201).json({
            message: "Videojuego agregado a tu biblioteca",
            user: usuarioPublico(jugadorActualizado)
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "Ya tienes este videojuego en tu biblioteca" });
        }

        console.error("Error al agregar a la biblioteca:", error);
        res.status(500).json({ message: "Error al adquirir el videojuego" });
    } finally {
        if (sesion) await sesion.endSession();
    }
}

// Consultar los favoritos del usuario
async function listarFavoritos(req, res) {
    try {
        const usuario = await obtenerJugador(req, res);
        if (!usuario) return;

        const registros = await Favorito.find({ usuario_id: usuario.id }).sort({ _id: 1 }).lean();
        const videojuegos = await armarJuegos(registros);

        res.status(200).json({
            total: videojuegos.length,
            videojuegos,
            favoritos_perfil: usuario.favoritos_perfil && usuario.favoritos_perfil.length
                ? usuario.favoritos_perfil
                : [null, null, null]
        });
    } catch (error) {
        console.error("Error al consultar los favoritos:", error);
        res.status(500).json({ message: "Error al consultar los favoritos" });
    }
}

// Agregar un videojuego a favoritos (no requiere haberlo adquirido)
async function agregarFavorito(req, res) {
    const idJuego = leerIdPositivo(req.body?.videojuego_id);

    if (idJuego === null) {
        return res.status(400).json({ message: "Identificador de videojuego inválido" });
    }

    try {
        const usuario = await obtenerJugador(req, res);
        if (!usuario) return;

        if (!(await Videojuego.exists({ id: idJuego }))) {
            return res.status(404).json({ message: "Videojuego no encontrado" });
        }

        if (await Favorito.exists({ usuario_id: usuario.id, videojuego_id: idJuego })) {
            return res.status(200).json({ message: "El videojuego ya estaba en tus favoritos" });
        }

        await Favorito.create({ usuario_id: usuario.id, videojuego_id: idJuego });

        res.status(201).json({ message: "Videojuego agregado a favoritos" });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(200).json({ message: "El videojuego ya estaba en tus favoritos" });
        }

        console.error("Error al agregar favorito:", error);
        res.status(500).json({ message: "Error al agregar a favoritos" });
    }
}

// Quitar un videojuego de favoritos
async function eliminarFavorito(req, res) {
    const idJuego = leerIdPositivo(req.params.juegoId);

    if (idJuego === null) {
        return res.status(400).json({ message: "Identificador de videojuego inválido" });
    }

    try {
        const usuario = await obtenerJugador(req, res);
        if (!usuario) return;

        const resultado = await Favorito.deleteOne({ usuario_id: usuario.id, videojuego_id: idJuego });

        if (resultado.deletedCount === 0) {
            return res.status(404).json({ message: "El videojuego no está en tus favoritos" });
        }

        res.status(200).json({ message: "Videojuego quitado de favoritos" });
    } catch (error) {
        console.error("Error al quitar favorito:", error);
        res.status(500).json({ message: "Error al quitar de favoritos" });
    }
}


module.exports = {
    actualizarNombre,
    actualizarCorreo,
    actualizarDescripcion,
    cambiarContrasena,
    eliminarCuenta,
    obtenerUsuario,
    listarBiblioteca,
    agregarABiblioteca,
    listarFavoritos,
    agregarFavorito,
    eliminarFavorito
};
