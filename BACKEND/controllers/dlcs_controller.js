const { leerDatos, guardarDatos } = require("../storage");

const TIPOS_CONTENIDO = [
    "Expansión", "Vehículos", "Personajes", "Cosméticos", "Niveles"
];

// Convertir un valor en un ID válido (entero positivo) o null
function leerId(valor) {
    const id = Number(valor);

    return Number.isInteger(id) && id > 0 ? id : null;
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
function nombreEnUso(dlcs, idVideojuego, nombre, idExcluido = null) {
    return dlcs.some(dlc =>
        dlc.id_videojuego === idVideojuego &&
        dlc.id !== idExcluido &&
        dlc.nombre.toLowerCase() === nombre.toLowerCase()
    );
}


function listarDlcs(req, res) {
    const filtro = req.query.id_videojuego;

    let idVideojuego = null;

    if (typeof filtro === "string" && filtro.trim()) {
        idVideojuego = leerId(filtro);

        if (idVideojuego === null) {
            return res.status(400).json({
                message: "El ID del videojuego no es válido"
            });
        }
    }

    let dlcs;

    try {
        dlcs = leerDatos("dlcs");
    } catch (error) {
        console.error("Error al leer DLC:", error);

        return res.status(500).json({
            message: "Error al consultar los DLC"
        });
    }

    if (idVideojuego !== null) {
        dlcs = dlcs.filter(dlc => dlc.id_videojuego === idVideojuego);
    }

    res.status(200).json({ dlcs });
}


function obtenerDlc(req, res) {
    const id = leerId(req.params.id);

    if (id === null) {
        return res.status(400).json({
            message: "El ID del DLC no es válido"
        });
    }

    let dlcs;

    try {
        dlcs = leerDatos("dlcs");
    } catch (error) {
        console.error("Error al leer DLC:", error);

        return res.status(500).json({
            message: "Error al consultar los DLC"
        });
    }

    const dlc = dlcs.find(item => item.id === id);

    if (!dlc) {
        return res.status(404).json({
            message: "DLC no encontrado"
        });
    }

    res.status(200).json({ dlc });
}


function crearDlc(req, res) {
    const idVideojuego = leerId(req.body?.id_videojuego);

    if (idVideojuego === null) {
        return res.status(400).json({
            message: "Debes indicar el videojuego al que pertenece el DLC"
        });
    }

    let videojuegos;
    let dlcs;

    try {
        videojuegos = leerDatos("videojuegos");
        dlcs = leerDatos("dlcs");
    } catch (error) {
        console.error("Error al leer DLC:", error);

        return res.status(500).json({
            message: "Error al consultar los DLC"
        });
    }

    const juego = videojuegos.find(item => item.id === idVideojuego);

    if (!juego) {
        return res.status(404).json({
            message: "El videojuego no existe"
        });
    }

    if (juego.id_desarrollador !== req.usuario.id) {
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
        return res.status(400).json({ message: error });
    }

    if (nombreEnUso(dlcs, idVideojuego, datos.nombre)) {
        return res.status(409).json({
            message: "Este videojuego ya tiene un DLC con ese nombre"
        });
    }

    // Generar un ID consecutivo
    const nuevoId = dlcs.length > 0
        ? Math.max(...dlcs.map(dlc => dlc.id)) + 1
        : 1;

    const nuevoDlc = {
        id: nuevoId,
        id_videojuego: idVideojuego,
        ...datos
    };

    dlcs.push(nuevoDlc);

    try {
        guardarDatos("dlcs", dlcs);
    } catch (error) {
        console.error("Error al guardar el DLC:", error);

        return res.status(500).json({
            message: "Error al agregar el DLC"
        });
    }

    res.status(201).json({
        message: "DLC agregado correctamente",
        dlc: nuevoDlc
    });
}


function actualizarDlc(req, res) {
    const id = leerId(req.params.id);

    if (id === null) {
        return res.status(400).json({
            message: "El ID del DLC no es válido"
        });
    }

    let videojuegos;
    let dlcs;

    try {
        videojuegos = leerDatos("videojuegos");
        dlcs = leerDatos("dlcs");
    } catch (error) {
        console.error("Error al leer DLC:", error);

        return res.status(500).json({
            message: "Error al consultar los DLC"
        });
    }

    const dlc = dlcs.find(item => item.id === id);

    if (!dlc) {
        return res.status(404).json({
            message: "DLC no encontrado"
        });
    }

    const juego = videojuegos.find(item => item.id === dlc.id_videojuego);

    if (!juego) {
        return res.status(404).json({
            message: "El videojuego del DLC no existe"
        });
    }

    if (juego.id_desarrollador !== req.usuario.id) {
        return res.status(403).json({
            message: "No puedes modificar DLC de otro desarrollador"
        });
    }

    if (juego.estado !== "publicado") {
        return res.status(409).json({
            message: "No se pueden editar los DLC de un videojuego retirado"
        });
    }

    const { error, datos } = validarDlc(req.body);

    if (error) {
        return res.status(400).json({ message: error });
    }

    if (nombreEnUso(dlcs, dlc.id_videojuego, datos.nombre, dlc.id)) {
        return res.status(409).json({
            message: "Este videojuego ya tiene un DLC con ese nombre"
        });
    }

    Object.assign(dlc, datos);

    try {
        guardarDatos("dlcs", dlcs);
    } catch (error) {
        console.error("Error al guardar el DLC:", error);

        return res.status(500).json({
            message: "Error al actualizar el DLC"
        });
    }

    res.status(200).json({
        message: "DLC actualizado correctamente",
        dlc: dlc
    });
}


function eliminarDlc(req, res) {
    const id = leerId(req.params.id);

    if (id === null) {
        return res.status(400).json({
            message: "El ID del DLC no es válido"
        });
    }

    let videojuegos;
    let dlcs;

    try {
        videojuegos = leerDatos("videojuegos");
        dlcs = leerDatos("dlcs");
    } catch (error) {
        console.error("Error al leer DLC:", error);

        return res.status(500).json({
            message: "Error al consultar los DLC"
        });
    }

    const indice = dlcs.findIndex(item => item.id === id);

    if (indice === -1) {
        return res.status(404).json({
            message: "DLC no encontrado"
        });
    }

    const dlc = dlcs[indice];
    const juego = videojuegos.find(item => item.id === dlc.id_videojuego);

    // Si el videojuego ya no existe, cualquier desarrollador podría limpiar el DLC
    // huérfano; por seguridad solo se permite al dueño del videojuego.
    if (!juego || juego.id_desarrollador !== req.usuario.id) {
        return res.status(403).json({
            message: "No puedes eliminar DLC de otro desarrollador"
        });
    }

    dlcs.splice(indice, 1);

    try {
        guardarDatos("dlcs", dlcs);
    } catch (error) {
        console.error("Error al eliminar el DLC:", error);

        return res.status(500).json({
            message: "Error al eliminar el DLC"
        });
    }

    res.status(200).json({
        message: "DLC eliminado correctamente",
        dlc: dlc
    });
}

module.exports = {
    listarDlcs,
    obtenerDlc,
    crearDlc,
    actualizarDlc,
    eliminarDlc
};
