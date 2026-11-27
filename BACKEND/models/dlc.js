const mongoose = require("mongoose");

const TIPOS_CONTENIDO = ["Expansión", "Vehículos", "Personajes", "Cosméticos", "Niveles"];

const dlcSchema = new mongoose.Schema({
    id:             { type: Number, required: true, unique: true },
    id_videojuego:  { type: Number, required: true, ref: "Videojuego", index: true },
    nombre:         { type: String, required: true, trim: true, maxlength: 60 },
    tipo_contenido: { type: String, required: true, enum: TIPOS_CONTENIDO },
    descripcion:    { type: String, default: "", trim: true, maxlength: 300 }   // opcional
}, { timestamps: true, versionKey: false });


dlcSchema.index(
    { id_videojuego: 1, nombre: 1 },
    { unique: true, collation: { locale: "es", strength: 2 } }
);

module.exports = mongoose.model("Dlc", dlcSchema, "dlcs");
module.exports.TIPOS_CONTENIDO = TIPOS_CONTENIDO;