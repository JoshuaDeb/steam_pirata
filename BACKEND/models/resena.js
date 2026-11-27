const mongoose = require("mongoose");

const resenaSchema = new mongoose.Schema({
    id:         { type: Number, required: true, unique: true },
    usuario_id: { type: Number, required: true, ref: "Usuario" },
    juego_id:   { type: Number, required: true, ref: "Videojuego" },
    estrellas:  { type: Number, required: true, min: 1, max: 5,
                  validate: [Number.isInteger, "Las estrellas deben ser enteras"] },
    texto:      { type: String, required: true, trim: true, minlength: 5, maxlength: 500 },
    respuesta:  { type: String, default: null, maxlength: 500 },
    fecha:      { type: Date, default: Date.now }
}, { versionKey: false });

resenaSchema.index({ juego_id: 1, fecha: -1 });
// Un jugador solo puede tener una reseña por videojuego
resenaSchema.index({ usuario_id: 1, juego_id: 1 }, { unique: true });

module.exports = mongoose.model("Resena", resenaSchema, "resenas");