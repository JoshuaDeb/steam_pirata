const mongoose = require("mongoose");

const amistadSchema = new mongoose.Schema({
    id:               { type: Number, required: true, unique: true },
    solicitante_id:   { type: Number, required: true, ref: "Usuario", index: true },
    receptor_id:      { type: Number, required: true, ref: "Usuario", index: true },
    estado:           { type: String, enum: ["pendiente", "aceptada"], default: "pendiente" },
    fecha_creacion:   { type: Date, default: Date.now },
    fecha_aceptacion: { type: Date, default: null }
}, { versionKey: false });

module.exports = mongoose.model("Amistad", amistadSchema, "amistades");