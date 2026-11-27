const Usuario = require("../models/usuario");
const Videojuego = require("../models/videojuego");



async function obtenerDesarrollador(req, res) {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({ message: "Identificador de desarrollador inválido" });
    }

    try {
        // Solo datos públicos: nunca el correo ni los créditos
        const desarrollador = await Usuario.findOne(
            { id, role: "desarrollador" },
            "id nombre_usuario descripcion_publica foto_perfil"
        ).lean();

        if (!desarrollador) {
            return res.status(404).json({ message: "Desarrollador no encontrado" });
        }


        const [resumen] = await Videojuego.aggregate([
            { $match: { id_desarrollador: id, estado: "publicado" } },
            { $group: { _id: null, total: { $sum: 1 }, promedio: { $avg: "$calificacion_promedio" } } }
        ]);

        res.status(200).json({
            desarrollador: {
                id: desarrollador.id,
                nombre_usuario: desarrollador.nombre_usuario,
                descripcion_publica: desarrollador.descripcion_publica || "",
                foto_perfil: desarrollador.foto_perfil || null,
                total_videojuegos: resumen ? resumen.total : 0,
                calificacion_promedio: resumen && resumen.promedio !== null
                    ? Math.round(resumen.promedio * 10) / 10
                    : null
            }
        });
    } catch (error) {
        console.error("Error al consultar el desarrollador:", error);
        res.status(500).json({ message: "Error al consultar el desarrollador" });
    }
}

module.exports = { obtenerDesarrollador };