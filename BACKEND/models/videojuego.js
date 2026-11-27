const mongoose = require("mongoose");

const GENEROS = ["Acción", "Aventura", "Carreras", "Deportes", "Estrategia", "RPG", "Simulación", "Terror"];
const CLASIFICACIONES = ["E", "T", "M"];

const videojuegoSchema = new mongoose.Schema({
    id:                 { type: Number, required: true, unique: true },
    titulo:             { type: String, required: true, trim: true, maxlength: 60 },
    descripcion:        { type: String, required: true, trim: true, maxlength: 1000 },
    genero:             { type: String, required: true, enum: GENEROS },
    clasificacion_edad: { type: String, required: true, enum: CLASIFICACIONES },
    precio_creditos:    { type: Number, required: true, min: 0,
                          validate: [Number.isInteger, "El precio debe ser entero"] },
    especificaciones:   { type: String, default: "", maxlength: 200 },
    portada:            { type: String, default: null },               
    id_desarrollador:   { type: Number, required: true, ref: "Usuario" },
    estado:             { type: String, enum: ["publicado", "retirado"], default: "publicado" },
    total_resenas:      { type: Number, default: 0, min: 0 },
    calificacion_promedio: { type: Number, default: null, min: 0, max: 5 }
}, { timestamps: true, versionKey: false });


videojuegoSchema.index({ estado: 1, genero: 1 });
videojuegoSchema.index({ id_desarrollador: 1 });
videojuegoSchema.index({ titulo: 1 });

module.exports = mongoose.model("Videojuego", videojuegoSchema, "videojuegos");
module.exports.GENEROS = GENEROS;
module.exports.CLASIFICACIONES = CLASIFICACIONES;