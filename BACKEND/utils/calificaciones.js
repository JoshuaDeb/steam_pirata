const Resena = require("../models/resena");
const Videojuego = require("../models/videojuego");


async function recalcularCalificaciones(juegoIds, session = null) {
    const ids = [...new Set(juegoIds)];

    for (const juegoId of ids) {
        const [resumen] = await Resena.aggregate([
            { $match: { juego_id: juegoId } },
            { $group: { _id: null, total: { $sum: 1 }, promedio: { $avg: "$estrellas" } } }
        ]).session(session);

        await Videojuego.updateOne(
            { id: juegoId },
            {
                total_resenas: resumen ? resumen.total : 0,
                calificacion_promedio: resumen ? Math.round(resumen.promedio * 10) / 10 : null
            },
            { session }
        );
    }
}

module.exports = { recalcularCalificaciones };