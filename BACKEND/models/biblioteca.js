const mongoose = require("mongoose");

const bibliotecaSchema = new mongoose.Schema({
    usuario_id:    { type: Number, required: true, ref: "Usuario" },
    videojuego_id: { type: Number, required: true, ref: "Videojuego" },
    fecha:         { type: Date, default: Date.now }
}, { versionKey: false });


bibliotecaSchema.index({ usuario_id: 1, videojuego_id: 1 }, { unique: true });

module.exports = mongoose.model("Biblioteca", bibliotecaSchema, "bibliotecas");