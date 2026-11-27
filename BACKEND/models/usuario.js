const mongoose = require("mongoose");

const { Schema } = mongoose;

// Validación para números enteros
const entero = {
    validator: Number.isSafeInteger,
    message: "{PATH} debe ser un entero válido"
};

// Configuración común de los esquemas
const opciones = {
    id: false,
    strict: "throw"
};


// ---------- Usuario: esquema base ----------
const usuarioSchema = new Schema({
    nombre_usuario: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },

    correo: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Correo inválido"]
    },

    passwordHash: {
        type: String,
        required: true,
        select: false
    },

    role: {
        type: String,
        required: true,
        enum: ["jugador", "desarrollador"]
    },

    creditos: {
        type: Number,
        default: 0,
        min: 0,
        validate: entero
    },

    descripcion_publica: {
        type: String,
        default: "",
        maxlength: 300
    },

    foto_perfil: {
        type: String,
        default: null
    }

}, {
    ...opciones,
    discriminatorKey: "role",
    timestamps: true,
    optimisticConcurrency: true
});


// Evitar nombres duplicados sin distinguir mayúsculas
usuarioSchema.index(
    { nombre_usuario: 1 },
    {
        unique: true,
        collation: {
            locale: "es",
            strength: 2
        }
    }
);

// ---------- Compras de créditos ----------
// Subdocumentos incrustados en el jugador
const compraSchema = new Schema({
    creditos: {
        type: Number,
        required: true,
        min: 1,
        validate: entero
    },

    monto: {
        type: Number,
        required: true,
        min: 0
    },

    metodo: {
        type: String,
        required: true,
        default: "card"
    },

    stripe_session_id: {
        type: String,
        default: undefined
    },

    fecha: {
        type: Date,
        default: Date.now
    }

}, opciones);

// ---------- Jugador ----------
const jugadorSchema = new Schema({
    atributos: {
        biblioteca: {
            type: [Schema.Types.ObjectId],
            ref: "Videojuego",
            default: []
        },

        favoritos: {
            type: [Schema.Types.ObjectId],
            ref: "Videojuego",
            default: []
        },

        favoritos_perfil: {
            type: [Schema.Types.ObjectId],
            ref: "Videojuego",
            default: () => [null, null, null],

            validate: {
                validator: function (favoritos) {
                    if (favoritos.length !== 3) {
                        return false;
                    }
                    const ids = favoritos .filter(id => id !== null).map(String);
                    return new Set(ids).size === ids.length;
                },
                message: "Debes tener tres posiciones sin videojuegos repetidos"
            }
        },

        resenas_premiadas: {
            type: [Schema.Types.ObjectId],
            ref: "Videojuego",
            default: []
        },

        compras: {
            type: [compraSchema],
            default: [],
            select: false
        },

        desarrolladores_seguidos: {
            type: [Schema.Types.ObjectId],
            ref: "Usuario",
            default: []
        }
    }

}, opciones);

// Facilitar búsquedas de jugadores que poseen un videojuego
jugadorSchema.index({
    "atributos.biblioteca": 1
});

// ---------- Desarrollador ----------

const desarrolladorSchema = new Schema({
    atributos: {
        seguidor_count: {
            type: Number,
            default: 0,
            min: 0,
            validate: entero
        }
    }

}, opciones);

// ---------- Modelos y discriminadores ----------
const Usuario = mongoose.model("Usuario", usuarioSchema, "usuarios");
Usuario.discriminator("jugador", jugadorSchema);
Usuario.discriminator("desarrollador", desarrolladorSchema);

module.exports = Usuario;