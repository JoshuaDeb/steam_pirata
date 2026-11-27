const mongoose = require("mongoose");

async function conectarDB() {
    if (!process.env.MONGODB_URI) {
        throw new Error("La variable MONGODB_URI no está configurada");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB Atlas");
}

module.exports = conectarDB;