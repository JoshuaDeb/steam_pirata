const mongoose = require("mongoose");

const usuarioSchema = new mongoose.Schema({
    id:             { type: Number, required: true, unique: true },
    nombre_usuario: { type: String, required: true, trim: true, minlength: 3, maxlength: 30 },
    correo:         { type: String, required: true, trim: true, lowercase: true, unique: true,
                      match: [/^\S+@\S+\.\S+$/, "Correo inválido"] },
    passwordHash:   { type: String, required: true, select: false },   
    role:           { type: String, required: true, enum: ["jugador", "desarrollador"] },
    creditos:       { type: Number, default: 0, min: 0 },
    descripcion_publica: { type: String, default: "", maxlength: 300 },
    resenas_premiadas:   { type: [Number], default: [] },             
    favoritos_perfil:    { type: [Number], default: [],
                           validate: [v => v.length <= 3, "Máximo 3 favoritos en el perfil"] },
    foto_perfil:    { type: String, default: null }                   
}, { timestamps: true, versionKey: false });


usuarioSchema.index(
    { nombre_usuario: 1 },
    { unique: true, collation: { locale: "es", strength: 2 } }
);

module.exports = mongoose.model("Usuario", usuarioSchema, "usuarios");