const mongoose = require("mongoose");

async function conectarDB() {
    if (!process.env.MONGODB_URI) {
        throw new Error("La variable MONGODB_URI no está configurada");
    }

    if (!process.env.MONGODB_DB) {
        throw new Error("La variable MONGODB_DB no está configurada");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
        dbName: process.env.MONGODB_DB,
        autoIndex: true,
        autoCreate: true
    });

    console.log("Conectado a MongoDB Atlas");
    console.log("Base de datos:", mongoose.connection.name);
}

module.exports = conectarDB;