const { getModel } = require("../storage");

const { leerId, mismoId } = require("../utils/mongo_utils");

const Videojuego = getModel("videojuegos");
const Usuario = getModel("usuarios");

const PORTADA_MAX_BYTES = 2 * 1024 * 1024;

const GENEROS = Videojuego.GENEROS;
const CLASIFICACIONES = Videojuego.CLASIFICACIONES;

const LIMITE_POR_DEFECTO = 12;
const LIMITE_MAXIMO = 50;

const COLACION_TITULO = { locale: "es", strength: 2 };

// ---------- Utilidades ----------

// Validar números enteros positivos para la paginación
function leerEnteroPositivo(valor) {
    const numero = Number(valor);
    return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

// Quitar acentos y mayúsculas para comparar textos
function normalizar(texto) {
    return texto
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
}

// Leer un parámetro de la URL como texto (ignora arreglos u otros tipos)
function leerTexto(valor) {
    return typeof valor === "string" ? valor.trim() : "";
}

// Convertir la búsqueda en una expresión regular que ignore acentos y mayúsculas.
// "accion" encuentra "Acción"; los caracteres especiales se escapan.
function regexSinAcentos(texto) {
    const variantes = {
        a: "[aáàäâ]", e: "[eéèëê]", i: "[iíìïî]",
        o: "[oóòöô]", u: "[uúùüû]", n: "[nñ]"
    };

    const patron = normalizar(texto)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/[aeioun]/g, letra => variantes[letra]);

    return new RegExp(patron, "i");
}

// Preparar un videojuego para enviarlo al frontend
function limpiar(documento) {
    const objeto = documento.toObject ? documento.toObject() : { ...documento };

    objeto.id = String(objeto._id);
    objeto.id_desarrollador = String(objeto.id_desarrollador);

    // Enviar una URL en lugar de toda la imagen Base64
    objeto.portada = objeto.portada ? `/api/videojuegos/${objeto.id}/portada` : null;

    objeto.dlcs = (objeto.dlcs || []).map(dlc => ({
        id: String(dlc._id),
        id_videojuego: objeto.id,
        nombre: dlc.nombre,
        tipo_contenido: dlc.tipo_contenido,
        descripcion: dlc.descripcion
    }));

    delete objeto._id;
    delete objeto.__v;

    return objeto;
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

    return {
        dataUrl: `data:${tipo};base64,${buffer.toString("base64")}`
    };
}

// Comprobar títulos publicados duplicados
async function tituloEnUso(titulo, idExcluido = null) {
    const filtro = {
        estado: "publicado",
        titulo
    };

    if (idExcluido !== null) {
        filtro._id = { $ne: idExcluido };
    }

    return Boolean(
        await Videojuego.exists(filtro).collation(COLACION_TITULO)
    );
}

// Agregar el nombre del desarrollador a los videojuegos
async function armarVideojuegos(videojuegos) {
    const desarrolladores = await Usuario.find(
        {
            _id: {
                $in: videojuegos.map(
                    juego => juego.id_desarrollador
                )
            }
        },
        "nombre_usuario"
    ).lean();

    const nombres = new Map(
        desarrolladores.map(usuario => [
            String(usuario._id),
            usuario.nombre_usuario
        ])
    );

    return videojuegos.map(juego => ({
        ...limpiar(juego),
        desarrollador: nombres.get(String(juego.id_desarrollador)) || "Desarrollador desconocido"
    }));
}

// ---------- Endpoints ----------
// GET /api/videojuegos → catálogo con búsqueda, filtros, orden y paginación
async function listarVideojuegos(req, res) {
    const consulta = req.query;

    const busqueda = leerTexto(consulta.q);
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
            return res.status(400).json({ message: "El precio máximo debe ser un número entero mayor a 0" });
        }
    }

    let calificacionMin = null;

    if (leerTexto(consulta.calificacion_min)) {
        calificacionMin = Number(consulta.calificacion_min);

        if (!Number.isFinite(calificacionMin) || calificacionMin < 1 || calificacionMin > 5) {
            return res.status(400).json({ message: "La calificación mínima debe estar entre 1 y 5" });
        }
    }

    let idDesarrollador = null;

    if (leerTexto(consulta.id_desarrollador)) {
        idDesarrollador = leerId(consulta.id_desarrollador);

        if (idDesarrollador === null) {
            return res.status(400).json({ message: "El ID del desarrollador no es válido" });
        }
    }

    // Construir el filtro de MongoDB
    const filtro = {};

    if (estado !== "todos") filtro.estado = estado;
    if (idDesarrollador !== null) filtro.id_desarrollador = idDesarrollador;
    if (genero) filtro.genero = genero;
    if (clasificacion) filtro.clasificacion_edad = clasificacion;
    if (precioMax !== null) filtro.precio_creditos = { $lte: precioMax };
    if (busqueda) filtro.titulo = regexSinAcentos(busqueda);
    // $gte deja fuera automáticamente a los juegos sin reseñas (promedio null)
    if (calificacionMin !== null) filtro.calificacion_promedio = { $gte: calificacionMin };

    // Ordenamiento (los juegos sin reseñas quedan al final al ordenar por calificación,
    // porque en MongoDB null es menor que cualquier número)
    let ordenMongo;

    if (orden === "calificacion") {
        ordenMongo = {
            calificacion_promedio: -1,
            total_resenas: -1,
            titulo: 1,
            _id: 1
        };
    } else if (orden === "precio_asc") {
        ordenMongo = {
            precio_creditos: 1,
            titulo: 1,
            _id: 1
        };
    } else if (orden === "precio_desc") {
        ordenMongo = {
            precio_creditos: -1,
            titulo: 1,
            _id: 1
        };
    } else {
        ordenMongo = {
            titulo: 1,
            _id: 1
        };
    }
    try {
        const total = await Videojuego.countDocuments(filtro);
        const respuesta = { total };

        // Orden alfabético en español: sin importar acentos ni mayúsculas
        let consultaMongo = Videojuego.find(filtro)
            .sort(ordenMongo)
            .collation({ locale: "es", strength: 1 });

        // La paginación es opcional: solo se aplica si se piden "pagina" o "limite"
        if (consulta.pagina !== undefined || consulta.limite !== undefined) {
            const limite = Math.min(leerEnteroPositivo(consulta.limite) ?? LIMITE_POR_DEFECTO, LIMITE_MAXIMO);
            const totalPaginas = Math.max(1, Math.ceil(total / limite));
            const pagina = Math.min(leerEnteroPositivo(consulta.pagina) ?? 1, totalPaginas);

            consultaMongo = consultaMongo.skip((pagina - 1) * limite).limit(limite);

            respuesta.pagina = pagina;
            respuesta.limite = limite;
            respuesta.total_paginas = totalPaginas;
        }

        const videojuegos = await consultaMongo.lean();

        respuesta.videojuegos = await armarVideojuegos(videojuegos);

        res.status(200).json(respuesta);
    } catch (error) {
        console.error("Error al consultar videojuegos:", error);
        res.status(500).json({ message: "Error al consultar los videojuegos" });
    }
}

// GET /api/videojuegos/:id → detalle de un videojuego
async function obtenerVideojuego(req, res) {
    const id = leerId(req.params.id);

    if (id === null) {
        return res.status(400).json({ message: "El ID del videojuego no es válido" });
    }

    try {
        const juego = await Videojuego.findById(id).lean();

        if (!juego) {
            return res.status(404).json({ message: "Videojuego no encontrado" });
        }

        const [videojuego] = await armarVideojuegos([juego]);

        res.status(200).json({ videojuego });
    } catch (error) {
        console.error("Error al consultar el videojuego:", error);
        res.status(500).json({ message: "Error al consultar los videojuegos" });
    }
}

async function crearVideojuego(req, res) {
    const { error, datos } = validarVideojuego(req.body);

    if (error) {
        return res.status(400).json({
            message: error
        });
    }

    const portada = validarPortada(req.body.portada);

    if (portada.error) {
        return res.status(400).json({
            message: portada.error
        });
    }

    try {
        if (await tituloEnUso(datos.titulo)) {
            return res.status(409).json({
                message: "Ya existe un videojuego publicado con ese título"
            });
        }

        const nuevoVideojuego = await Videojuego.create({
            ...datos,
            portada: portada.dataUrl,
            id_desarrollador: req.usuario.id,
            estado: "publicado"
        });

        res.status(201).json({
            message: "Videojuego publicado correctamente",
            videojuego: limpiar(nuevoVideojuego)
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Ya existe un videojuego publicado con ese título"
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message
            });
        }

        console.error("Error al publicar el videojuego:", error);

        res.status(500).json({
            message: "Error al publicar el videojuego"
        });
    }
}

async function actualizarVideojuego(req, res) {
    const id = leerId(req.params.id);

    if (!id) {
        return res.status(400).json({
            message: "El ID del videojuego no es válido"
        });
    }

    try {
        const juego = await Videojuego.findById(id);

        if (!juego) {
            return res.status(404).json({
                message: "Videojuego no encontrado"
            });
        }

        if (!mismoId(juego.id_desarrollador, req.usuario.id)) {
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
            return res.status(400).json({
                message: error
            });
        }

        if (await tituloEnUso(datos.titulo, juego._id)) {
            return res.status(409).json({
                message: "Ya existe un videojuego publicado con ese título"
            });
        }

        // Al editar, la portada sigue siendo opcional
        if (
            req.body.portada !== undefined &&
            req.body.portada !== null &&
            req.body.portada !== ""
        ) {
            const portada = validarPortada(req.body.portada);

            if (portada.error) {
                return res.status(400).json({
                    message: portada.error
                });
            }

            juego.portada = portada.dataUrl;
        }

        Object.assign(juego, datos);

        await juego.save();

        res.status(200).json({
            message: "Videojuego actualizado correctamente",
            videojuego: limpiar(juego)
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Ya existe un videojuego publicado con ese título"
            });
        }

        if (error.name === "VersionError") {
            return res.status(409).json({
                message: "El videojuego fue modificado. Intenta nuevamente"
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message
            });
        }

        console.error("Error al actualizar el videojuego:", error);

        res.status(500).json({
            message: "Error al actualizar el videojuego"
        });
    }
}

// "Eliminar" un videojuego lo retira del catálogo: deja de poder adquirirse,
// pero el registro se conserva porque sigue en las bibliotecas de los jugadores.
async function retirarVideojuego(req, res) {
    const id = leerId(req.params.id);

    if (id === null) {
        return res.status(400).json({ message: "El ID del videojuego no es válido" });
    }

    try {
        const juego = await Videojuego.findById(id);

        if (!juego) {
            return res.status(404).json({ message: "Videojuego no encontrado" });
        }

        if (!mismoId(juego.id_desarrollador, req.usuario.id)) {
            return res.status(403).json({ message: "No puedes retirar videojuegos de otro desarrollador" });
        }

        if (juego.estado === "retirado") {
            return res.status(409).json({ message: "El videojuego ya está retirado del catálogo" });
        }

        juego.estado = "retirado";
        await juego.save();

        res.status(200).json({
            message: "Videojuego retirado del catálogo",
            videojuego: limpiar(juego)
        });
    } catch (error) {
        if (error.name === "VersionError") {
            return res.status(409).json({
                message: "El videojuego fue modificado. Intenta nuevamente"
            });
        }
        console.error("Error al retirar el videojuego:", error);
        res.status(500).json({ message: "Error al retirar el videojuego" });
    }
}

// GET /api/videojuegos/:id/portada
async function obtenerPortada(req, res) {
    const id = leerId(req.params.id);

    if (!id) {
        return res.status(400).json({
            message: "Identificador de videojuego inválido"
        });
    }

    try {
        const juego = await Videojuego.findById(id).select("portada").lean();

        if (!juego || !juego.portada) {
            return res.status(404).json({
                message: "Portada no encontrada"
            });
        }

        const coincidencia = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(juego.portada);

        if (!coincidencia) {
            return res.status(404).json({
                message: "Portada no disponible"
            });
        }

        const tipo = coincidencia[1];
        const imagen = Buffer.from(coincidencia[2], "base64");

        res.set("Content-Type", tipo);
        res.set("X-Content-Type-Options", "nosniff");
        res.set("Cache-Control", "no-cache");

        res.status(200).send(imagen);

    } catch (error) {
        console.error("Error al consultar portada:", error);

        res.status(500).json({
            message: "Error al consultar la portada"
        });
    }
}

module.exports = {
    listarVideojuegos,
    obtenerVideojuego,
    crearVideojuego,
    actualizarVideojuego,
    retirarVideojuego,
    obtenerPortada
};
