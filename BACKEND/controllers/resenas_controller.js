const { leerDatos, guardarDatos } = require("../storage");


// Créditos que se ganan por la primera reseña de cada videojuego de la biblioteca
const PREMIO_RESENA = 10;

function validarResena(estrellas, texto) {
    if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
        return "Elige de 1 a 5 estrellas";
    }

    if (typeof texto !== "string" || texto.trim().length < 5) {
        return "La reseña debe tener al menos 5 caracteres";
    }

    if (texto.trim().length > 500) {
        return "La reseña no puede pasar de 500 caracteres";
    }

    return null; 
}


// Recalcular la calificación promedio de los videojuegos a partir de las reseñas.
// Se guarda en cada videojuego (calificacion_promedio y total_resenas) para que
// el catálogo la pueda mostrar, filtrar y ordenar sin recorrer las reseñas.
// Si el videojuego no tiene reseñas, el promedio queda en null.
function recalcularCalificaciones() {
    const resenas = leerDatos("resenas");
    const videojuegos = leerDatos("videojuegos");

    let cambio = false;

    videojuegos.forEach(juego => {
        const delJuego = resenas.filter(resena => resena.juego_id === juego.id);

        const total = delJuego.length;
        const promedio = total > 0
            ? Math.round(delJuego.reduce((suma, resena) => suma + resena.estrellas, 0) / total * 10) / 10
            : null;

        if (juego.total_resenas !== total || juego.calificacion_promedio !== promedio) {
            juego.total_resenas = total;
            juego.calificacion_promedio = promedio;
            cambio = true;
        }
    });

    if (cambio) {
        guardarDatos("videojuegos", videojuegos);
    }

    return videojuegos;
}

// Calificación actual de un videojuego (para devolverla en las respuestas)
function calificacionDe(videojuegos, juegoId) {
    const juego = videojuegos.find(item => item.id === juegoId);

    return {
        calificacion_promedio: juego ? juego.calificacion_promedio : null,
        total_resenas: juego ? juego.total_resenas : 0
    };
}


function listarResenas(req, res) {
    const juegoId = Number(req.query.juego_id);
    const usuarioId = Number(req.query.usuario_id);

    let resenas = leerDatos("resenas");
    const usuarios = leerDatos("usuarios");
    const videojuegos = leerDatos("videojuegos");

    if (juegoId) {
        resenas = resenas.filter(resena => resena.juego_id === juegoId);
    }

    if (usuarioId) {
        resenas = resenas.filter(resena => resena.usuario_id === usuarioId);
    }

    const resultado = resenas.map(resena => {
        const autor = usuarios.find(usuario => usuario.id === resena.usuario_id);
        const juego = videojuegos.find(videojuego => videojuego.id === resena.juego_id);

        return {
            ...resena,
            nombre_usuario: autor ? autor.nombre_usuario : "Usuario eliminado",
            titulo_juego: juego ? juego.titulo : "Juego eliminado"
        };
    });

    res.status(200).json({ resenas: resultado });
}



function crearResena(req, res) {
    const usuarioId = Number(req.body.usuario_id);
    const juegoId = Number(req.body.juego_id);
    const estrellas = Number(req.body.estrellas);
    const texto = req.body.texto;

    const error = validarResena(estrellas, texto);

    if (error) {
        return res.status(400).json({ message: error });
    }

    const resenas = leerDatos("resenas");
    const usuarios = leerDatos("usuarios");
    const videojuegos = leerDatos("videojuegos");

    const usuario = usuarios.find(u => u.id === usuarioId);

    if (!usuario || usuario.role !== "jugador") {
        return res.status(403).json({ message: "Solo los jugadores pueden escribir reseñas" });
    }

    if (!videojuegos.some(juego => juego.id === juegoId)) {
        return res.status(404).json({ message: "El videojuego no existe" });
    }


    // Solo se pueden reseñar los videojuegos adquiridos (los de la biblioteca)
    const adquirido = leerDatos("bibliotecas").some(registro =>
        registro.usuario_id === usuarioId && registro.videojuego_id === juegoId
    );

    if (!adquirido) {
        return res.status(403).json({
            message: "Solo puedes reseñar los videojuegos de tu biblioteca"
        });
    }

    const yaExiste = resenas.some(resena =>
        resena.usuario_id === usuarioId && resena.juego_id === juegoId
    );

    if (yaExiste) {
        return res.status(409).json({ message: "Ya escribiste una reseña de este juego" });
    }


    const nuevoId = resenas.length > 0
        ? Math.max(...resenas.map(resena => resena.id)) + 1
        : 1;

    const nuevaResena = {
        id: nuevoId,
        usuario_id: usuarioId,
        juego_id: juegoId,
        estrellas: estrellas,
        texto: texto.trim(),
        fecha: new Date().toISOString()
    };

    resenas.push(nuevaResena);
    guardarDatos("resenas", resenas);

    // Actualizar el promedio del videojuego
    const actualizados = recalcularCalificaciones();

    // Premio por la primera reseña del videojuego. Los juegos premiados se
    // guardan en el usuario (resenas_premiadas) para que borrar la reseña y
    // volver a escribirla no entregue el premio otra vez.
    const premiadas = Array.isArray(usuario.resenas_premiadas) ? usuario.resenas_premiadas : [];
    let premio = 0;

    if (!premiadas.includes(juegoId)) {
        premio = PREMIO_RESENA;
        usuario.creditos += premio;
        usuario.resenas_premiadas = [...premiadas, juegoId];

        guardarDatos("usuarios", usuarios);
    }

    res.status(201).json({
        message: premio > 0
            ? `Reseña publicada. ¡Ganaste ${premio} créditos!`
            : "Reseña publicada",
        resena: nuevaResena,
        premio: premio,
        creditos: usuario.creditos,
        ...calificacionDe(actualizados, juegoId)
    });
}



function actualizarResena(req, res) {
    const id = Number(req.params.id);
    const usuarioId = Number(req.body.usuario_id);
    const estrellas = Number(req.body.estrellas);
    const texto = req.body.texto;

    const error = validarResena(estrellas, texto);

    if (error) {
        return res.status(400).json({ message: error });
    }

    const resenas = leerDatos("resenas");
    const resena = resenas.find(r => r.id === id);

    if (!resena) {
        return res.status(404).json({ message: "Reseña no encontrada" });
    }

    if (resena.usuario_id !== usuarioId) {
        return res.status(403).json({ message: "Solo puedes editar tus propias reseñas" });
    }

    resena.estrellas = estrellas;
    resena.texto = texto.trim();
    resena.fecha = new Date().toISOString();

    guardarDatos("resenas", resenas);

    const actualizados = recalcularCalificaciones();

    res.status(200).json({
        message: "Reseña actualizada",
        resena: resena,
        ...calificacionDe(actualizados, resena.juego_id)
    });
}



function eliminarResena(req, res) {
    const id = Number(req.params.id);
    const usuarioId = Number(req.body.usuario_id);

    const resenas = leerDatos("resenas");
    const resena = resenas.find(r => r.id === id);

    if (!resena) {
        return res.status(404).json({ message: "Reseña no encontrada" });
    }

    if (resena.usuario_id !== usuarioId) {
        return res.status(403).json({ message: "Solo puedes borrar tus propias reseñas" });
    }

    const restantes = resenas.filter(r => r.id !== id);
    guardarDatos("resenas", restantes);

    const actualizados = recalcularCalificaciones();

    res.status(200).json({
        message: "Reseña eliminada",
        ...calificacionDe(actualizados, resena.juego_id)
    });
}

// ---------- DESARROLLADOR: ver y responder reseñas de sus juegos ----------
// req.usuario lo llena requerirDesarrollador

// LEER: las reseñas de los juegos de este desarrollador
function listarResenasDesarrollador(req, res) {
    const videojuegos = leerDatos("videojuegos");
    const usuarios = leerDatos("usuarios");

    // IDs de los juegos de este desarrollador
    const misJuegos = videojuegos
        .filter(juego => juego.id_desarrollador === req.usuario.id)
        .map(juego => juego.id);

    const resenas = leerDatos("resenas")
        .filter(resena => misJuegos.includes(resena.juego_id))
        .map(resena => {
            const autor = usuarios.find(usuario => usuario.id === resena.usuario_id);
            const juego = videojuegos.find(videojuego => videojuego.id === resena.juego_id);

            return {
                ...resena,
                nombre_usuario: autor ? autor.nombre_usuario : "Usuario eliminado",
                titulo_juego: juego.titulo
            };
        });

    res.status(200).json({ resenas: resenas });
}


// RESPONDER una reseña (si ya tenía respuesta, se reemplaza)
function responderResena(req, res) {
    const id = Number(req.params.id);
    const texto = req.body?.texto;

    if (typeof texto !== "string" || !texto.trim()) {
        return res.status(400).json({ message: "Escribe una respuesta" });
    }

    if (texto.trim().length > 500) {
        return res.status(400).json({ message: "La respuesta no puede pasar de 500 caracteres" });
    }

    const resenas = leerDatos("resenas");
    const videojuegos = leerDatos("videojuegos");

    const resena = resenas.find(r => r.id === id);

    if (!resena) {
        return res.status(404).json({ message: "Reseña no encontrada" });
    }

    // Revisar que la reseña sea de un juego de este desarrollador
    const juego = videojuegos.find(j => j.id === resena.juego_id);

    if (!juego || juego.id_desarrollador !== req.usuario.id) {
        return res.status(403).json({ message: "Solo puedes responder reseñas de tus juegos" });
    }

    resena.respuesta = texto.trim();
    guardarDatos("resenas", resenas);

    res.status(200).json({ message: "Respuesta guardada", resena: resena });
}

module.exports = {
    recalcularCalificaciones,
    listarResenas, crearResena, actualizarResena, eliminarResena,
    listarResenasDesarrollador, responderResena
};