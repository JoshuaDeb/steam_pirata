const mongoose = require("mongoose");

const contadorSchema = new mongoose.Schema({
    _id: { type: String, required: true },   
    valor: { type: Number, required: true, default: 0 }
}, { versionKey: false });

const Contador = mongoose.model("Contador", contadorSchema, "contadores");


async function siguienteId(coleccion) {
    const contador = await Contador.findByIdAndUpdate(
        coleccion,
        { $inc: { valor: 1 } },
        { new: true, upsert: true }
    );
    return contador.valor;
}

module.exports = { Contador, siguienteId };