const Resena = require("../models/resena");
const Usuario = require("../models/usuario");
const Videojuego = require("../models/videojuego");
const Biblioteca = require("../models/biblioteca");
const { siguienteId } = require("../models/contador");
const { recalcularCalificaciones } = require("../utils/calificaciones");


// Créditos que se ganan por la primera reseña de cada videojuego de la biblioteca
const PREMIO_RESENA = 10;


// ---------- Utilidades ----------

function validarResena(estrellas, texto) {
    if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
        return "Elige de 1 a 5 estrellas";
    }

    if (typeof texto !== "string" || texto.trim().length < 5) {
        return "La reseña debe tener al menos 5 caracteres";
    }

    if (texto.trim().length > 500) {
        return "La reseña no puede pasar de 500 caracteres";
    }

    return null;
}

// Convertir un valor en un ID válido (entero positivo) o null
function leerId(valor) {
    const id = Number(valor);

    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Quitar campos internos de MongoDB antes de responder
function limpiar(documento) {
    const objeto = documento.toObject ? documento.toObject() : { ...documento };

    delete objeto._id;
    delete objeto.__v;

    return objeto;
}

// Calificación actual de un videojuego (para devolverla en las respuestas)
async function calificacionDe(juegoId) {
    const juego = await Videojuego.findOne({ id: juegoId }, "calificacion_promedio total_resenas").lean();

    return {
        calificacion_promedio: juego ? juego.calificacion_promedio : null,
        total_resenas: juego ? juego.total_resenas : 0
    };
}

// Agregar el nombre del autor y el título del juego a cada reseña
async function armarResenas(resenas) {
    const autores = await Usuario.find(
        { id: { $in: resenas.map(resena => resena.usuario_id) } },
        "id nombre_usuario"
    ).lean();

    const juegos = await Videojuego.find(
        { id: { $in: resenas.map(resena => resena.juego_id) } },
        "id titulo"
    ).lean();

    return resenas.map(resena => {
        const autor = autores.find(usuario => usuario.id === resena.usuario_id);
        const juego = juegos.find(videojuego => videojuego.id === resena.juego_id);

        return {
            ...limpiar(resena),
            nombre_usuario: autor ? autor.nombre_usuario : "Usuario eliminado",
            titulo_juego: juego ? juego.titulo : "Juego eliminado"
        };
    });
}


// ---------- JUGADOR ----------

// GET /api/resenas (opcional ?juego_id= y/o ?usuario_id=)
async function listarResenas(req, res) {
    const juegoId = leerId(req.query.juego_id);
    const usuarioId = leerId(req.query.usuario_id);

    const filtro = {};

    if (juegoId) filtro.juego_id = juegoId;
    if (usuarioId) filtro.usuario_id = usuarioId;

    try {
        const resenas = await Resena.find(filtro).sort({ _id: 1 }).lean();

        res.status(200).json({ resenas: await armarResenas(resenas) });
    } catch (error) {
        console.error("Error al consultar reseñas:", error);
        res.status(500).json({ message: "Error al consultar las reseñas" });
    }
}

// POST /api/resenas → escribir una reseña de un juego de la biblioteca
async function crearResena(req, res) {
    const usuarioId = req.usuario.id;
    const juegoId = leerId(req.body.juego_id);
    const estrellas = Number(req.body.estrellas);
    const texto = req.body.texto;

    const error = validarResena(estrellas, texto);

    if (error) {
        return res.status(400).json({ message: error });
    }

    try {
        const usuario = await Usuario.findOne({ id: usuarioId }).lean();

        if (!usuario || usuario.role !== "jugador") {
            return res.status(403).json({ message: "Solo los jugadores pueden escribir reseñas" });
        }

        if (juegoId === null || !(await Videojuego.exists({ id: juegoId }))) {
            return res.status(404).json({ message: "El videojuego no existe" });
        }

        // Solo se pueden reseñar los videojuegos adquiridos (los de la biblioteca)
        if (!(await Biblioteca.exists({ usuario_id: usuarioId, videojuego_id: juegoId }))) {
            return res.status(403).json({ message: "Solo puedes reseñar los videojuegos de tu biblioteca" });
        }

        if (await Resena.exists({ usuario_id: usuarioId, juego_id: juegoId })) {
            return res.status(409).json({ message: "Ya escribiste una reseña de este juego" });
        }

        const nuevaResena = await Resena.create({
            id: await siguienteId("resenas"),
            usuario_id: usuarioId,
            juego_id: juegoId,
            estrellas: estrellas,
            texto: texto.trim(),
            fecha: new Date()
        });

        // Actualizar el promedio del videojuego
        await recalcularCalificaciones([juegoId]);

        // Premio por la primera reseña del videojuego. Los juegos premiados se
        // guardan en el usuario (resenas_premiadas) para que borrar la reseña y
        // volver a escribirla no entregue el premio otra vez.
        // La condición $ne y el $push van en la MISMA operación: es imposible
        // cobrar el premio dos veces aunque lleguen dos peticiones a la vez.
        const premiado = await Usuario.findOneAndUpdate(
            { id: usuarioId, resenas_premiadas: { $ne: juegoId } },
            { $inc: { creditos: PREMIO_RESENA }, $push: { resenas_premiadas: juegoId } },
            { new: true }
        ).lean();

        const premio = premiado ? PREMIO_RESENA : 0;
        const creditos = premiado ? premiado.creditos : usuario.creditos;

        res.status(201).json({
            message: premio > 0
                ? `Reseña publicada. ¡Ganaste ${premio} créditos!`
                : "Reseña publicada",
            resena: limpiar(nuevaResena),
            premio: premio,
            creditos: creditos,
            ...(await calificacionDe(juegoId))
        });
    } catch (error) {
        // El índice único (usuario + juego) frena reseñas duplicadas simultáneas
        if (error.code === 11000) {
            return res.status(409).json({ message: "Ya escribiste una reseña de este juego" });
        }

        console.error("Error al crear la reseña:", error);
        res.status(500).json({ message: "Error al publicar la reseña" });
    }
}

// PUT /api/resenas/:id → editar una reseña propia
async function actualizarResena(req, res) {
    const id = leerId(req.params.id);
    const usuarioId = req.usuario.id;
    const estrellas = Number(req.body.estrellas);
    const texto = req.body.texto;

    const error = validarResena(estrellas, texto);

    if (error) {
        return res.status(400).json({ message: error });
    }

    try {
        const resena = id === null ? null : await Resena.findOne({ id });

        if (!resena) {
            return res.status(404).json({ message: "Reseña no encontrada" });
        }

        if (resena.usuario_id !== usuarioId) {
            return res.status(403).json({ message: "Solo puedes editar tus propias reseñas" });
        }

        resena.estrellas = estrellas;
        resena.texto = texto.trim();
        resena.fecha = new Date();
        await resena.save();

        await recalcularCalificaciones([resena.juego_id]);

        res.status(200).json({
            message: "Reseña actualizada",
            resena: limpiar(resena),
            ...(await calificacionDe(resena.juego_id))
        });
    } catch (error) {
        console.error("Error al actualizar la reseña:", error);
        res.status(500).json({ message: "Error al actualizar la reseña" });
    }
}

// DELETE /api/resenas/:id → borrar una reseña propia
async function eliminarResena(req, res) {
    const id = leerId(req.params.id);
    const usuarioId = req.usuario.id;

    try {
        const resena = id === null ? null : await Resena.findOne({ id }).lean();

        if (!resena) {
            return res.status(404).json({ message: "Reseña no encontrada" });
        }

        if (resena.usuario_id !== usuarioId) {
            return res.status(403).json({ message: "Solo puedes borrar tus propias reseñas" });
        }

        await Resena.deleteOne({ id });
        await recalcularCalificaciones([resena.juego_id]);

        res.status(200).json({
            message: "Reseña eliminada",
            ...(await calificacionDe(resena.juego_id))
        });
    } catch (error) {
        console.error("Error al eliminar la reseña:", error);
        res.status(500).json({ message: "Error al eliminar la reseña" });
    }
}


// ---------- DESARROLLADOR: ver y responder reseñas de sus juegos ----------
// req.usuario lo llena autenticarUsuario; requerirDesarrollador revisa el rol

// GET /api/resenas/desarrollador → reseñas de los juegos de este desarrollador
async function listarResenasDesarrollador(req, res) {
    try {
        const misJuegos = await Videojuego.distinct("id", { id_desarrollador: req.usuario.id });

        const resenas = await Resena.find({ juego_id: { $in: misJuegos } }).sort({ _id: 1 }).lean();

        res.status(200).json({ resenas: await armarResenas(resenas) });
    } catch (error) {
        console.error("Error al consultar reseñas del desarrollador:", error);
        res.status(500).json({ message: "Error al consultar las reseñas" });
    }
}

// PUT /api/resenas/:id/respuesta → responder una reseña (si ya tenía respuesta, se reemplaza)
async function responderResena(req, res) {
    const id = leerId(req.params.id);
    const texto = req.body?.texto;

    if (typeof texto !== "string" || !texto.trim()) {
        return res.status(400).json({ message: "Escribe una respuesta" });
    }

    if (texto.trim().length > 500) {
        return res.status(400).json({ message: "La respuesta no puede pasar de 500 caracteres" });
    }

    try {
        const resena = id === null ? null : await Resena.findOne({ id });

        if (!resena) {
            return res.status(404).json({ message: "Reseña no encontrada" });
        }

        // Revisar que la reseña sea de un juego de este desarrollador
        const esSuJuego = await Videojuego.exists({ id: resena.juego_id, id_desarrollador: req.usuario.id });

        if (!esSuJuego) {
            return res.status(403).json({ message: "Solo puedes responder reseñas de tus juegos" });
        }

        resena.respuesta = texto.trim();
        await resena.save();

        res.status(200).json({ message: "Respuesta guardada", resena: limpiar(resena) });
    } catch (error) {
        console.error("Error al responder la reseña:", error);
        res.status(500).json({ message: "Error al guardar la respuesta" });
    }
}

module.exports = {
    recalcularCalificaciones,
    listarResenas, crearResena, actualizarResena, eliminarResena,
    listarResenasDesarrollador, responderResena
};
