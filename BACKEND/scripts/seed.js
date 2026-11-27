

require("dotenv").config({ quiet: true });
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

const Usuario    = require("../models/usuario");
const Videojuego = require("../models/videojuego");
const Dlc        = require("../models/dlc");
const Resena     = require("../models/resena");
const Amistad    = require("../models/amistad");
const Biblioteca = require("../models/biblioteca");
const Favorito   = require("../models/favorito");
const Compra     = require("../models/compra");
const { Contador } = require("../models/contador");

function leer(nombre) {
       const ruta = path.join(__dirname, "datos_demo", `${nombre}.json`);
    return JSON.parse(fs.readFileSync(ruta, "utf8"));
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado. Cargando datos...");

    const colecciones = [
        ["usuarios",    Usuario],
        ["videojuegos", Videojuego],
        ["dlcs",        Dlc],
        ["resenas",     Resena],
        ["amistades",   Amistad],
        ["bibliotecas", Biblioteca],
        ["favoritos",   Favorito],
        ["compras",     Compra]
    ];

    for (const [nombre, Modelo] of colecciones) {
        const datos = leer(nombre);

        await Modelo.deleteMany({});
        await Modelo.syncIndexes();          
        await Modelo.insertMany(datos);      


        if (datos.length && datos[0].id !== undefined) {
            const maximo = Math.max(...datos.map(d => d.id));
            await Contador.findByIdAndUpdate(nombre, { valor: maximo }, { upsert: true });
        }

        console.log(`✔ ${nombre}: ${datos.length} documentos`);
    }

    await mongoose.disconnect();
    console.log("Listo.");
}

main().catch(async (error) => {
    console.error("Error en el seed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
});