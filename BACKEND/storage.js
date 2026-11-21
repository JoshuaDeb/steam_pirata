const fs = require("fs");
const path = require("path");

// Leer datos de una colección JSON
function leerDatos(coleccion) {
    const ruta = path.join(__dirname, "data_temp", `${coleccion}.json`);

    const contenido = fs.readFileSync(ruta, "utf8");

    return JSON.parse(contenido);
}

// Guardar datos de una colección JSON
function guardarDatos(coleccion, datos) {
    const ruta = path.join(__dirname, "data_temp", `${coleccion}.json`);

    fs.writeFileSync(
        ruta,
        JSON.stringify(datos, null, 2),
        "utf8"
    );
}

module.exports = { leerDatos, guardarDatos };
