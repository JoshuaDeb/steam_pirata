const mongoose = require("mongoose");

const favoritoSchema = new mongoose.Schema({
    usuario_id:    { type: Number, required: true, ref: "Usuario" },
    videojuego_id: { type: Number, required: true, ref: "Videojuego" }
}, { versionKey: false });

favoritoSchema.index({ usuario_id: 1, videojuego_id: 1 }, { unique: true });

module.exports = mongoose.model("Favorito", favoritoSchema, "favoritos");