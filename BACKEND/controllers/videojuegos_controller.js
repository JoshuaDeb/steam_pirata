const fs = require("fs");
const path = require("path");
const { leerDatos, guardarDatos } = require("../storage");

// Las portadas se guardan en el frontend, en assets/images
const CARPETA_PORTADAS = path.join(__dirname, "../../FRONTEND/assets/images");
const PORTADA_MAX_BYTES = 2 * 1024 * 1024;
const FORMATOS_PORTADA = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp"
};
// Solo se borran archivos creados por este módulo (nunca imágenes del proyecto)
const NOMBRE_PORTADA_PROPIA = /^juego-\d+-\d+\.(png|jpg|webp)$/;

const GENEROS = [
    "Acción", "Aventura", "Carreras", "Deportes",
    "Estrategia", "RPG", "Simulación", "Terror"
];
const CLASIFICACIONES = ["E", "T", "M"];

const LIMITE_POR_DEFECTO = 12;
const LIMITE_MAXIMO = 50;

// Convertir un valor en un ID válido (entero positivo) o null
function leerId(valor) {
    const id = Number(valor);

    return Number.isInteger(id) && id > 0 ? id : null;
}

// Quitar acentos y mayúsculas para comparar textos
function normalizar(texto) {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

// Leer un parámetro de la URL como texto (ignora arreglos u otros tipos)
function leerTexto(valor) {
    return typeof valor === "string" ? valor.trim() : "";
}

// Validar los datos de un videojuego (se usa al publicar y al actualizar)
function validarVideojuego(body) {
    const {
        titulo,
        descripcion,
        genero,
        clasificacion_edad,
        precio_creditos,
        especificaciones
    } = body ?? {};

    if (
        typeof titulo !== "string" ||
        typeof descripcion !== "string" ||
        !titulo.trim() ||
        !descripcion.trim()
    ) {
        return { error: "El título y la descripción son obligatorios" };
    }

    if (titulo.trim().length > 60) {
        return { error: "El título no puede superar los 60 caracteres" };
    }

    if (descripcion.trim().length > 1000) {
        return { error: "La descripción no puede superar los 1000 caracteres" };
    }

    if (!GENEROS.includes(genero)) {
        return { error: "El género seleccionado no es válido" };
    }

    if (!CLASIFICACIONES.includes(clasificacion_edad)) {
        return { error: "La clasificación de edad no es válida" };
    }

    if (!Number.isInteger(precio_creditos) || precio_creditos < 1) {
        return { error: "El precio debe ser un número entero mayor a 0" };
    }

    if (
        especificaciones !== undefined &&
        especificaciones !== null &&
        typeof especificaciones !== "string"
    ) {
        return { error: "Las especificaciones no son válidas" };
    }

    const specs = (especificaciones ?? "").trim();

    if (specs.length > 200) {
        return { error: "Las especificaciones no pueden superar los 200 caracteres" };
    }

    return {
        datos: {
            titulo: titulo.trim(),
            descripcion: descripcion.trim(),
            genero: genero,
            clasificacion_edad: clasificacion_edad,
            precio_creditos: precio_creditos,
            especificaciones: specs
        }
    };
}

// Validar la portada recibida como data URL (data:image/png;base64,...).
// Devuelve { buffer, extension } o { error }.
function validarPortada(portada) {
    if (typeof portada !== "string") {
        return { error: "La portada es obligatoria" };
    }

    const coincidencia = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(portada);

    if (!coincidencia) {
        return { error: "La portada debe ser una imagen PNG, JPG o WEBP" };
    }

    const tipo = coincidencia[1];
    const buffer = Buffer.from(coincidencia[2], "base64");

    if (buffer.length === 0) {
        return { error: "La portada está vacía" };
    }

    if (buffer.length > PORTADA_MAX_BYTES) {
        return { error: "La portada no puede superar los 2 MB" };
    }

    // Comprobar el contenido real del archivo, no solo lo que declara el cliente
    const esPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const esJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const esWebp = buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
        buffer.subarray(8, 12).toString("latin1") === "WEBP";

    const valido = (tipo === "image/png" && esPng) ||
        (tipo === "image/jpeg" && esJpg) ||
        (tipo === "image/webp" && esWebp);

    if (!valido) {
        return { error: "El archivo no es una imagen válida" };
    }

    return { buffer, extension: FORMATOS_PORTADA[tipo] };
}

// Guardar la portada en assets/images y devolver el nombre del archivo
function guardarPortada(idJuego, imagen) {
    const nombre = `juego-${idJuego}-${Date.now()}.${imagen.extension}`;

    fs.writeFileSync(path.join(CARPETA_PORTADAS, nombre), imagen.buffer);

    return nombre;
}

function borrarPortada(nombre) {
    if (typeof nombre !== "string" || !NOMBRE_PORTADA_PROPIA.test(nombre)) return;

    try {
        fs.unlinkSync(path.join(CARPETA_PORTADAS, nombre));
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Error al borrar la portada:", error);
        }
    }
}

// Comprobar si ya existe otro videojuego publicado con el mismo título
function tituloEnUso(videojuegos, titulo, idExcluido = null) {
    return videojuegos.some(juego =>
        juego.estado === "publicado" &&
        juego.id !== idExcluido &&
        juego.titulo.toLowerCase() === titulo.toLowerCase()
    );
}

// Agregar el nombre del desarrollador y los DLC de un videojuego
function armarVideojuego(juego, usuarios, dlcs) {
    const desarrollador = usuarios.find(usuario =>
        usuario.id === juego.id_desarrollador
    );

    return {
        ...juego,
        desarrollador: desarrollador
            ? desarrollador.nombre_usuario
            : "Desarrollador desconocido",
        dlcs: dlcs.filter(dlc => dlc.id_videojuego === juego.id)
    };
}


function listarVideojuegos(req, res) {
    const consulta = req.query;

    const busqueda = normalizar(leerTexto(consulta.q));
    const genero = leerTexto(consulta.genero);
    const clasificacion = leerTexto(consulta.clasificacion);
    const orden = leerTexto(consulta.orden);
    const estadoPedido = leerTexto(consulta.estado);

    // Por defecto solo se muestran los videojuegos publicados
    const estado = estadoPedido === "retirado" || estadoPedido === "todos"
        ? estadoPedido
        : "publicado";

    let precioMax = null;

    if (leerTexto(consulta.precio_max)) {
        precioMax = Number(consulta.precio_max);

        if (!Number.isInteger(precioMax) || precioMax < 1) {
            return res.status(400).json({
                message: "El precio máximo debe ser un número entero mayor a 0"
            });
        }
    }

    let calificacionMin = null;

    if (leerTexto(consulta.calificacion_min)) {
        calificacionMin = Number(consulta.calificacion_min);

        if (!Number.isFinite(calificacionMin) || calificacionMin < 1 || calificacionMin > 5) {
            return res.status(400).json({
                message: "La calificación mínima debe estar entre 1 y 5"
            });
        }
    }

    let idDesarrollador = null;

    if (leerTexto(consulta.id_desarrollador)) {
        idDesarrollador = leerId(consulta.id_desarrollador);

        if (idDesarrollador === null) {
            return res.status(400).json({
                message: "El ID del desarrollador no es válido"
            });
        }
    }

    let videojuegos;
    let usuarios;
    let dlcs;

    try {
        videojuegos = leerDatos("videojuegos");
        usuarios = leerDatos("usuarios");
        dlcs = leerDatos("dlcs");
    } catch (error) {
        console.error("Error al leer videojuegos:", error);

        return res.status(500).json({
            message: "Error al consultar los videojuegos"
        });
    }

    let resultado = videojuegos.filter(juego => {
        if (estado !== "todos" && juego.estado !== estado) return false;
        if (idDesarrollador !== null && juego.id_desarrollador !== idDesarrollador) return false;
        if (genero && juego.genero !== genero) return false;
        if (clasificacion && juego.clasificacion_edad !== clasificacion) return false;
        if (precioMax !== null && juego.precio_creditos > precioMax) return false;
        if (busqueda && !normalizar(juego.titulo).includes(busqueda)) return false;
        if (calificacionMin !== null &&
            !(typeof juego.calificacion_promedio === "number" && juego.calificacion_promedio >= calificacionMin)) return false;

        return true;
    });

    const porNombre = (a, b) =>
        a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" });

    // Los juegos sin reseñas quedan al final al ordenar por calificación
    if (orden === "calificacion") {
        resultado.sort((a, b) =>
            (b.calificacion_promedio ?? -1) - (a.calificacion_promedio ?? -1) ||
            (b.total_resenas ?? 0) - (a.total_resenas ?? 0) ||
            porNombre(a, b));
    } else if (orden === "precio_asc") {
        resultado.sort((a, b) => a.precio_creditos - b.precio_creditos || porNombre(a, b));
    } else if (orden === "precio_desc") {
        resultado.sort((a, b) => b.precio_creditos - a.precio_creditos || porNombre(a, b));
    } else {
        resultado.sort(porNombre);
    }

    const respuesta = { total: resultado.length };

    // La paginación es opcional: solo se aplica si se piden "pagina" o "limite"
    if (consulta.pagina !== undefined || consulta.limite !== undefined) {
        const limite = Math.min(leerId(consulta.limite) ?? LIMITE_POR_DEFECTO, LIMITE_MAXIMO);
        const totalPaginas = Math.max(1, Math.ceil(resultado.length / limite));
        const pagina = Math.min(leerId(consulta.pagina) ?? 1, totalPaginas);

        resultado = resultado.slice((pagina - 1) * limite, pagina * limite);

        respuesta.pagina = pagina;
        respuesta.limite = limite;
        respuesta.total_paginas = totalPaginas;
    }

    respuesta.videojuegos = resultado.map(juego =>
        armarVideojuego(juego, usuarios, dlcs)
    );

    res.status(200).json(respuesta);
}


function obtenerVideojuego(req, res) {
    const id = leerId(req.params.id);

    if (id === null) {
        return res.status(400).json({
            message: "El ID del videojuego no es válido"
        });
    }

    let videojuegos;
    let usuarios;
    let dlcs;

    try {
        videojuegos = leerDatos("videojuegos");
        usuarios = leerDatos("usuarios");
        dlcs = leerDatos("dlcs");
    } catch (error) {
        console.error("Error al leer videojuegos:", error);

        return res.status(500).json({
            message: "Error al consultar los videojuegos"
        });
    }

    const juego = videojuegos.find(item => item.id === id);

    if (!juego) {
        return res.status(404).json({
            message: "Videojuego no encontrado"
        });
    }

    res.status(200).json({
        videojuego: armarVideojuego(juego, usuarios, dlcs)
    });
}


function crearVideojuego(req, res) {
    const { error, datos } = validarVideojuego(req.body);

    if (error) {
        return res.status(400).json({ message: error });
    }

    // Al publicar, la portada es obligatoria
    const portada = validarPortada(req.body.portada);

    if (portada.error) {
        return res.status(400).json({ message: portada.error });
    }

    let videojuegos;

    try {
        videojuegos = leerDatos("videojuegos");
    } catch (error) {
        console.error("Error al leer videojuegos:", error);

        return res.status(500).json({
            message: "Error al consultar los videojuegos"
        });
    }

    if (tituloEnUso(videojuegos, datos.titulo)) {
        return res.status(409).json({
            message: "Ya existe un videojuego publicado con ese título"
        });
    }

    // Generar un ID consecutivo
    const nuevoId = videojuegos.length > 0
        ? Math.max(...videojuegos.map(juego => juego.id)) + 1
        : 1;

    let nombrePortada;

    try {
        nombrePortada = guardarPortada(nuevoId, portada);
    } catch (error) {
        console.error("Error al guardar la portada:", error);

        return res.status(500).json({
            message: "Error al guardar la portada"
        });
    }

    const nuevoVideojuego = {
        id: nuevoId,
        ...datos,
        portada: nombrePortada,
        id_desarrollador: req.usuario.id,
        estado: "publicado"
    };

    videojuegos.push(nuevoVideojuego);

    try {
        guardarDatos("videojuegos", videojuegos);
    } catch (error) {
        console.error("Error al guardar el videojuego:", error);
        borrarPortada(nombrePortada);

        return res.status(500).json({
            message: "Error al publicar el videojuego"
        });
    }

    res.status(201).json({
        message: "Videojuego publicado correctamente",
        videojuego: nuevoVideojuego
    });
}


function actualizarVideojuego(req, res) {
    const id = leerId(req.params.id);

    if (id === null) {
        return res.status(400).json({
            message: "El ID del videojuego no es válido"
        });
    }

    let videojuegos;

    try {
        videojuegos = leerDatos("videojuegos");
    } catch (error) {
        console.error("Error al leer videojuegos:", error);

        return res.status(500).json({
            message: "Error al consultar los videojuegos"
        });
    }

    const juego = videojuegos.find(item => item.id === id);

    if (!juego) {
        return res.status(404).json({
            message: "Videojuego no encontrado"
        });
    }

    if (juego.id_desarrollador !== req.usuario.id) {
        return res.status(403).json({
            message: "No puedes modificar videojuegos de otro desarrollador"
        });
    }

    if (juego.estado !== "publicado") {
        return res.status(409).json({
            message: "Un videojuego retirado no se puede editar"
        });
    }

    const { error, datos } = validarVideojuego(req.body);

    if (error) {
        return res.status(400).json({ message: error });
    }

    if (tituloEnUso(videojuegos, datos.titulo, juego.id)) {
        return res.status(409).json({
            message: "Ya existe un videojuego publicado con ese título"
        });
    }

    // Al editar, la portada es opcional: solo se reemplaza si se envía una nueva
    let portadaNueva = null;
    const portadaAnterior = juego.portada;

    if (req.body.portada !== undefined && req.body.portada !== null && req.body.portada !== "") {
        const portada = validarPortada(req.body.portada);

        if (portada.error) {
            return res.status(400).json({ message: portada.error });
        }

        try {
            portadaNueva = guardarPortada(juego.id, portada);
        } catch (error) {
            console.error("Error al guardar la portada:", error);

            return res.status(500).json({
                message: "Error al guardar la portada"
            });
        }
    }

    Object.assign(juego, datos);

    if (portadaNueva) {
        juego.portada = portadaNueva;
    }

    try {
        guardarDatos("videojuegos", videojuegos);
    } catch (error) {
        console.error("Error al guardar el videojuego:", error);
        borrarPortada(portadaNueva);

        return res.status(500).json({
            message: "Error al actualizar el videojuego"
        });
    }

    // La portada anterior ya no se usa
    if (portadaNueva) {
        borrarPortada(portadaAnterior);
    }

    res.status(200).json({
        message: "Videojuego actualizado correctamente",
        videojuego: juego
    });
}


// "Eliminar" un videojuego lo retira del catálogo: deja de poder adquirirse,
// pero el registro se conserva porque sigue en las bibliotecas de los jugadores.
function retirarVideojuego(req, res) {
    const id = leerId(req.params.id);

    if (id === null) {
        return res.status(400).json({
            message: "El ID del videojuego no es válido"
        });
    }

    let videojuegos;

    try {
        videojuegos = leerDatos("videojuegos");
    } catch (error) {
        console.error("Error al leer videojuegos:", error);

        return res.status(500).json({
            message: "Error al consultar los videojuegos"
        });
    }

    const juego = videojuegos.find(item => item.id === id);

    if (!juego) {
        return res.status(404).json({
            message: "Videojuego no encontrado"
        });
    }

    if (juego.id_desarrollador !== req.usuario.id) {
        return res.status(403).json({
            message: "No puedes retirar videojuegos de otro desarrollador"
        });
    }

    if (juego.estado === "retirado") {
        return res.status(409).json({
            message: "El videojuego ya está retirado del catálogo"
        });
    }

    juego.estado = "retirado";

    try {
        guardarDatos("videojuegos", videojuegos);
    } catch (error) {
        console.error("Error al retirar el videojuego:", error);

        return res.status(500).json({
            message: "Error al retirar el videojuego"
        });
    }

    res.status(200).json({
        message: "Videojuego retirado del catálogo",
        videojuego: juego
    });
}

module.exports = {
    listarVideojuegos,
    obtenerVideojuego,
    crearVideojuego,
    actualizarVideojuego,
    retirarVideojuego
};
