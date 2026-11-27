const { getModel } = require("../storage");
const {leerId, mismoId } = require("../utils/mongo_utils");
const Videojuego = getModel("videojuegos");

const TIPOS_CONTENIDO = Videojuego.TIPOS_CONTENIDO;

const comparador = new Intl.Collator("es", {
    sensitivity: "accent"
});

// ---------- Utilidades ----------
// Preparar un DLC para enviarlo al frontend
function limpiar(dlc, idVideojuego) {
    return {
        id: String(dlc._id),
        id_videojuego: String(idVideojuego),
        nombre: dlc.nombre,
        tipo_contenido: dlc.tipo_contenido,
        descripcion: dlc.descripcion,
        createdAt: dlc.createdAt,
        updatedAt: dlc.updatedAt
    };
}

// Validar los datos de un DLC
function validarDlc(body) {
    const {
        nombre,
        tipo_contenido,
        descripcion
    } = body ?? {};

    if (typeof nombre !== "string" || !nombre.trim()) {
        return {
            error: "El nombre del DLC es obligatorio"
        };
    }

    if (nombre.trim().length > 60) {
        return {
            error: "El nombre no puede superar los 60 caracteres"
        };
    }

    if (!TIPOS_CONTENIDO.includes(tipo_contenido)) {
        return {
            error: "El tipo de contenido no es válido"
        };
    }

    if (
        descripcion !== undefined &&
        descripcion !== null &&
        typeof descripcion !== "string"
    ) {
        return {
            error: "La descripción no es válida"
        };
    }

    const texto = (descripcion ?? "").trim();

    if (texto.length > 300) {
        return {
            error: "La descripción no puede superar los 300 caracteres"
        };
    }

    return {
        datos: {
            nombre: nombre.trim(),
            tipo_contenido,
            descripcion: texto
        }
    };
}

// Comprobar nombres duplicados dentro del videojuego
function nombreEnUso(juego, nombre, idExcluido = null) {
    return juego.dlcs.some(dlc => {

        if (
            idExcluido !== null &&
            mismoId(dlc._id, idExcluido)
        ) {
            return false;
        }

        return comparador.compare(dlc.nombre, nombre) === 0;
    });
}

// Manejar errores de escritura
function manejarError(error, res, mensaje) {
    if (
        error.name === "VersionError" ||
        error.name === "DocumentNotFoundError"
    ) {
        return res.status(409).json({
            message: "El videojuego fue modificado. Intenta nuevamente"
        });
    }

    if (error.name === "ValidationError") {
        return res.status(400).json({
            message: error.message
        });
    }

    console.error(mensaje, error);

    return res.status(500).json({
        message: mensaje
    });
}

// ---------- Endpoints ----------
// Opcionalmente filtrar por id_videojuego
async function listarDlcs(req, res) {
    const filtro = {};

    if (req.query.id_videojuego !== undefined) {

        const idVideojuego = leerId(
            req.query.id_videojuego
        );

        if (!idVideojuego) {
            return res.status(400).json({
                message: "El ID del videojuego no es válido"
            });
        }

        filtro._id = idVideojuego;
    }

    try {
        const videojuegos = await Videojuego.find(filtro)
            .select("dlcs")
            .lean();

        const dlcs = videojuegos.flatMap(juego =>
            juego.dlcs.map(dlc =>
                limpiar(dlc, juego._id)
            )
        );

        res.status(200).json({ dlcs });

    } catch (error) {
        console.error("Error al consultar DLC:", error);

        res.status(500).json({
            message: "Error al consultar los DLC"
        });
    }
}

async function obtenerDlc(req, res) {
    const id = leerId(req.params.id);

    if (!id) {
        return res.status(400).json({
            message: "El ID del DLC no es válido"
        });
    }

    try {
        const juego = await Videojuego.findOne({
            "dlcs._id": id
        }).select("dlcs");

        if (!juego) {
            return res.status(404).json({
                message: "DLC no encontrado"
            });
        }

        const dlc = juego.dlcs.id(id);

        if (!dlc) {
            return res.status(404).json({
                message: "DLC no encontrado"
            });
        }

        res.status(200).json({
            dlc: limpiar(dlc, juego._id)
        });

    } catch (error) {
        console.error("Error al consultar DLC:", error);

        res.status(500).json({
            message: "Error al consultar los DLC"
        });
    }
}

async function crearDlc(req, res) {
    const idVideojuego = leerId(
        req.body?.id_videojuego
    );

    if (!idVideojuego) {
        return res.status(400).json({
            message: "Debes indicar el videojuego al que pertenece el DLC"
        });
    }

    try {
        const juego = await Videojuego.findById(idVideojuego);

        if (!juego) {
            return res.status(404).json({
                message: "El videojuego no existe"
            });
        }

        if (!mismoId(juego.id_desarrollador, req.usuario.id)) {
            return res.status(403).json({
                message: "No puedes agregar DLC a videojuegos de otro desarrollador"
            });
        }

        if (juego.estado !== "publicado") {
            return res.status(409).json({
                message: "No se pueden agregar DLC a un videojuego retirado"
            });
        }

        const { error, datos } = validarDlc(req.body);

        if (error) {
            return res.status(400).json({
                message: error
            });
        }

        if (nombreEnUso(juego, datos.nombre)) {
            return res.status(409).json({
                message: "Este videojuego ya tiene un DLC con ese nombre"
            });
        }

        // Crear un subdocumento con su propio ObjectId
        const nuevoDlc = juego.dlcs.create(datos);

        juego.dlcs.push(nuevoDlc);

        // Guardar el videojuego junto con su nuevo DLC
        await juego.save();

        res.status(201).json({
            message: "DLC agregado correctamente",
            dlc: limpiar(nuevoDlc, juego._id)
        });

    } catch (error) {
        return manejarError(
            error,
            res,
            "Error al agregar el DLC"
        );
    }
}


// PUT /api/dlcs/:id
async function actualizarDlc(req, res) {
    const id = leerId(req.params.id);

    if (!id) {
        return res.status(400).json({
            message: "El ID del DLC no es válido"
        });
    }

    try {
        const juego = await Videojuego.findOne({
            "dlcs._id": id
        });

        if (!juego) {
            return res.status(404).json({
                message: "DLC no encontrado"
            });
        }

        if (!mismoId(juego.id_desarrollador, req.usuario.id)) {
            return res.status(403).json({
                message: "No puedes modificar DLC de otro desarrollador"
            });
        }

        if (juego.estado !== "publicado") {
            return res.status(409).json({
                message: "No se pueden editar los DLC de un videojuego retirado"
            });
        }

        const dlc = juego.dlcs.id(id);

        if (!dlc) {
            return res.status(404).json({
                message: "DLC no encontrado"
            });
        }

        const { error, datos } = validarDlc(req.body);

        if (error) {
            return res.status(400).json({
                message: error
            });
        }

        if (nombreEnUso(juego, datos.nombre, id)) {
            return res.status(409).json({
                message: "Este videojuego ya tiene un DLC con ese nombre"
            });
        }

        // Actualizar únicamente los campos permitidos
        Object.assign(dlc, datos);

        await juego.save();

        res.status(200).json({
            message: "DLC actualizado correctamente",
            dlc: limpiar(dlc, juego._id)
        });

    } catch (error) {
        return manejarError(
            error,
            res,
            "Error al actualizar el DLC"
        );
    }
}


// DELETE /api/dlcs/:id
async function eliminarDlc(req, res) {
    const id = leerId(req.params.id);

    if (!id) {
        return res.status(400).json({
            message: "El ID del DLC no es válido"
        });
    }

    try {
        const juego = await Videojuego.findOne({
            "dlcs._id": id
        });

        if (!juego) {
            return res.status(404).json({
                message: "DLC no encontrado"
            });
        }

        if (!mismoId(juego.id_desarrollador, req.usuario.id)) {
            return res.status(403).json({
                message: "No puedes eliminar DLC de otro desarrollador"
            });
        }

        const dlc = juego.dlcs.id(id);

        if (!dlc) {
            return res.status(404).json({
                message: "DLC no encontrado"
            });
        }

        // Conservar los datos para la respuesta
        const dlcEliminado = limpiar(dlc, juego._id);

        // Eliminar el subdocumento
        dlc.deleteOne();

        await juego.save();

        res.status(200).json({
            message: "DLC eliminado correctamente",
            dlc: dlcEliminado
        });

    } catch (error) {
        return manejarError(
            error,
            res,
            "Error al eliminar el DLC"
        );
    }
}


module.exports = { listarDlcs, obtenerDlc, crearDlc, actualizarDlc, eliminarDlc };