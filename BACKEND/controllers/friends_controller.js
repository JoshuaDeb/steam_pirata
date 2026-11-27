const Usuario = require("../models/usuario");
const Amistad = require("../models/amistad");
const Videojuego = require("../models/videojuego");
const { siguienteId } = require("../models/contador");

const POR_PAGINA = 10;


// ---------- Utilidades ----------

// Escapar caracteres especiales para usar un texto dentro de una expresión regular
function escaparRegex(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Filtro de MongoDB para encontrar la relación entre dos jugadores (en cualquier dirección)
function filtroRelacion(idA, idB) {
    return {
        $or: [
            { solicitante_id: idA, receptor_id: idB },
            { solicitante_id: idB, receptor_id: idA }
        ]
    };
}

// Buscar los videojuegos destacados de varios jugadores en una sola consulta
async function cargarJuegosDestacados(jugadores) {
    const ids = jugadores.flatMap(jugador => jugador.favoritos_perfil || []).filter(id => id !== null);

    return Videojuego.find({ id: { $in: ids } }, "id titulo portada").lean();
}

// Videojuegos destacados en el perfil público de un jugador.
// Siempre devuelve 3 posiciones: { id, titulo, portada } o null si está vacía.
function obtenerFavoritosPerfil(jugador, videojuegos) {
    const ids = Array.isArray(jugador.favoritos_perfil) ? jugador.favoritos_perfil : [];

    return [0, 1, 2].map(posicion => {
        const juego = videojuegos.find(item => item.id === ids[posicion]);

        return juego
            ? { id: juego.id, titulo: juego.titulo, portada: juego.portada || "" }
            : null;
    });
}

// Datos públicos de un jugador para las listas de amistades
function jugadorPublico(jugador, videojuegos) {
    return {
        id: jugador.id,
        nombre_usuario: jugador.nombre_usuario,
        descripcion_publica: jugador.descripcion_publica || "",
        foto_perfil: jugador.foto_perfil || null,
        favoritos_perfil: obtenerFavoritosPerfil(jugador, videojuegos)
    };
}

// Quitar campos internos de MongoDB antes de responder
function limpiar(documento) {
    const objeto = documento.toObject ? documento.toObject() : { ...documento };

    delete objeto._id;
    delete objeto.__v;

    return objeto;
}


// ---------- Endpoints ----------

// GET /api/friends/search → buscar jugadores para agregar
async function buscarJugadores(req, res) {
    const usuarioId = req.usuario.id;
    const busqueda = typeof req.query.busqueda === "string" ? req.query.busqueda.trim() : "";
    const pagina = Number(req.query.pagina || 1);
    const orden = req.query.orden || "az";

    if (busqueda.length > 50) {
        return res.status(400).json({ message: "La búsqueda no puede superar 50 caracteres" });
    }

    if (!Number.isSafeInteger(pagina) || pagina < 1) {
        return res.status(400).json({ message: "Número de página inválido" });
    }

    if (orden !== "az" && orden !== "reciente") {
        return res.status(400).json({ message: "Ordenamiento inválido" });
    }

    try {
        // Jugadores registrados, excepto el usuario actual
        const filtro = { role: "jugador", id: { $ne: usuarioId } };

        if (busqueda) {
            filtro.nombre_usuario = new RegExp(escaparRegex(busqueda), "i");
        }

        const totalResultados = await Usuario.countDocuments(filtro);
        const totalPaginas = Math.max(1, Math.ceil(totalResultados / POR_PAGINA));

        const encontrados = await Usuario.find(filtro)
            .sort(orden === "reciente" ? { id: -1 } : { nombre_usuario: 1 })
            .collation({ locale: "es" })
            .skip((pagina - 1) * POR_PAGINA)
            .limit(POR_PAGINA)
            .lean();

        // Relaciones entre el usuario actual y los jugadores de esta página
        const idsPagina = encontrados.map(jugador => jugador.id);

        const relaciones = await Amistad.find({
            $or: [
                { solicitante_id: usuarioId, receptor_id: { $in: idsPagina } },
                { receptor_id: usuarioId, solicitante_id: { $in: idsPagina } }
            ]
        }).lean();

        const videojuegos = await cargarJuegosDestacados(encontrados);

        const jugadores = encontrados.map(jugador => {
            const relacion = relaciones.find(amistad =>
                amistad.solicitante_id === jugador.id || amistad.receptor_id === jugador.id
            );

            let estadoRelacion = "ninguna";

            if (relacion && relacion.estado === "aceptada") {
                estadoRelacion = "amigos";
            } else if (relacion && relacion.estado === "pendiente") {
                estadoRelacion = relacion.solicitante_id === usuarioId
                    ? "pendiente_enviada"
                    : "pendiente_recibida";
            }

            return {
                ...jugadorPublico(jugador, videojuegos),
                estado_relacion: estadoRelacion
            };
        });

        res.status(200).json({
            jugadores,
            paginacion: {
                paginaActual: pagina,
                porPagina: POR_PAGINA,
                totalResultados,
                totalPaginas
            }
        });
    } catch (error) {
        console.error("Error al buscar jugadores:", error);
        res.status(500).json({ message: "Error al consultar jugadores" });
    }
}

// POST /api/friends/request → enviar solicitud de amistad
async function enviarSolicitud(req, res) {
    const solicitanteId = req.usuario.id;
    const receptorId = Number((req.body || {}).receptor_id);

    if (!Number.isSafeInteger(receptorId) || receptorId <= 0) {
        return res.status(400).json({ message: "Identificadores de usuario inválidos" });
    }

    if (solicitanteId === receptorId) {
        return res.status(400).json({ message: "No puedes enviarte una solicitud a ti mismo" });
    }

    try {
        const receptor = await Usuario.findOne({ id: receptorId }).lean();

        if (!receptor) {
            return res.status(404).json({ message: "Uno de los usuarios no existe" });
        }

        // El solicitante ya es jugador (lo revisa requerirJugador en la ruta)
        if (receptor.role !== "jugador") {
            return res.status(403).json({ message: "Las amistades solo están disponibles para jugadores" });
        }

        if (await Amistad.exists(filtroRelacion(solicitanteId, receptorId))) {
            return res.status(409).json({ message: "Ya existe una solicitud o amistad entre estos usuarios" });
        }

        const nuevaSolicitud = await Amistad.create({
            id: await siguienteId("amistades"),
            solicitante_id: solicitanteId,
            receptor_id: receptorId,
            estado: "pendiente",
            fecha_creacion: new Date()
        });

        res.status(201).json({
            message: "Solicitud de amistad enviada correctamente",
            solicitud: limpiar(nuevaSolicitud)
        });
    } catch (error) {
        console.error("Error al enviar solicitud:", error);
        res.status(500).json({ message: "Error al enviar la solicitud de amistad" });
    }
}

// GET /api/friends/requests → solicitudes recibidas y enviadas
async function listarSolicitudes(req, res) {
    const usuarioId = req.usuario.id;

    try {
        const pendientes = await Amistad.find({
            estado: "pendiente",
            $or: [{ receptor_id: usuarioId }, { solicitante_id: usuarioId }]
        }).sort({ id: -1 }).lean();

        // Datos de los otros jugadores (solo los que siguen existiendo)
        const otrosIds = pendientes.map(amistad =>
            amistad.receptor_id === usuarioId ? amistad.solicitante_id : amistad.receptor_id
        );

        const otros = await Usuario.find({ id: { $in: otrosIds }, role: "jugador" }).lean();
        const videojuegos = await cargarJuegosDestacados(otros);

        function armar(tipo) {
            return pendientes
                .filter(amistad => tipo === "recibidas"
                    ? amistad.receptor_id === usuarioId
                    : amistad.solicitante_id === usuarioId)
                .map(amistad => {
                    const otroId = tipo === "recibidas" ? amistad.solicitante_id : amistad.receptor_id;
                    const otroJugador = otros.find(usuario => usuario.id === otroId);

                    // Evitar mostrar referencias a cuentas eliminadas
                    if (!otroJugador) return null;

                    return {
                        id: amistad.id,
                        fecha_creacion: amistad.fecha_creacion,
                        jugador: jugadorPublico(otroJugador, videojuegos)
                    };
                })
                .filter(solicitud => solicitud !== null);
        }

        res.status(200).json({
            recibidas: armar("recibidas"),
            enviadas: armar("enviadas")
        });
    } catch (error) {
        console.error("Error al consultar solicitudes:", error);
        res.status(500).json({ message: "Error al consultar solicitudes de amistad" });
    }
}

// PATCH /api/friends/request/:id/accept → aceptar una solicitud recibida
async function aceptarSolicitud(req, res) {
    const solicitudId = Number(req.params.id);
    const receptorId = req.usuario.id;

    if (!Number.isSafeInteger(solicitudId) || solicitudId <= 0) {
        return res.status(400).json({ message: "Identificadores inválidos" });
    }

    try {
        const solicitud = await Amistad.findOne({ id: solicitudId });

        if (!solicitud) {
            return res.status(404).json({ message: "Solicitud de amistad no encontrada" });
        }

        // Comprobar que quien acepta sea el receptor
        if (solicitud.receptor_id !== receptorId) {
            return res.status(403).json({ message: "No puedes aceptar esta solicitud" });
        }

        if (solicitud.estado !== "pendiente") {
            return res.status(409).json({ message: "La solicitud ya no está pendiente" });
        }

        // Verificar que el solicitante siga existiendo y sea jugador
        if (!(await Usuario.exists({ id: solicitud.solicitante_id, role: "jugador" }))) {
            return res.status(404).json({ message: "Uno de los jugadores ya no está disponible" });
        }

        solicitud.estado = "aceptada";
        solicitud.fecha_aceptacion = new Date();
        await solicitud.save();

        res.status(200).json({
            message: "Solicitud de amistad aceptada correctamente",
            amistad: limpiar(solicitud)
        });
    } catch (error) {
        console.error("Error al aceptar solicitud:", error);
        res.status(500).json({ message: "Error al aceptar la solicitud de amistad" });
    }
}

// DELETE /api/friends/request/:id → cancelar (si la envié) o rechazar (si la recibí)
async function eliminarSolicitud(req, res) {
    const solicitudId = Number(req.params.id);
    const usuarioId = req.usuario.id;

    if (!Number.isSafeInteger(solicitudId) || solicitudId <= 0) {
        return res.status(400).json({ message: "Identificadores inválidos" });
    }

    try {
        const solicitud = await Amistad.findOne({ id: solicitudId }).lean();

        if (!solicitud) {
            return res.status(404).json({ message: "Solicitud no encontrada" });
        }

        if (solicitud.estado !== "pendiente") {
            return res.status(409).json({ message: "La solicitud ya no está pendiente" });
        }

        const esSolicitante = solicitud.solicitante_id === usuarioId;
        const esReceptor = solicitud.receptor_id === usuarioId;

        if (!esSolicitante && !esReceptor) {
            return res.status(403).json({ message: "No puedes modificar esta solicitud" });
        }

        await Amistad.deleteOne({ id: solicitudId });

        res.status(200).json({
            message: esSolicitante ? "Solicitud cancelada correctamente" : "Solicitud rechazada correctamente"
        });
    } catch (error) {
        console.error("Error al eliminar solicitud:", error);
        res.status(500).json({ message: "Error al eliminar la solicitud" });
    }
}

// GET /api/friends/friends → lista de amigos con búsqueda, orden y paginación
async function listarAmigos(req, res) {
    const usuarioId = req.usuario.id;
    const pagina = Number(req.query.pagina || 1);
    const orden = req.query.orden || "nombre";
    const busqueda = typeof req.query.busqueda === "string" ? req.query.busqueda.trim().toLowerCase() : "";

    if (
        !Number.isSafeInteger(pagina) || pagina < 1 ||
        busqueda.length > 50 ||
        !["nombre", "reciente"].includes(orden)
    ) {
        return res.status(400).json({ message: "Parámetros de búsqueda inválidos" });
    }

    try {
        // Amistades aceptadas en cualquier dirección
        const aceptadas = await Amistad.find({
            estado: "aceptada",
            $or: [{ solicitante_id: usuarioId }, { receptor_id: usuarioId }]
        }).lean();

        const otrosIds = aceptadas.map(amistad =>
            amistad.solicitante_id === usuarioId ? amistad.receptor_id : amistad.solicitante_id
        );

        const otros = await Usuario.find({ id: { $in: otrosIds }, role: "jugador" }).lean();
        const videojuegos = await cargarJuegosDestacados(otros);

        const relaciones = aceptadas
            .map(amistad => {
                const otroId = amistad.solicitante_id === usuarioId ? amistad.receptor_id : amistad.solicitante_id;
                const otroJugador = otros.find(usuario => usuario.id === otroId);

                if (!otroJugador) return null;

                return {
                    id: amistad.id,
                    fecha_aceptacion: amistad.fecha_aceptacion,
                    jugador: jugadorPublico(otroJugador, videojuegos)
                };
            })
            .filter(amistad => amistad !== null);

        const totalAmigos = relaciones.length;

        // Buscar por nombre
        const amigosFiltrados = relaciones.filter(amistad =>
            amistad.jugador.nombre_usuario.toLowerCase().includes(busqueda)
        );

        // Ordenar antes de paginar
        if (orden === "reciente") {
            amigosFiltrados.sort((a, b) =>
                new Date(b.fecha_aceptacion).getTime() - new Date(a.fecha_aceptacion).getTime()
            );
        } else {
            amigosFiltrados.sort((a, b) =>
                a.jugador.nombre_usuario.localeCompare(b.jugador.nombre_usuario)
            );
        }

        const totalResultados = amigosFiltrados.length;
        const totalPaginas = Math.max(1, Math.ceil(totalResultados / POR_PAGINA));
        const inicio = (pagina - 1) * POR_PAGINA;

        res.status(200).json({
            amigos: amigosFiltrados.slice(inicio, inicio + POR_PAGINA),
            totalAmigos,
            paginacion: {
                paginaActual: pagina,
                porPagina: POR_PAGINA,
                totalResultados,
                totalPaginas
            }
        });
    } catch (error) {
        console.error("Error al consultar amigos:", error);
        res.status(500).json({ message: "Error al consultar las amistades" });
    }
}

// DELETE /api/friends/friend/:id → eliminar una amistad aceptada
async function eliminarAmistad(req, res) {
    const amistadId = Number(req.params.id);
    const usuarioId = req.usuario.id;

    if (!Number.isSafeInteger(amistadId) || amistadId <= 0) {
        return res.status(400).json({ message: "Identificadores inválidos" });
    }

    try {
        const amistad = await Amistad.findOne({ id: amistadId }).lean();

        if (!amistad) {
            return res.status(404).json({ message: "Amistad no encontrada" });
        }

        if (amistad.estado !== "aceptada") {
            return res.status(409).json({ message: "La relación no es una amistad aceptada" });
        }

        if (amistad.solicitante_id !== usuarioId && amistad.receptor_id !== usuarioId) {
            return res.status(403).json({ message: "No puedes eliminar esta amistad" });
        }

        await Amistad.deleteOne({ id: amistadId });

        res.status(200).json({ message: "Amistad eliminada correctamente" });
    } catch (error) {
        console.error("Error al eliminar amistad:", error);
        res.status(500).json({ message: "Error al eliminar la amistad" });
    }
}

module.exports = { buscarJugadores, enviarSolicitud, listarSolicitudes, aceptarSolicitud, eliminarSolicitud, listarAmigos, eliminarAmistad };