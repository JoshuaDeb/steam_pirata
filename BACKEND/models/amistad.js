const mongoose = require("mongoose");

const { Schema } = mongoose;

// ---------- Amistades ----------
const amistadSchema = new Schema({
    solicitante_id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "Usuario",
        immutable: true,
        index: true
    },

    receptor_id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "Usuario",
        immutable: true,
        index: true
    },

    estado: {
        type: String,
        enum: ["pendiente", "aceptada"],
        default: "pendiente",
        required: true
    },

    fecha_creacion: {
        type: Date,
        default: Date.now
    },

    fecha_aceptacion: {
        type: Date,
        default: null
    },

    clave_pareja: {
        type: String,
        required: true,
        unique: true
    }

}, {
    id: false,
    strict: "throw",
    optimisticConcurrency: true
});


// ---------- Validaciones ----------
amistadSchema.pre("validate", function () {
    if (!this.solicitante_id || !this.receptor_id) {
        return;
    }

    const solicitante = String(this.solicitante_id);
    const receptor = String(this.receptor_id);

    // Impedir solicitudes hacia uno mismo
    if (solicitante === receptor) {
        this.invalidate(
            "receptor_id",
            "No puedes enviarte una solicitud a ti mismo"
        );

        return;
    }

    // Generar la misma clave independientemente de quién envió la solicitud
    this.clave_pareja = [solicitante, receptor].sort().join(":");
});

// ---------- Modelo ----------
const Amistad = mongoose.model("Amistad", amistadSchema, "amistades");

module.exports = Amistad;