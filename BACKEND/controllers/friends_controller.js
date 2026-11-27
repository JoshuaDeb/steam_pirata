const { getModel } = require("../storage");

const { leerId, mismoId, escaparRegex } = require("../utils/mongo_utils");

const Usuario = getModel("usuarios");
const Jugador = getModel("jugadores");
const Amistad = getModel("amistades");
const Videojuego = getModel("videojuegos");

const POR_PAGINA = 10;


// ---------- Utilidades ----------
// Encontrar una relación en cualquier dirección
function filtroRelacion(idA, idB) {
    return {
        $or: [
            { solicitante_id: idA, receptor_id: idB },
            { solicitante_id: idB, receptor_id: idA }
        ]
    };
}


// Consultar los videojuegos destacados de varios jugadores
async function cargarJuegosDestacados(jugadores) {
    const ids = jugadores
        .flatMap(jugador =>
            jugador.atributos?.favoritos_perfil || []
        )
        .filter(id => id !== null);

    return Videojuego.find(
        { _id: { $in: ids } },
        "titulo portada"
    ).lean();
}


// Obtener los tres videojuegos destacados
function obtenerFavoritosPerfil(jugador, videojuegos) {
    const ids = jugador.atributos?.favoritos_perfil || [];

    return [0, 1, 2].map(posicion => {
        const juego = videojuegos.find(item => mismoId(item._id, ids[posicion]));

        return juego
            ? {
                id: String(juego._id),
                titulo: juego.titulo,
                portada: juego.portada ? `/api/videojuegos/${juego._id}/portada` : ""
            }
            : null;
    });
}


// Preparar los datos públicos de un jugador
function jugadorPublico(jugador, videojuegos) {
    return {
        id: String(jugador._id),
        nombre_usuario: jugador.nombre_usuario,
        descripcion_publica: jugador.descripcion_publica || "",
        foto_perfil: jugador.foto_perfil || null,

        favoritos_perfil: obtenerFavoritosPerfil(
            jugador,
            videojuegos
        )
    };
}


// Consultar exclusivamente los campos públicos
function consultarJugadores(filtro) {
    return Jugador.find(filtro).select(
        "nombre_usuario descripcion_publica foto_perfil atributos.favoritos_perfil"
    );
}


// Preparar una amistad para enviarla al frontend
function limpiar(amistad) {
    return {
        id: String(amistad._id),
        solicitante_id: String(amistad.solicitante_id),
        receptor_id: String(amistad.receptor_id),
        estado: amistad.estado,
        fecha_creacion: amistad.fecha_creacion,
        fecha_aceptacion: amistad.fecha_aceptacion
    };
}


// ---------- Endpoints ----------
// GET /api/friends/search
async function buscarJugadores(req, res) {
    const usuarioId = req.usuario.id;
    const busqueda = typeof req.query.busqueda === "string" ? req.query.busqueda.trim() : "";

    const pagina = Number(req.query.pagina || 1);
    const orden = req.query.orden || "az";

    if (busqueda.length > 50) {
        return res.status(400).json({
            message: "La búsqueda no puede superar 50 caracteres"
        });
    }

    if (!Number.isSafeInteger(pagina) || pagina < 1) {
        return res.status(400).json({
            message: "Número de página inválido"
        });
    }

    if (!["az", "reciente"].includes(orden)) {
        return res.status(400).json({
            message: "Ordenamiento inválido"
        });
    }

    try {
        // Excluir al usuario autenticado
        const filtro = {
            _id: { $ne: usuarioId }
        };

        if (busqueda) {
            filtro.nombre_usuario = new RegExp(
                escaparRegex(busqueda),
                "i"
            );
        }

        const totalResultados = await Jugador.countDocuments(filtro);

        const totalPaginas = Math.max(1, Math.ceil(totalResultados / POR_PAGINA));

        const encontrados = await consultarJugadores(filtro)
            .sort(orden === "reciente" ? { createdAt: -1, _id: -1 } : { nombre_usuario: 1, _id: 1 })
            .collation({ locale: "es" })
            .skip((pagina - 1) * POR_PAGINA)
            .limit(POR_PAGINA)
            .lean();

        const idsPagina = encontrados.map(
            jugador => jugador._id
        );

        // Consultar relaciones de los jugadores encontrados
        const relaciones = await Amistad.find({
            $or: [
                {
                    solicitante_id: usuarioId,
                    receptor_id: { $in: idsPagina }
                },
                {
                    receptor_id: usuarioId,
                    solicitante_id: { $in: idsPagina }
                }
            ]
        }).lean();

        const videojuegos =
            await cargarJuegosDestacados(encontrados);

        const jugadores = encontrados.map(jugador => {

            const relacion = relaciones.find(amistad =>
                mismoId(amistad.solicitante_id, jugador._id) ||
                mismoId(amistad.receptor_id, jugador._id)
            );

            let estadoRelacion = "ninguna";

            if (relacion?.estado === "aceptada") {
                estadoRelacion = "amigos";

            } else if (relacion?.estado === "pendiente") {
                estadoRelacion = mismoId(relacion.solicitante_id,usuarioId) ? "pendiente_enviada" : "pendiente_recibida";
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

        res.status(500).json({
            message: "Error al consultar jugadores"
        });
    }
}

// POST /api/friends/request
async function enviarSolicitud(req, res) {
    const solicitanteId = req.usuario.id;
    const receptorId = leerId(req.body?.receptor_id);

    if (!receptorId) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    if (mismoId(solicitanteId, receptorId)) {
        return res.status(400).json({
            message: "No puedes enviarte una solicitud a ti mismo"
        });
    }

    try {
        const receptor = await Usuario.findById(receptorId).select("role").lean();

        if (!receptor) {
            return res.status(404).json({
                message: "Uno de los usuarios no existe"
            });
        }

        if (receptor.role !== "jugador") {
            return res.status(403).json({
                message: "Las amistades solo están disponibles para jugadores"
            });
        }

        const existente = await Amistad.exists(filtroRelacion(solicitanteId, receptorId));

        if (existente) {
            return res.status(409).json({
                message: "Ya existe una solicitud o amistad entre estos usuarios"
            });
        }

        // El esquema genera _id y clave_pareja
        const nuevaSolicitud = await Amistad.create({
            solicitante_id: solicitanteId,
            receptor_id: receptorId,
            estado: "pendiente"
        });

        res.status(201).json({
            message: "Solicitud de amistad enviada correctamente",
            solicitud: limpiar(nuevaSolicitud)
        });

    } catch (error) {

        // El índice único protege contra solicitudes simultáneas
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Ya existe una solicitud o amistad entre estos usuarios"
            });
        }

        console.error("Error al enviar solicitud:", error);

        res.status(500).json({
            message: "Error al enviar la solicitud de amistad"
        });
    }
}

// GET /api/friends/requests
async function listarSolicitudes(req, res) {
    const usuarioId = req.usuario.id;

    try {
        const pendientes = await Amistad.find({
            estado: "pendiente",

            $or: [
                { receptor_id: usuarioId },
                { solicitante_id: usuarioId }
            ]

        }).sort({
            fecha_creacion: -1,
            _id: -1
        }).lean();

        // Obtener los identificadores de los otros jugadores
        const otrosIds = pendientes.map(amistad => mismoId(amistad.receptor_id, usuarioId) ? amistad.solicitante_id : amistad.receptor_id);

        const otros = await consultarJugadores({
            _id: { $in: otrosIds }
        }).lean();

        const videojuegos = await cargarJuegosDestacados(otros);

        function armar(tipo) {
            return pendientes

                .filter(amistad => tipo === "recibidas" ? mismoId(amistad.receptor_id, usuarioId) : mismoId(amistad.solicitante_id, usuarioId))

                .map(amistad => {
                    const otroId = tipo === "recibidas" ? amistad.solicitante_id : amistad.receptor_id;
                    const otroJugador = otros.find(usuario =>
                        mismoId(usuario._id, otroId)
                    );

                    // Ignorar cuentas que ya no existen
                    if (!otroJugador) return null;

                    return {
                        id: String(amistad._id),
                        fecha_creacion: amistad.fecha_creacion,

                        jugador: jugadorPublico(
                            otroJugador,
                            videojuegos
                        )
                    };
                })
                .filter(Boolean);
        }

        res.status(200).json({
            recibidas: armar("recibidas"),
            enviadas: armar("enviadas")
        });

    } catch (error) {
        console.error("Error al consultar solicitudes:", error);

        res.status(500).json({
            message: "Error al consultar solicitudes de amistad"
        });
    }
}

// PATCH /api/friends/request/:id/accept
async function aceptarSolicitud(req, res) {
    const solicitudId = leerId(req.params.id);
    const receptorId = req.usuario.id;

    if (!solicitudId) {
        return res.status(400).json({
            message: "Identificador inválido"
        });
    }

    try {
        const solicitud = await Amistad.findById(solicitudId).lean();

        if (!solicitud) {
            return res.status(404).json({
                message: "Solicitud de amistad no encontrada"
            });
        }

        if (!mismoId(solicitud.receptor_id, receptorId)) {
            return res.status(403).json({
                message: "No puedes aceptar esta solicitud"
            });
        }

        if (solicitud.estado !== "pendiente") {
            return res.status(409).json({
                message: "La solicitud ya no está pendiente"
            });
        }

        const solicitanteExiste = await Jugador.exists({
            _id: solicitud.solicitante_id
        });

        if (!solicitanteExiste) {
            return res.status(404).json({
                message: "Uno de los jugadores ya no está disponible"
            });
        }

        // Actualizar únicamente si sigue pendiente
        const amistad = await Amistad.findOneAndUpdate(
            {
                _id: solicitudId,
                receptor_id: receptorId,
                estado: "pendiente"
            },
            {
                $set: {
                    estado: "aceptada",
                    fecha_aceptacion: new Date()
                },
                $inc: { __v: 1 }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!amistad) {
            return res.status(409).json({
                message: "La solicitud ya no está disponible"
            });
        }

        res.status(200).json({
            message: "Solicitud de amistad aceptada correctamente",
            amistad: limpiar(amistad)
        });

    } catch (error) {
        console.error("Error al aceptar solicitud:", error);

        res.status(500).json({
            message: "Error al aceptar la solicitud de amistad"
        });
    }
}

// DELETE /api/friends/request/:id
async function eliminarSolicitud(req, res) {
    const solicitudId = leerId(req.params.id);
    const usuarioId = req.usuario.id;

    if (!solicitudId) {
        return res.status(400).json({
            message: "Identificador inválido"
        });
    }

    try {
        const solicitud = await Amistad.findById(solicitudId).lean();

        if (!solicitud) {
            return res.status(404).json({
                message: "Solicitud no encontrada"
            });
        }

        const esSolicitante = mismoId(solicitud.solicitante_id, usuarioId);
        const esReceptor = mismoId(solicitud.receptor_id, usuarioId);

        if (!esSolicitante && !esReceptor) {
            return res.status(403).json({
                message: "No puedes modificar esta solicitud"
            });
        }

        if (solicitud.estado !== "pendiente") {
            return res.status(409).json({
                message: "La solicitud ya no está pendiente"
            });
        }

        const resultado = await Amistad.deleteOne({
            _id: solicitudId,
            estado: "pendiente",

            $or: [
                { solicitante_id: usuarioId },
                { receptor_id: usuarioId }
            ]
        });

        if (resultado.deletedCount !== 1) {
            return res.status(409).json({
                message: "La solicitud ya no está disponible"
            });
        }

        res.status(200).json({
            message: esSolicitante ? "Solicitud cancelada correctamente" : "Solicitud rechazada correctamente"
        });

    } catch (error) {
        console.error("Error al eliminar solicitud:", error);

        res.status(500).json({
            message: "Error al eliminar la solicitud"
        });
    }
}

// GET /api/friends/friends
async function listarAmigos(req, res) {
    const usuarioId = req.usuario.id;
    const pagina = Number(req.query.pagina || 1);
    const orden = req.query.orden || "nombre";
    const busqueda = typeof req.query.busqueda === "string" ? req.query.busqueda.trim().toLowerCase() : "";

    if (!Number.isSafeInteger(pagina) || pagina < 1 || busqueda.length > 50 ||!["nombre", "reciente"].includes(orden)) {
        return res.status(400).json({
            message: "Parámetros de búsqueda inválidos"
        });
    }

    try {
        const aceptadas = await Amistad.find({
            estado: "aceptada",

            $or: [
                { solicitante_id: usuarioId },
                { receptor_id: usuarioId }
            ]
        }).lean();

        const otrosIds = aceptadas.map(amistad => mismoId(amistad.solicitante_id, usuarioId) ? amistad.receptor_id : amistad.solicitante_id);

        const otros = await consultarJugadores({
            _id: { $in: otrosIds }
        }).lean();

        const videojuegos =
            await cargarJuegosDestacados(otros);

        const relaciones = aceptadas.map(amistad => {
            const otroId = mismoId(amistad.solicitante_id,usuarioId) ? amistad.receptor_id : amistad.solicitante_id;
            const otroJugador = otros.find(usuario => mismoId(usuario._id, otroId));

            if (!otroJugador) return null;

            return {
                id: String(amistad._id),
                fecha_aceptacion: amistad.fecha_aceptacion,
                jugador: jugadorPublico(otroJugador, videojuegos)
            };

        }).filter(Boolean);

        const totalAmigos = relaciones.length;

        // Buscar por nombre
        const amigosFiltrados = relaciones.filter(amistad =>
            amistad.jugador.nombre_usuario.toLowerCase().includes(busqueda)
        );

        // Ordenar antes de paginar
        if (orden === "reciente") {
            amigosFiltrados.sort((a, b) => new Date(b.fecha_aceptacion).getTime() - new Date(a.fecha_aceptacion).getTime());

        } else {
            amigosFiltrados.sort((a, b) => a.jugador.nombre_usuario.localeCompare(b.jugador.nombre_usuario, "es"));
        }

        const totalResultados = amigosFiltrados.length;

        const totalPaginas = Math.max(1, Math.ceil(totalResultados / POR_PAGINA));

        const inicio = (pagina - 1) * POR_PAGINA;

        res.status(200).json({
            amigos: amigosFiltrados.slice(
                inicio,
                inicio + POR_PAGINA
            ),

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

        res.status(500).json({
            message: "Error al consultar las amistades"
        });
    }
}

// DELETE /api/friends/friend/:id
async function eliminarAmistad(req, res) {
    const amistadId = leerId(req.params.id);
    const usuarioId = req.usuario.id;

    if (!amistadId) {
        return res.status(400).json({
            message: "Identificador inválido"
        });
    }

    try {
        const amistad = await Amistad.findById(amistadId).lean();

        if (!amistad) {
            return res.status(404).json({
                message: "Amistad no encontrada"
            });
        }

        if (
            !mismoId(amistad.solicitante_id, usuarioId) &&
            !mismoId(amistad.receptor_id, usuarioId)
        ) {
            return res.status(403).json({
                message: "No puedes eliminar esta amistad"
            });
        }

        if (amistad.estado !== "aceptada") {
            return res.status(409).json({
                message: "La relación no es una amistad aceptada"
            });
        }

        const resultado = await Amistad.deleteOne({
            _id: amistadId,
            estado: "aceptada",

            $or: [
                { solicitante_id: usuarioId },
                { receptor_id: usuarioId }
            ]
        });

        if (resultado.deletedCount !== 1) {
            return res.status(409).json({
                message: "La amistad ya no está disponible"
            });
        }

        res.status(200).json({
            message: "Amistad eliminada correctamente"
        });

    } catch (error) {
        console.error("Error al eliminar amistad:", error);

        res.status(500).json({
            message: "Error al eliminar la amistad"
        });
    }
}

module.exports = {
    buscarJugadores,
    enviarSolicitud,
    listarSolicitudes,
    aceptarSolicitud,
    eliminarSolicitud,
    listarAmigos,
    eliminarAmistad
};