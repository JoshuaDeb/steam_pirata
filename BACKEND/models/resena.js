const mongoose = require("mongoose");

const { Schema } = mongoose;


// ---------- Reseñas ----------
const resenaSchema = new Schema({
    usuario_id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "Usuario",
        immutable: true
    },

    juego_id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "Videojuego",
        immutable: true
    },

    estrellas: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
        validate: {
            validator: Number.isInteger,
            message: "Las estrellas deben ser enteras"
        }
    },

    texto: {
        type: String,
        required: true,
        trim: true,
        minlength: 5,
        maxlength: 500
    },

    respuesta: {
        type: String,
        default: null,
        trim: true,
        maxlength: 500
    },

    fecha: {
        type: Date,
        default: Date.now
    }

}, {
    id: false,
    strict: "throw",
    optimisticConcurrency: true
});


// ---------- Índices ----------
// Facilitar la consulta de reseñas de un videojuego
resenaSchema.index({
    juego_id: 1,
    fecha: -1
});

// Un jugador solo puede tener una reseña por videojuego
resenaSchema.index(
    {
        usuario_id: 1,
        juego_id: 1
    },
    {
        unique: true
    }
);

// ---------- Modelo ----------
const Resena = mongoose.model("Resena", resenaSchema, "resenas");

module.exports = Resena;