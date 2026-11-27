const { getModel } = require("../storage");
const { leerId } = require("../utils/mongo_utils");
const Desarrollador = getModel("desarrolladores");
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
        // Consultar exclusivamente los datos públicos
        const desarrollador = await Desarrollador.findById(id).select("nombre_usuario descripcion_publica foto_perfil").lean();
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
                calificacion_promedio: resumen && resumen.promedio !== null ? Math.round(resumen.promedio * 10) / 10 : null
            }
        });

    } catch (error) {
        console.error("Error al consultar el desarrollador:",error);
        res.status(500).json({
            message: "Error al consultar el desarrollador"
        });
    }
}

module.exports = { obtenerDesarrollador };