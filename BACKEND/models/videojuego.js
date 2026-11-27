const mongoose = require("mongoose");

const { Schema } = mongoose;

// ---------- Constantes ----------
const GENEROS = [
    "Acción",
    "Aventura",
    "Carreras",
    "Deportes",
    "Estrategia",
    "RPG",
    "Simulación",
    "Terror"
];

const CLASIFICACIONES = ["E", "T", "M"];

const TIPOS_CONTENIDO = [
    "Expansión",
    "Vehículos",
    "Personajes",
    "Cosméticos",
    "Niveles"
];

const entero = {
    validator: Number.isSafeInteger,
    message: "{PATH} debe ser un entero válido"
};

const opciones = {
    id: false,
    strict: "throw"
};


// ---------- DLC: subdocumento ----------
const dlcSchema = new Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60
    },

    tipo_contenido: {
        type: String,
        required: true,
        enum: TIPOS_CONTENIDO
    },

    descripcion: {
        type: String,
        default: "",
        trim: true,
        maxlength: 300
    }

}, {
    ...opciones,
    timestamps: true
});


// ---------- Videojuego ----------
const videojuegoSchema = new Schema({
    titulo: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60
    },

    descripcion: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },

    genero: {
        type: String,
        required: true,
        enum: GENEROS
    },

    clasificacion_edad: {
        type: String,
        required: true,
        enum: CLASIFICACIONES
    },

    precio_creditos: {
        type: Number,
        required: true,
        min: 1,
        validate: entero
    },

    especificaciones: {
        type: String,
        default: "",
        trim: true,
        maxlength: 200
    },

    portada: {
        type: String,
        default: null
    },

    id_desarrollador: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "Usuario"
    },

    estado: {
        type: String,
        enum: ["publicado", "retirado"],
        default: "publicado"
    },

    total_resenas: {
        type: Number,
        default: 0,
        min: 0,
        validate: entero
    },

    calificacion_promedio: {
        type: Number,
        default: null,
        min: 1,
        max: 5
    },

    dlcs: {
        type: [dlcSchema],
        default: [],

        validate: {
            validator: function (dlcs) {
                const comparador = new Intl.Collator("es", {
                    sensitivity: "accent"
                });

                const nombres = dlcs
                    .map(dlc => dlc.nombre)
                    .sort(comparador.compare);

                return nombres.every((nombre, i) =>
                    i === 0 ||
                    comparador.compare(nombre, nombres[i - 1]) !== 0
                );
            },

            message: "No pueden existir DLC con nombres repetidos"
        }
    }

}, {
    ...opciones, timestamps: true, optimisticConcurrency: true
});

// ---------- Índices ----------
// Facilitar consultas del panel del desarrollador
videojuegoSchema.index({
    id_desarrollador: 1
});

// Facilitar filtros del catálogo
videojuegoSchema.index({
    estado: 1,
    genero: 1
});

// Evitar videojuegos publicados con títulos repetidos
videojuegoSchema.index(
    { titulo: 1 },
    {
        name: "titulo_publicado_unico",
        unique: true,

        partialFilterExpression: {
            estado: "publicado"
        },

        collation: {
            locale: "es",
            strength: 2
        }
    }
);

// ---------- Modelo ----------
const Videojuego = mongoose.model("Videojuego", videojuegoSchema, "videojuegos");

module.exports = Videojuego;
module.exports.GENEROS = GENEROS;
module.exports.CLASIFICACIONES = CLASIFICACIONES;
module.exports.TIPOS_CONTENIDO = TIPOS_CONTENIDO;