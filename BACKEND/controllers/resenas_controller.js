const { getModel } = require("../storage");
const {leerId, mismoId, contieneId, transaccion } = require("../utils/mongo_utils");
const { recalcularCalificaciones } = require("../utils/calificaciones");

const Resena = getModel("resenas");
const Usuario = getModel("usuarios");
const Jugador = getModel("jugadores");
const Videojuego = getModel("videojuegos");

const PREMIO_RESENA = 10;


// ---------- Utilidades ----------
// Validar el contenido de una reseña
function validarResena(estrellas, texto) {
    if (!Number.isInteger(estrellas) || estrellas < 1 ||estrellas > 5) {
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


// Preparar una reseña para enviarla al frontend
function limpiar(resena) {
    return {
        id: String(resena._id),
        usuario_id: String(resena.usuario_id),
        juego_id: String(resena.juego_id),
        estrellas: resena.estrellas,
        texto: resena.texto,
        fecha: resena.fecha,
        respuesta: resena.respuesta || null
    };
}


// Consultar la calificación actual de un videojuego
async function calificacionDe(juegoId, session = null) {
    const juego = await Videojuego.findById(juegoId).select("calificacion_promedio total_resenas").session(session).lean();
    return {
        calificacion_promedio: juego ? juego.calificacion_promedio : null,
        total_resenas: juego ? juego.total_resenas : 0
    };
}

// Agregar el nombre del autor y título del videojuego
async function armarResenas(resenas) {
    const autores = await Usuario.find(
        {
            _id: {
                $in: resenas.map(resena => resena.usuario_id)
            }
        },
        "nombre_usuario"
    ).lean();

    const juegos = await Videojuego.find(
        {
            _id: {
                $in: resenas.map(resena => resena.juego_id)
            }
        },
        "titulo"
    ).lean();

    const nombres = new Map(autores.map(usuario => [String(usuario._id), usuario.nombre_usuario]));
    const titulos = new Map(juegos.map(juego => [String(juego._id), juego.titulo]));

    return resenas.map(resena => ({
        ...limpiar(resena),
        nombre_usuario: nombres.get(String(resena.usuario_id)) || "Usuario eliminado",

        titulo_juego: titulos.get(String(resena.juego_id)) || "Juego eliminado"
    }));
}


// Manejar errores de escritura
function manejarError(error, res, mensaje) {
    if (error.code === 11000) {
        return res.status(409).json({
            message: "Ya escribiste una reseña de este juego"
        });
    }

    if (
        error.name === "VersionError" ||
        error.name === "DocumentNotFoundError"
    ) {
        return res.status(409).json({
            message: "La reseña fue modificada. Intenta nuevamente"
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

// ---------- Consultas públicas ----------
// GET /api/resenas
async function listarResenas(req, res) {
    const filtro = {};
    if (req.query.juego_id !== undefined) {

        const juegoId = leerId(req.query.juego_id);

        if (!juegoId) {
            return res.status(400).json({
                message: "Identificador de videojuego inválido"
            });
        }

        filtro.juego_id = juegoId;
    }

    if (req.query.usuario_id !== undefined) {

        const usuarioId = leerId(req.query.usuario_id);

        if (!usuarioId) {
            return res.status(400).json({
                message: "Identificador de usuario inválido"
            });
        }

        filtro.usuario_id = usuarioId;
    }

    try {
        const resenas = await Resena.find(filtro).sort({ _id: 1 }).lean();

        res.status(200).json({
            resenas: await armarResenas(resenas)
        });

    } catch (error) {
        return manejarError(
            error,
            res,
            "Error al consultar las reseñas"
        );
    }
}


// ---------- Jugador ----------
// POST /api/resenas
async function crearResena(req, res) {
    const usuarioId = req.usuario.id;

    const juegoId = leerId(req.body?.juego_id);
    const estrellas = Number(req.body?.estrellas);
    const texto = req.body?.texto;

    if (!juegoId) {
        return res.status(400).json({
            message: "Identificador de videojuego inválido"
        });
    }

    const errorValidacion = validarResena(estrellas, texto);

    if (errorValidacion) {
        return res.status(400).json({
            message: errorValidacion
        });
    }

    try {
        const resultado = await transaccion(async session => {

            // Consultar exclusivamente jugadores
            const jugador = await Jugador.findById(usuarioId)
                .select(
                    "creditos atributos.biblioteca atributos.resenas_premiadas"
                )
                .session(session)
                .lean();

            if (!jugador) {
                return {
                    status: 403,
                    message: "Solo los jugadores pueden escribir reseñas"
                };
            }

            const juegoExiste = await Videojuego.exists({
                _id: juegoId
            }).session(session);

            if (!juegoExiste) {
                return {
                    status: 404,
                    message: "El videojuego no existe"
                };
            }

            // Solo se pueden reseñar juegos adquiridos
            if (!contieneId(jugador.atributos.biblioteca,juegoId)) {
                return {
                    status: 403,
                    message: "Solo puedes reseñar los videojuegos de tu biblioteca"
                };
            }

            // Impedir reseñas duplicadas
            const resenaExiste = await Resena.exists({
                usuario_id: usuarioId,
                juego_id: juegoId
            }).session(session);

            if (resenaExiste) {
                return {
                    status: 409,
                    message: "Ya escribiste una reseña de este juego"
                };
            }

            // Crear la reseña dentro de la transacción
            const [nuevaResena] = await Resena.create(
                [{
                    usuario_id: usuarioId,
                    juego_id: juegoId,
                    estrellas,
                    texto: texto.trim(),
                    fecha: new Date()
                }],
                { session }
            );

            // Comprobar si ya recibió la recompensa
            const yaPremiado = contieneId(
                jugador.atributos.resenas_premiadas,
                juegoId
            );

            const premio = yaPremiado ? 0 : PREMIO_RESENA;

            const filtro = {
                _id: usuarioId,
                "atributos.biblioteca": juegoId
            };

            const actualizacion = {
                $inc: { __v: 1 }
            };

            // Entregar la recompensa únicamente una vez
            if (!yaPremiado) {
                filtro["atributos.resenas_premiadas"] = {
                    $ne: juegoId
                };

                actualizacion.$inc.creditos = premio;

                actualizacion.$addToSet = {
                    "atributos.resenas_premiadas": juegoId
                };
            }

            const jugadorActualizado =
                await Jugador.findOneAndUpdate(
                    filtro,
                    actualizacion,
                    {
                        new: true,
                        session,
                        runValidators: true
                    }
                ).select("creditos").lean();

            if (!jugadorActualizado) {
                throw new Error("No se pudo actualizar el jugador");
            }

            // Actualizar el promedio y total de reseñas
            await recalcularCalificaciones([juegoId], session);

            return {
                status: 201,
                message: premio > 0 ? `Reseña publicada. ¡Ganaste ${premio} créditos!` : "Reseña publicada",
                resena: limpiar(nuevaResena),
                premio,
                creditos: jugadorActualizado.creditos,
                ...(await calificacionDe(juegoId, session))
            };
        });

        const { status, ...respuesta } = resultado;
        res.status(status).json(respuesta);

    } catch (error) {
        return manejarError(
            error,
            res,
            "Error al publicar la reseña"
        );
    }
}


// PUT /api/resenas/:id
async function actualizarResena(req, res) {
    const id = leerId(req.params.id);
    const usuarioId = req.usuario.id;

    const estrellas = Number(req.body?.estrellas);
    const texto = req.body?.texto;

    if (!id) {
        return res.status(400).json({
            message: "Identificador de reseña inválido"
        });
    }

    const errorValidacion = validarResena(estrellas, texto);

    if (errorValidacion) {
        return res.status(400).json({
            message: errorValidacion
        });
    }

    try {
        const resultado = await transaccion(async session => {

            const resena = await Resena.findById(id)
                .session(session);

            if (!resena) {
                return {
                    status: 404,
                    message: "Reseña no encontrada"
                };
            }

            if (!mismoId(resena.usuario_id, usuarioId)) {
                return {
                    status: 403,
                    message: "Solo puedes editar tus propias reseñas"
                };
            }

            resena.estrellas = estrellas;
            resena.texto = texto.trim();
            resena.fecha = new Date();

            await resena.save({ session });

            await recalcularCalificaciones(
                [resena.juego_id],
                session
            );

            return {
                status: 200,
                message: "Reseña actualizada",
                resena: limpiar(resena),
                premio: 0,

                ...(await calificacionDe(
                    resena.juego_id,
                    session
                ))
            };
        });

        const { status, ...respuesta } = resultado;
        res.status(status).json(respuesta);

    } catch (error) {
        return manejarError(
            error,
            res,
            "Error al actualizar la reseña"
        );
    }
}

// DELETE /api/resenas/:id
async function eliminarResena(req, res) {
    const id = leerId(req.params.id);
    const usuarioId = req.usuario.id;

    if (!id) {
        return res.status(400).json({
            message: "Identificador de reseña inválido"
        });
    }

    try {
        const resultado = await transaccion(async session => {
            const resena = await Resena.findById(id).session(session).lean();

            if (!resena) {
                return {
                    status: 404,
                    message: "Reseña no encontrada"
                };
            }

            if (!mismoId(resena.usuario_id, usuarioId)) {
                return {
                    status: 403,
                    message: "Solo puedes borrar tus propias reseñas"
                };
            }

            const eliminacion = await Resena.deleteOne(
                { _id: id, usuario_id: usuarioId },
                { session }
            );

            if (eliminacion.deletedCount !== 1) {
                throw new Error(
                    "No se pudo eliminar la reseña"
                );
            }

            // NO eliminar el juego de resenas_premiadas

            await recalcularCalificaciones(
                [resena.juego_id],
                session
            );

            return {
                status: 200,
                message: "Reseña eliminada",
                premio: 0,

                ...(await calificacionDe(
                    resena.juego_id,
                    session
                ))
            };
        });

        const { status, ...respuesta } = resultado;
        res.status(status).json(respuesta);

    } catch (error) {
        return manejarError(
            error,
            res,
            "Error al eliminar la reseña"
        );
    }
}

// ---------- Desarrollador ----------
// GET /api/resenas/desarrollador
async function listarResenasDesarrollador(req, res) {
    try {
        // Obtener los ObjectId de sus videojuegos
        const misJuegos = await Videojuego.distinct(
            "_id",
            { id_desarrollador: req.usuario.id }
        );

        const resenas = await Resena.find({
            juego_id: { $in: misJuegos }
        }).sort({ _id: 1 }).lean();

        res.status(200).json({
            resenas: await armarResenas(resenas)
        });

    } catch (error) {
        return manejarError(
            error,
            res,
            "Error al consultar las reseñas"
        );
    }
}

// PUT /api/resenas/:id/respuesta
async function responderResena(req, res) {
    const id = leerId(req.params.id);
    const texto = req.body?.texto;

    if (!id) {
        return res.status(400).json({
            message: "Identificador de reseña inválido"
        });
    }

    if (typeof texto !== "string" || !texto.trim()) {
        return res.status(400).json({
            message: "Escribe una respuesta"
        });
    }

    if (texto.trim().length > 500) {
        return res.status(400).json({
            message: "La respuesta no puede pasar de 500 caracteres"
        });
    }

    try {
        const resena = await Resena.findById(id);

        if (!resena) {
            return res.status(404).json({
                message: "Reseña no encontrada"
            });
        }

        // Verificar que el juego pertenezca al desarrollador
        const esSuJuego = await Videojuego.exists({
            _id: resena.juego_id,
            id_desarrollador: req.usuario.id
        });

        if (!esSuJuego) {
            return res.status(403).json({
                message: "Solo puedes responder reseñas de tus juegos"
            });
        }

        // Crear o reemplazar la respuesta existente
        resena.respuesta = texto.trim();

        await resena.save();

        res.status(200).json({
            message: "Respuesta guardada",
            resena: limpiar(resena)
        });

    } catch (error) {
        return manejarError(
            error,
            res,
            "Error al guardar la respuesta"
        );
    }
}

module.exports = {
    recalcularCalificaciones,
    listarResenas,
    crearResena,
    actualizarResena,
    eliminarResena,
    listarResenasDesarrollador,
    responderResena
};