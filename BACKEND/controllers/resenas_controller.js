const { leerDatos, guardarDatos } = require("../storage");


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

    res.status(201).json({ message: "Reseña publicada", resena: nuevaResena });
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

    res.status(200).json({ message: "Reseña actualizada", resena: resena });
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

    res.status(200).json({ message: "Reseña eliminada" });
}

module.exports = { listarResenas, crearResena, actualizarResena, eliminarResena };