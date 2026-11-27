const Dlc = require("../models/dlc");
const Videojuego = require("../models/videojuego");
const { siguienteId } = require("../models/contador");

const TIPOS_CONTENIDO = Dlc.TIPOS_CONTENIDO;

// Comparar nombres sin importar mayúsculas
const COLACION_NOMBRE = { locale: "es", strength: 2 };


// ---------- Utilidades ----------

// Convertir un valor en un ID válido (entero positivo) o null
function leerId(valor) {
    const id = Number(valor);

    return Number.isInteger(id) && id > 0 ? id : null;
}

// Quitar campos internos de MongoDB antes de responder
function limpiar(documento) {
    const objeto = documento.toObject ? documento.toObject() : { ...documento };

    delete objeto._id;
    delete objeto.__v;

    return objeto;
}

// Validar los datos de un DLC (se usa al crear y al actualizar)
function validarDlc(body) {
    const { nombre, tipo_contenido, descripcion } = body ?? {};

    if (typeof nombre !== "string" || !nombre.trim()) {
        return { error: "El nombre del DLC es obligatorio" };
    }

    if (nombre.trim().length > 60) {
        return { error: "El nombre no puede superar los 60 caracteres" };
    }

    if (!TIPOS_CONTENIDO.includes(tipo_contenido)) {
        return { error: "El tipo de contenido no es válido" };
    }

    if (
        descripcion !== undefined &&
        descripcion !== null &&
        typeof descripcion !== "string"
    ) {
        return { error: "La descripción no es válida" };
    }

    const texto = (descripcion ?? "").trim();

    if (texto.length > 300) {
        return { error: "La descripción no puede superar los 300 caracteres" };
    }

    return {
        datos: {
            nombre: nombre.trim(),
            tipo_contenido: tipo_contenido,
            descripcion: texto
        }
    };
}

// Comprobar si el videojuego ya tiene otro DLC con el mismo nombre
async function nombreEnUso(idVideojuego, nombre, idExcluido = null) {
    const filtro = { id_videojuego: idVideojuego, nombre };

    if (idExcluido !== null) {
        filtro.id = { $ne: idExcluido };
    }

    return Boolean(await Dlc.exists(filtro).collation(COLACION_NOMBRE));
}

// Responder 409 si el índice único (videojuego + nombre) frenó un duplicado
function esNombreDuplicado(error) {
    return error && error.code === 11000;
}


// ---------- Endpoints ----------

// GET /api/dlcs (opcional ?id_videojuego=)
async function listarDlcs(req, res) {
    const filtroTexto = req.query.id_videojuego;
    const filtro = {};

    if (typeof filtroTexto === "string" && filtroTexto.trim()) {
        const idVideojuego = leerId(filtroTexto);

        if (idVideojuego === null) {
            return res.status(400).json({ message: "El ID del videojuego no es válido" });
        }

        filtro.id_videojuego = idVideojuego;
    }

    try {
        const dlcs = await Dlc.find(filtro).sort({ id: 1 }).select("-_id").lean();

        res.status(200).json({ dlcs });
    } catch (error) {
        console.error("Error al consultar DLC:", error);
        res.status(500).json({ message: "Error al consultar los DLC" });
    }
}

// GET /api/dlcs/:id
async function obtenerDlc(req, res) {
    const id = leerId(req.params.id);

    if (id === null) {
        return res.status(400).json({ message: "El ID del DLC no es válido" });
    }

    try {
        const dlc = await Dlc.findOne({ id }).select("-_id").lean();

        if (!dlc) {
            return res.status(404).json({ message: "DLC no encontrado" });
        }

        res.status(200).json({ dlc });
    } catch (error) {
        console.error("Error al consultar DLC:", error);
        res.status(500).json({ message: "Error al consultar los DLC" });
    }
}

// POST /api/dlcs → agregar un DLC a un videojuego propio
async function crearDlc(req, res) {
    const idVideojuego = leerId(req.body?.id_videojuego);

    if (idVideojuego === null) {
        return res.status(400).json({ message: "Debes indicar el videojuego al que pertenece el DLC" });
    }

    try {
        const juego = await Videojuego.findOne({ id: idVideojuego }).lean();

        if (!juego) {
            return res.status(404).json({ message: "El videojuego no existe" });
        }

        if (juego.id_desarrollador !== req.usuario.id) {
            return res.status(403).json({ message: "No puedes agregar DLC a videojuegos de otro desarrollador" });
        }

        if (juego.estado !== "publicado") {
            return res.status(409).json({ message: "No se pueden agregar DLC a un videojuego retirado" });
        }

        const { error, datos } = validarDlc(req.body);

        if (error) {
            return res.status(400).json({ message: error });
        }

        if (await nombreEnUso(idVideojuego, datos.nombre)) {
            return res.status(409).json({ message: "Este videojuego ya tiene un DLC con ese nombre" });
        }

        const nuevoDlc = await Dlc.create({
            id: await siguienteId("dlcs"),
            id_videojuego: idVideojuego,
            ...datos
        });

        res.status(201).json({
            message: "DLC agregado correctamente",
            dlc: limpiar(nuevoDlc)
        });
    } catch (error) {
        if (esNombreDuplicado(error)) {
            return res.status(409).json({ message: "Este videojuego ya tiene un DLC con ese nombre" });
        }

        console.error("Error al agregar el DLC:", error);
        res.status(500).json({ message: "Error al agregar el DLC" });
    }
}

// PUT /api/dlcs/:id → editar un DLC de un videojuego propio
async function actualizarDlc(req, res) {
    const id = leerId(req.params.id);

    if (id === null) {
        return res.status(400).json({ message: "El ID del DLC no es válido" });
    }

    try {
        const dlc = await Dlc.findOne({ id });

        if (!dlc) {
            return res.status(404).json({ message: "DLC no encontrado" });
        }

        const juego = await Videojuego.findOne({ id: dlc.id_videojuego }).lean();

        if (!juego) {
            return res.status(404).json({ message: "El videojuego del DLC no existe" });
        }

        if (juego.id_desarrollador !== req.usuario.id) {
            return res.status(403).json({ message: "No puedes modificar DLC de otro desarrollador" });
        }

        if (juego.estado !== "publicado") {
            return res.status(409).json({ message: "No se pueden editar los DLC de un videojuego retirado" });
        }

        const { error, datos } = validarDlc(req.body);

        if (error) {
            return res.status(400).json({ message: error });
        }

        if (await nombreEnUso(dlc.id_videojuego, datos.nombre, dlc.id)) {
            return res.status(409).json({ message: "Este videojuego ya tiene un DLC con ese nombre" });
        }

        Object.assign(dlc, datos);
        await dlc.save();

        res.status(200).json({
            message: "DLC actualizado correctamente",
            dlc: limpiar(dlc)
        });
    } catch (error) {
        if (esNombreDuplicado(error)) {
            return res.status(409).json({ message: "Este videojuego ya tiene un DLC con ese nombre" });
        }

        console.error("Error al actualizar el DLC:", error);
        res.status(500).json({ message: "Error al actualizar el DLC" });
    }
}

// DELETE /api/dlcs/:id → eliminar un DLC de un videojuego propio
async function eliminarDlc(req, res) {
    const id = leerId(req.params.id);

    if (id === null) {
        return res.status(400).json({ message: "El ID del DLC no es válido" });
    }

    try {
        const dlc = await Dlc.findOne({ id }).lean();

        if (!dlc) {
            return res.status(404).json({ message: "DLC no encontrado" });
        }

        const juego = await Videojuego.findOne({ id: dlc.id_videojuego }).lean();

        // Si el videojuego ya no existe, cualquier desarrollador podría limpiar el DLC
        // huérfano; por seguridad solo se permite al dueño del videojuego.
        if (!juego || juego.id_desarrollador !== req.usuario.id) {
            return res.status(403).json({ message: "No puedes eliminar DLC de otro desarrollador" });
        }

        await Dlc.deleteOne({ id });

        res.status(200).json({
            message: "DLC eliminado correctamente",
            dlc: limpiar(dlc)
        });
    } catch (error) {
        console.error("Error al eliminar el DLC:", error);
        res.status(500).json({ message: "Error al eliminar el DLC" });
    }
}

module.exports = {
    listarDlcs,
    obtenerDlc,
    crearDlc,
    actualizarDlc,
    eliminarDlc
};
