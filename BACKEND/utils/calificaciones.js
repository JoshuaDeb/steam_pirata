const mongoose = require("mongoose");
const { getModel } = require("../storage");

const Resena = getModel("resenas");
const Videojuego = getModel("videojuegos");

// Recalcular el total y promedio de reseñas
async function recalcularCalificaciones(
    juegoIds,
    session = null
) {
    // Evitar identificadores repetidos
    const ids = [...new Set(juegoIds.map(String))];

    for (const id of ids) {
        const juegoId = new mongoose.Types.ObjectId(id);

        const [resumen] = await Resena.aggregate([
            {
                $match: {
                    juego_id: juegoId
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    promedio: { $avg: "$estrellas" }
                }
            }
        ]).session(session);

        await Videojuego.updateOne(
            { _id: juegoId },
            {
                total_resenas: resumen ? resumen.total : 0,
                calificacion_promedio: resumen ? Math.round(resumen.promedio * 10) / 10 : null
            },
            {
                session,
                runValidators: true
            }
        );
    }
}

module.exports = { recalcularCalificaciones };