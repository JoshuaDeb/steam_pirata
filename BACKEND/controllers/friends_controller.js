const { leerDatos, guardarDatos } = require("../storage");

// Videojuegos destacados en el perfil público de un jugador.
// Siempre devuelve 3 posiciones: { id, titulo, portada } o null si está vacía.
function obtenerFavoritosPerfil(jugador, videojuegos) {
    const ids = Array.isArray(jugador.favoritos_perfil) ? jugador.favoritos_perfil : [];

    return [0, 1, 2].map(posicion => {
        const juego = Array.isArray(videojuegos)
            ? videojuegos.find(item => item.id === ids[posicion])
            : null;

        return juego
            ? { id: juego.id, titulo: juego.titulo, portada: juego.portada || "" }
            : null;
    });
}

function buscarJugadores(req, res) {
    const usuarioId = Number(req.query.usuario_id);

    const busqueda = typeof req.query.busqueda === "string" ? req.query.busqueda.trim().toLowerCase() : "";

    // Parámetros de paginación y ordenamiento
    const pagina = Number(req.query.pagina || 1);
    const porPagina = 10;
    const orden = req.query.orden || "az";

    // Validar identificador
    if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    // Validar búsqueda
    if (busqueda.length > 50) {
        return res.status(400).json({
            message: "La búsqueda no puede superar 50 caracteres"
        });
    }

    // Validar página
    if (!Number.isSafeInteger(pagina) || pagina < 1) {
        return res.status(400).json({
            message: "Número de página inválido"
        });
    }

    // Validar ordenamiento
    if (orden !== "az" && orden !== "reciente") {
        return res.status(400).json({
            message: "Ordenamiento inválido"
        });
    }

    try {
        const usuarios = leerDatos("usuarios");
        const amistades = leerDatos("amistades");
        const videojuegos = leerDatos("videojuegos");

        if (!Array.isArray(usuarios) || !Array.isArray(amistades)) {
            throw new Error("Estructura inválida de usuarios");
        }

        // Comprobar que el usuario actual sea jugador
        const usuarioActual = usuarios.find(
            usuario => usuario.id === usuarioId
        );

        if (!usuarioActual) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        if (usuarioActual.role !== "jugador") {
            return res.status(403).json({
                message: "Solo los jugadores pueden gestionar amistades"
            });
        }

        // Filtrar jugadores registrados
        const jugadoresFiltrados = usuarios
            .filter(usuario =>
                usuario.role === "jugador" &&
                usuario.id !== usuarioId &&
                typeof usuario.nombre_usuario === "string" &&
                usuario.nombre_usuario.toLowerCase().includes(busqueda)
            )
            .map(usuario => {
                // Buscar si existe una relación entre ambos jugadores
                const relacion = amistades.find(amistad =>
                    (
                        amistad.solicitante_id === usuarioId &&
                        amistad.receptor_id === usuario.id
                    ) ||
                    (
                        amistad.solicitante_id === usuario.id &&
                        amistad.receptor_id === usuarioId
                    )
                );

                let estadoRelacion = "ninguna";

                if (relacion) {
                    if (relacion.estado === "aceptada") {
                        estadoRelacion = "amigos";
                    } else if (relacion.estado === "pendiente") {
                        if (relacion.solicitante_id === usuarioId) {
                            estadoRelacion = "pendiente_enviada";
                        } else {
                            estadoRelacion = "pendiente_recibida";
                        }
                    }
                }

                return {
                    id: usuario.id,
                    nombre_usuario: usuario.nombre_usuario,
                    descripcion_publica: usuario.descripcion_publica || "",
                    favoritos_perfil: obtenerFavoritosPerfil(usuario, videojuegos),
                    estado_relacion: estadoRelacion
                };
            });

        // Ordenar todos los resultados antes de paginar
        if (orden === "reciente") {
            jugadoresFiltrados.sort((a, b) => b.id - a.id);
        } else {
            jugadoresFiltrados.sort((a, b) => a.nombre_usuario.localeCompare(b.nombre_usuario));
        }

        // Calcular paginación
        const totalResultados = jugadoresFiltrados.length;
        const totalPaginas = Math.max(1, Math.ceil(totalResultados / porPagina));

        const inicio = (pagina - 1) * porPagina;
        const fin = inicio + porPagina;

        // Obtener solamente los jugadores de la página
        const jugadores = jugadoresFiltrados.slice(inicio, fin);

        return res.status(200).json({
            jugadores: jugadores,
            paginacion: {
                paginaActual: pagina,
                porPagina: porPagina,
                totalResultados: totalResultados,
                totalPaginas: totalPaginas
            }
        });

    } catch (error) {
        console.error("Error al buscar jugadores:", error);

        return res.status(500).json({
            message: "Error al consultar jugadores"
        });
    }
}

function enviarSolicitud(req, res) {
    const { solicitante_id, receptor_id } = req.body || {};

    const solicitanteId = Number(solicitante_id);
    const receptorId = Number(receptor_id);

    // Validar identificadores
    if (
        !Number.isSafeInteger(solicitanteId) ||
        !Number.isSafeInteger(receptorId) ||
        solicitanteId <= 0 ||
        receptorId <= 0
    ) {
        return res.status(400).json({
            message: "Identificadores de usuario inválidos"
        });
    }

    // Evitar solicitudes a uno mismo
    if (solicitanteId === receptorId) {
        return res.status(400).json({
            message: "No puedes enviarte una solicitud a ti mismo"
        });
    }

    try {
        const usuarios = leerDatos("usuarios");
        const amistades = leerDatos("amistades");
        const contadores = leerDatos("contadores");

        // Validar las estructuras
        if (!Array.isArray(usuarios) || !Array.isArray(amistades)) {
            throw new Error("Estructura de datos inválida");
        }

        // Buscar a ambos jugadores
        const solicitante = usuarios.find(
            usuario => usuario.id === solicitanteId
        );

        const receptor = usuarios.find(
            usuario => usuario.id === receptorId
        );

        if (!solicitante || !receptor) {
            return res.status(404).json({
                message: "Uno de los usuarios no existe"
            });
        }

        // Solo los jugadores pueden enviar solicitudes
        if (
            solicitante.role !== "jugador" ||
            receptor.role !== "jugador"
        ) {
            return res.status(403).json({
                message: "Las amistades solo están disponibles para jugadores"
            });
        }

        // Verificar si ya existe una relación entre ambos
        const relacionExistente = amistades.some(amistad =>
            (
                amistad.solicitante_id === solicitanteId &&
                amistad.receptor_id === receptorId
            ) ||
            (
                amistad.solicitante_id === receptorId &&
                amistad.receptor_id === solicitanteId
            )
        );

        if (relacionExistente) {
            return res.status(409).json({
                message: "Ya existe una solicitud o amistad entre estos usuarios"
            });
        }

        // Validar contador de amistades
        if (
            !contadores ||
            !Number.isSafeInteger(contadores.siguienteAmistadId) ||
            contadores.siguienteAmistadId < 1 ||
            contadores.siguienteAmistadId >= Number.MAX_SAFE_INTEGER
        ) {
            return res.status(500).json({
                message: "Error en el contador de amistades"
            });
        }

        // Obtener el siguiente identificador
        const idNuevo = contadores.siguienteAmistadId;

        // Evitar identificadores duplicados
        if (amistades.some(amistad => amistad.id === idNuevo)) {
            return res.status(500).json({
                message: "El ID de amistad ya está en uso"
            });
        }

        // Crear solicitud de amistad
        const nuevaSolicitud = {
            id: idNuevo,
            solicitante_id: solicitanteId,
            receptor_id: receptorId,
            estado: "pendiente",
            fecha_creacion: new Date().toISOString()
        };

        // Incrementar y guardar el contador
        contadores.siguienteAmistadId = idNuevo + 1;
        guardarDatos("contadores", contadores);

        // Guardar solicitud
        amistades.push(nuevaSolicitud);
        guardarDatos("amistades", amistades);

        return res.status(201).json({
            message: "Solicitud de amistad enviada correctamente",
            solicitud: nuevaSolicitud
        });

    } catch (error) {
        console.error("Error al enviar solicitud:", error);

        return res.status(500).json({
            message: "Error al enviar la solicitud de amistad"
        });
    }
}

function listarSolicitudes(req, res) {
    const usuarioId = Number(req.query.usuario_id);

    // Validar identificador
    if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    try {
        const usuarios = leerDatos("usuarios");
        const amistades = leerDatos("amistades");
        const videojuegos = leerDatos("videojuegos");

        // Validar estructuras
        if (!Array.isArray(usuarios) || !Array.isArray(amistades)) {
            throw new Error("Estructura de datos inválida");
        }

        // Comprobar que el usuario exista y sea jugador
        const usuarioActual = usuarios.find(usuario => usuario.id === usuarioId);

        if (!usuarioActual) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        if (usuarioActual.role !== "jugador") {
            return res.status(403).json({
                message: "Solo los jugadores pueden consultar solicitudes"
            });
        }

        // Obtener solicitudes recibidas o enviadas
        function obtenerSolicitudes(tipo) {
            return amistades
                .filter(amistad => amistad.estado === "pendiente" && (tipo === "recibidas" ? amistad.receptor_id === usuarioId : amistad.solicitante_id === usuarioId))
                .map(amistad => {
                    const otroId = tipo === "recibidas" ? amistad.solicitante_id : amistad.receptor_id;

                    const otroJugador = usuarios.find(usuario => usuario.id === otroId && usuario.role === "jugador");

                    // Evitar mostrar referencias a cuentas eliminadas
                    if (!otroJugador) {
                        return null;
                    }

                    return {
                        id: amistad.id,
                        fecha_creacion: amistad.fecha_creacion,
                        jugador: {
                            id: otroJugador.id,
                            nombre_usuario: otroJugador.nombre_usuario,
                            descripcion_publica:
                                otroJugador.descripcion_publica || "",
                            favoritos_perfil: obtenerFavoritosPerfil(otroJugador, videojuegos)
                        }
                    };
                })
                .filter(solicitud => solicitud !== null)
                .sort((a, b) => b.id - a.id);
        }

        const recibidas = obtenerSolicitudes("recibidas");
        const enviadas = obtenerSolicitudes("enviadas");

        return res.status(200).json({
            recibidas: recibidas,
            enviadas: enviadas
        });

    } catch (error) {
        console.error("Error al consultar solicitudes:", error);

        return res.status(500).json({
            message: "Error al consultar solicitudes de amistad"
        });
    }
}

function aceptarSolicitud(req, res) {
    const solicitudId = Number(req.params.id);
    const receptorId = Number(req.body?.receptor_id);

    // Validar identificadores
    if (
        !Number.isSafeInteger(solicitudId) ||
        !Number.isSafeInteger(receptorId) ||
        solicitudId <= 0 ||
        receptorId <= 0
    ) {
        return res.status(400).json({
            message: "Identificadores inválidos"
        });
    }

    try {
        const usuarios = leerDatos("usuarios");
        const amistades = leerDatos("amistades");

        if (!Array.isArray(usuarios) || !Array.isArray(amistades)) {
            throw new Error("Estructura de datos inválida");
        }

        // Buscar la solicitud
        const solicitud = amistades.find(
            amistad => amistad.id === solicitudId
        );

        if (!solicitud) {
            return res.status(404).json({
                message: "Solicitud de amistad no encontrada"
            });
        }

        // Comprobar que quien acepta sea el receptor
        if (solicitud.receptor_id !== receptorId) {
            return res.status(403).json({
                message: "No puedes aceptar esta solicitud"
            });
        }

        // Comprobar que siga pendiente
        if (solicitud.estado !== "pendiente") {
            return res.status(409).json({
                message: "La solicitud ya no está pendiente"
            });
        }

        // Verificar que ambos jugadores sigan existiendo
        const solicitante = usuarios.find(
            usuario => usuario.id === solicitud.solicitante_id
        );

        const receptor = usuarios.find(
            usuario => usuario.id === receptorId
        );

        if (
            !solicitante ||
            !receptor ||
            solicitante.role !== "jugador" ||
            receptor.role !== "jugador"
        ) {
            return res.status(404).json({
                message: "Uno de los jugadores ya no está disponible"
            });
        }

        // Aceptar la solicitud
        solicitud.estado = "aceptada";
        solicitud.fecha_aceptacion = new Date().toISOString();

        guardarDatos("amistades", amistades);

        return res.status(200).json({
            message: "Solicitud de amistad aceptada correctamente",
            amistad: solicitud
        });

    } catch (error) {
        console.error("Error al aceptar solicitud:", error);

        return res.status(500).json({
            message: "Error al aceptar la solicitud de amistad"
        });
    }
}

function eliminarSolicitud(req, res) {
    const solicitudId = Number(req.params.id);
    const usuarioId = Number(req.body?.usuario_id);

    if (
        !Number.isSafeInteger(solicitudId) ||
        !Number.isSafeInteger(usuarioId) ||
        solicitudId <= 0 ||
        usuarioId <= 0
    ) {
        return res.status(400).json({
            message: "Identificadores inválidos"
        });
    }

    try {
        const usuarios = leerDatos("usuarios");
        const amistades = leerDatos("amistades");

        if (!Array.isArray(usuarios) || !Array.isArray(amistades)) {
            throw new Error("Estructura de datos inválida");
        }

        const usuario = usuarios.find(
            registro => registro.id === usuarioId
        );

        if (!usuario || usuario.role !== "jugador") {
            return res.status(403).json({
                message: "Usuario no autorizado"
            });
        }

        const solicitud = amistades.find(
            amistad => amistad.id === solicitudId
        );

        if (!solicitud) {
            return res.status(404).json({
                message: "Solicitud no encontrada"
            });
        }

        if (solicitud.estado !== "pendiente") {
            return res.status(409).json({
                message: "La solicitud ya no está pendiente"
            });
        }

        const esSolicitante = solicitud.solicitante_id === usuarioId;
        const esReceptor = solicitud.receptor_id === usuarioId;

        if (!esSolicitante && !esReceptor) {
            return res.status(403).json({
                message: "No puedes modificar esta solicitud"
            });
        }

        // Eliminar únicamente la solicitud indicada
        const amistadesActualizadas = amistades.filter(amistad => amistad.id !== solicitudId);

        guardarDatos("amistades", amistadesActualizadas);

        return res.status(200).json({
            message: esSolicitante ? "Solicitud cancelada correctamente" : "Solicitud rechazada correctamente"});

    } catch (error) {
        console.error("Error al eliminar solicitud:", error);

        return res.status(500).json({
            message: "Error al eliminar la solicitud"
        });
    }
}

function listarAmigos(req, res) {
    const usuarioId = Number(req.query.usuario_id);
    const pagina = Number(req.query.pagina || 1);
    const orden = req.query.orden || "nombre";

    const busqueda = typeof req.query.busqueda === "string"
        ? req.query.busqueda.trim().toLowerCase()
        : "";

    if (
        !Number.isSafeInteger(usuarioId) || usuarioId <= 0 ||
        !Number.isSafeInteger(pagina) || pagina < 1 ||
        busqueda.length > 50 ||
        !["nombre", "reciente"].includes(orden)
    ) {
        return res.status(400).json({
            message: "Parámetros de búsqueda inválidos"
        });
    }

    try {
        const usuarios = leerDatos("usuarios");
        const amistades = leerDatos("amistades");
        const videojuegos = leerDatos("videojuegos");

        if (!Array.isArray(usuarios) || !Array.isArray(amistades)) {
            throw new Error("Estructura de datos inválida");
        }

        const usuarioActual = usuarios.find(
            usuario => usuario.id === usuarioId
        );

        if (!usuarioActual) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        if (usuarioActual.role !== "jugador") {
            return res.status(403).json({
                message: "Solo los jugadores pueden consultar amistades"
            });
        }

        // Obtener amistades aceptadas en cualquier dirección
        const relaciones = amistades
            .filter(amistad =>
                amistad.estado === "aceptada" &&
                (
                    amistad.solicitante_id === usuarioId ||
                    amistad.receptor_id === usuarioId
                )
            )
            .map(amistad => {
                const otroId = amistad.solicitante_id === usuarioId
                    ? amistad.receptor_id
                    : amistad.solicitante_id;

                const otroJugador = usuarios.find(
                    usuario =>
                        usuario.id === otroId &&
                        usuario.role === "jugador"
                );

                if (!otroJugador) {
                    return null;
                }

                return {
                    id: amistad.id,
                    fecha_aceptacion: amistad.fecha_aceptacion,
                    jugador: {
                        id: otroJugador.id,
                        nombre_usuario: otroJugador.nombre_usuario,
                        descripcion_publica:
                            otroJugador.descripcion_publica || "",
                        favoritos_perfil: obtenerFavoritosPerfil(otroJugador, videojuegos)
                    }
                };
            })
            .filter(amistad => amistad !== null);

        const totalAmigos = relaciones.length;

        // Buscar por nombre
        const amigosFiltrados = relaciones.filter(amistad =>
            amistad.jugador.nombre_usuario
                .toLowerCase()
                .includes(busqueda)
        );

        // Ordenar antes de paginar
        if (orden === "reciente") {
            amigosFiltrados.sort((a, b) =>
                new Date(b.fecha_aceptacion).getTime() -
                new Date(a.fecha_aceptacion).getTime()
            );
        } else {
            amigosFiltrados.sort((a, b) =>
                a.jugador.nombre_usuario.localeCompare(
                    b.jugador.nombre_usuario
                )
            );
        }

        const porPagina = 10;
        const totalResultados = amigosFiltrados.length;
        const totalPaginas = Math.max(
            1,
            Math.ceil(totalResultados / porPagina)
        );

        const inicio = (pagina - 1) * porPagina;
        const amigos = amigosFiltrados.slice(
            inicio,
            inicio + porPagina
        );

        return res.status(200).json({
            amigos,
            totalAmigos,
            paginacion: {
                paginaActual: pagina,
                porPagina,
                totalResultados,
                totalPaginas
            }
        });

    } catch (error) {
        console.error("Error al consultar amigos:", error);

        return res.status(500).json({
            message: "Error al consultar las amistades"
        });
    }
}


// Eliminar una amistad aceptada
function eliminarAmistad(req, res) {
    const amistadId = Number(req.params.id);
    const usuarioId = Number(req.body?.usuario_id);

    if (
        !Number.isSafeInteger(amistadId) || amistadId <= 0 ||
        !Number.isSafeInteger(usuarioId) || usuarioId <= 0
    ) {
        return res.status(400).json({
            message: "Identificadores inválidos"
        });
    }

    try {
        const usuarios = leerDatos("usuarios");
        const amistades = leerDatos("amistades");

        if (!Array.isArray(usuarios) || !Array.isArray(amistades)) {
            throw new Error("Estructura de datos inválida");
        }

        const usuario = usuarios.find(
            registro => registro.id === usuarioId
        );

        if (!usuario || usuario.role !== "jugador") {
            return res.status(403).json({
                message: "Usuario no autorizado"
            });
        }

        const amistad = amistades.find(
            registro => registro.id === amistadId
        );

        if (!amistad) {
            return res.status(404).json({
                message: "Amistad no encontrada"
            });
        }

        if (amistad.estado !== "aceptada") {
            return res.status(409).json({
                message: "La relación no es una amistad aceptada"
            });
        }

        if (
            amistad.solicitante_id !== usuarioId &&
            amistad.receptor_id !== usuarioId
        ) {
            return res.status(403).json({
                message: "No puedes eliminar esta amistad"
            });
        }

        const amistadesActualizadas = amistades.filter(
            registro => registro.id !== amistadId
        );

        guardarDatos("amistades", amistadesActualizadas);

        return res.status(200).json({
            message: "Amistad eliminada correctamente"
        });

    } catch (error) {
        console.error("Error al eliminar amistad:", error);

        return res.status(500).json({
            message: "Error al eliminar la amistad"
        });
    }
}

module.exports = { buscarJugadores, enviarSolicitud, listarSolicitudes, aceptarSolicitud, eliminarSolicitud, listarAmigos, eliminarAmistad};