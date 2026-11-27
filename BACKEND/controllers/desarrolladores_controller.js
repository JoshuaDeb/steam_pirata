const { getModel } = require("../storage");
const { leerId, transaccion } = require("../utils/mongo_utils");
const Desarrollador = getModel("desarrolladores");
const Jugador = getModel("jugadores");
const Videojuego = getModel("videojuegos");


// GET /api/desarrolladores/:id
async function obtenerDesarrollador(req, res) {
    const id = leerId(req.params.id);
    if (!id) {
        return res.status(400).json({
            message: "Identificador de desarrollador inválido"
        });
    }

    try {
        // Consultar exclusivamente los datos públicos (incluye el contador de seguidores)
        const desarrollador = await Desarrollador.findById(id).select("nombre_usuario descripcion_publica foto_perfil atributos.seguidor_count").lean();
        if (!desarrollador) {
            return res.status(404).json({
                message: "Desarrollador no encontrado"
            });
        }

        // Obtener el total y promedio de los juegos publicados
        const [resumen] = await Videojuego.aggregate([
            {
                $match: {
                    id_desarrollador: desarrollador._id,
                    estado: "publicado"
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    promedio: {
                        $avg: "$calificacion_promedio"
                    }
                }
            }
        ]);

        res.status(200).json({
            desarrollador: {
                id: String(desarrollador._id),
                nombre_usuario: desarrollador.nombre_usuario,
                descripcion_publica: desarrollador.descripcion_publica || "",
                foto_perfil: desarrollador.foto_perfil || null,
                total_videojuegos: resumen ? resumen.total : 0,
                calificacion_promedio: resumen && resumen.promedio !== null ? Math.round(resumen.promedio * 10) / 10 : null,
                seguidores: desarrollador.atributos?.seguidor_count || 0
            }
        });

    } catch (error) {
        console.error("Error al consultar el desarrollador:",error);
        res.status(500).json({
            message: "Error al consultar el desarrollador"
        });
    }
}


// GET /api/desarrolladores/siguiendo
// IDs de los desarrolladores que sigue el jugador
async function listarSiguiendo(req, res) {
    try {
        const jugador = await Jugador.findById(req.usuario.id).select("atributos.desarrolladores_seguidos").lean();

        const seguidos = jugador?.atributos?.desarrolladores_seguidos || [];

        res.status(200).json({
            siguiendo: seguidos.map(String)
        });

    } catch (error) {
        console.error("Error al consultar los desarrolladores seguidos:", error);
        res.status(500).json({
            message: "Error al consultar los desarrolladores seguidos"
        });
    }
}


// Leer el contador de seguidores dentro de la transacción
async function contarSeguidores(id, session) {
    const desarrollador = await Desarrollador.findById(id).select("atributos.seguidor_count").session(session).lean();

    return desarrollador?.atributos?.seguidor_count || 0;
}


// POST /api/desarrolladores/:id/seguir
async function seguirDesarrollador(req, res) {
    const id = leerId(req.params.id);
    if (!id) {
        return res.status(400).json({
            message: "Identificador de desarrollador inválido"
        });
    }

    try {
        // La lista del jugador y el contador del desarrollador cambian juntos (transacción)
        const resultado = await transaccion(async (session) => {
            const existe = await Desarrollador.exists({ _id: id }).session(session);

            if (!existe) {
                return { status: 404, message: "Desarrollador no encontrado" };
            }

            // Agregarlo solo si todavía no lo sigue
            const cambio = await Jugador.updateOne(
                {
                    _id: req.usuario.id,
                    "atributos.desarrolladores_seguidos": { $ne: id }
                },
                {
                    $push: { "atributos.desarrolladores_seguidos": id }
                },
                { session }
            );

            // Si se agregó, sumar un seguidor
            if (cambio.modifiedCount === 1) {
                await Desarrollador.updateOne(
                    { _id: id },
                    { $inc: { "atributos.seguidor_count": 1 } },
                    { session }
                );
            }

            return { status: 200, seguidores: await contarSeguidores(id, session) };
        });

        if (resultado.status !== 200) {
            return res.status(resultado.status).json({ message: resultado.message });
        }

        res.status(200).json({
            siguiendo: true,
            seguidores: resultado.seguidores
        });

    } catch (error) {
        console.error("Error al seguir al desarrollador:", error);
        res.status(500).json({
            message: "No se pudo seguir al desarrollador"
        });
    }
}


// DELETE /api/desarrolladores/:id/seguir
async function dejarDeSeguir(req, res) {
    const id = leerId(req.params.id);
    if (!id) {
        return res.status(400).json({
            message: "Identificador de desarrollador inválido"
        });
    }

    try {
        const resultado = await transaccion(async (session) => {
            const existe = await Desarrollador.exists({ _id: id }).session(session);

            if (!existe) {
                return { status: 404, message: "Desarrollador no encontrado" };
            }

            // Quitarlo solo si sí lo seguía
            const cambio = await Jugador.updateOne(
                {
                    _id: req.usuario.id,
                    "atributos.desarrolladores_seguidos": id
                },
                {
                    $pull: { "atributos.desarrolladores_seguidos": id }
                },
                { session }
            );

            // Si se quitó, restar un seguidor (nunca por debajo de 0)
            if (cambio.modifiedCount === 1) {
                await Desarrollador.updateOne(
                    { _id: id, "atributos.seguidor_count": { $gt: 0 } },
                    { $inc: { "atributos.seguidor_count": -1 } },
                    { session }
                );
            }

            return { status: 200, seguidores: await contarSeguidores(id, session) };
        });

        if (resultado.status !== 200) {
            return res.status(resultado.status).json({ message: resultado.message });
        }

        res.status(200).json({
            siguiendo: false,
            seguidores: resultado.seguidores
        });

    } catch (error) {
        console.error("Error al dejar de seguir al desarrollador:", error);
        res.status(500).json({
            message: "No se pudo dejar de seguir al desarrollador"
        });
    }
}

module.exports = { obtenerDesarrollador, listarSiguiendo, seguirDesarrollador, dejarDeSeguir };