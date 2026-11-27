const mongoose = require("mongoose");

const compraSchema = new mongoose.Schema({
    id:         { type: Number, required: true, unique: true },
    usuario_id: { type: Number, required: true, ref: "Usuario", index: true },
    creditos:   { type: Number, required: true, enum: [10, 20, 50, 100, 200] },
    monto:      { type: Number, required: true, min: 0 },  
    metodo:     { type: String, default: "card" },
    stripe_session_id: { type: String, unique: true, sparse: true },  
    fecha:      { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model("Compra", compraSchema, "compras");