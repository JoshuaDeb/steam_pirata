const Usuario = require("./models/usuario");
const Videojuego = require("./models/videojuego");
const Amistad = require("./models/amistad");
const Resena = require("./models/resena");

// Obtener los discriminadores del modelo Usuario
const Jugador = Usuario.discriminators.jugador;
const Desarrollador = Usuario.discriminators.desarrollador;

// ---------- Diccionario de modelos ----------

const modelos = {
    usuarios: Usuario,
    jugadores: Jugador,
    desarrolladores: Desarrollador,
    videojuegos: Videojuego,
    amistades: Amistad,
    resenas: Resena
};


// ---------- Obtener modelo ----------
function getModel(coleccion) {
    if (!Object.hasOwn(modelos, coleccion)) {
        throw new Error(`El modelo "${coleccion}" no existe`);
    }

    return modelos[coleccion];
}

module.exports = { getModel };