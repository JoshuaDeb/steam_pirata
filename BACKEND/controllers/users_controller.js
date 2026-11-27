const bcrypt = require("bcrypt");

const { getModel } = require("../storage");

const {
    leerId,
    contieneId,
    datosUsuario,
    transaccion
} = require("../utils/mongo_utils");

const {
    recalcularCalificaciones
} = require("../utils/calificaciones");

const Usuario = getModel("usuarios");
const Jugador = getModel("jugadores");
const Desarrollador = getModel("desarrolladores");
const Videojuego = getModel("videojuegos");
const Resena = getModel("resenas");
const Amistad = getModel("amistades");

// ---------- Datos de la cuenta ----------
async function actualizarNombre(req, res) {
    const id = leerId(req.params.id);
    const { nombre_usuario } = req.body || {};

    if (!id) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    if (
        typeof nombre_usuario !== "string" ||
        nombre_usuario.trim().length < 3 ||
        nombre_usuario.trim().length > 30
    ) {
        return res.status(400).json({
            message: "El nombre debe tener entre 3 y 30 caracteres"
        });
    }

    const nombre = nombre_usuario.trim();

    try {
        // Comprobar que el nombre no pertenezca a otro usuario
        const nombreExiste = await Usuario.exists({
            _id: { $ne: id },
            nombre_usuario: nombre
        }).collation({
            locale: "es",
            strength: 2
        });

        if (nombreExiste) {
            return res.status(409).json({
                message: "El nombre de usuario ya está registrado"
            });
        }

        const usuario = await Usuario.findByIdAndUpdate(
            id,
            { nombre_usuario: nombre },
            { new: true, runValidators: true }
        ).lean();

        if (!usuario) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        res.status(200).json({
            message: "Nombre actualizado correctamente",
            user: datosUsuario(usuario)
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "El nombre de usuario ya está registrado"
            });
        }

        console.error("Error al actualizar usuario:", error);

        res.status(500).json({
            message: "Error al actualizar el usuario"
        });
    }
}

async function actualizarCorreo(req, res) {
    const id = leerId(req.params.id);
    const { correo } = req.body || {};

    if (!id) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    if (typeof correo !== "string") {
        return res.status(400).json({
            message: "El correo electrónico no es válido"
        });
    }

    const email = correo.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
            message: "El correo electrónico no es válido"
        });
    }

    try {
        const correoExiste = await Usuario.exists({
            _id: { $ne: id },
            correo: email
        });

        if (correoExiste) {
            return res.status(409).json({
                message: "El correo electrónico ya está registrado"
            });
        }

        const usuario = await Usuario.findByIdAndUpdate(
            id,
            { correo: email },
            { new: true, runValidators: true }
        ).lean();

        if (!usuario) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        res.status(200).json({
            message: "Correo actualizado correctamente",
            user: datosUsuario(usuario)
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "El correo electrónico ya está registrado"
            });
        }

        console.error("Error al actualizar correo:", error);

        res.status(500).json({
            message: "Error al actualizar el correo electrónico"
        });
    }
}

async function actualizarDescripcion(req, res) {
    const id = leerId(req.params.id);

    const {
        descripcion_publica,
        favoritos_perfil
    } = req.body || {};

    if (!id) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    if (
        typeof descripcion_publica !== "string" ||
        descripcion_publica.trim().length < 1 ||
        descripcion_publica.trim().length > 300
    ) {
        return res.status(400).json({
            message: "La descripción debe tener entre 1 y 300 caracteres"
        });
    }

    try {
        const usuario = await Usuario.findById(id);

        if (!usuario) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        // Validar los videojuegos destacados
        if (favoritos_perfil !== undefined) {

            if (
                usuario.role !== "jugador" ||
                !Array.isArray(favoritos_perfil) ||
                favoritos_perfil.length !== 3
            ) {
                return res.status(400).json({
                    message: "La selección de favoritos no es válida"
                });
            }

            // Normalizar los ObjectId seleccionados
            const seleccion = [];

            for (const valor of favoritos_perfil) {
                if (valor === null) {
                    seleccion.push(null);
                    continue;
                }

                const idJuego = leerId(valor);

                if (!idJuego) {
                    return res.status(400).json({
                        message: "Identificador de videojuego inválido"
                    });
                }

                seleccion.push(idJuego);
            }

            const idsElegidos = seleccion.filter(
                idJuego => idJuego !== null
            );

            // Impedir videojuegos repetidos
            if (new Set(idsElegidos).size !== idsElegidos.length) {
                return res.status(400).json({
                    message: "Los videojuegos seleccionados deben ser distintos"
                });
            }

            // Solo destacar videojuegos adquiridos
            const biblioteca = usuario.atributos.biblioteca;

            if (
                !idsElegidos.every(idJuego =>
                    contieneId(biblioteca, idJuego)
                )
            ) {
                return res.status(400).json({
                    message: "Solo puedes destacar videojuegos de tu biblioteca"
                });
            }

            usuario.atributos.favoritos_perfil = seleccion;
        }

        usuario.descripcion_publica = descripcion_publica.trim();

        await usuario.save();

        res.status(200).json({
            message: "Descripción pública actualizada correctamente",
            user: {
                ...datosUsuario(usuario),

                favoritos_perfil:
                    usuario.role === "jugador" ? usuario.atributos.favoritos_perfil.map(id => id === null ? null : String(id)) : [null, null, null]
            }
        });

    } catch (error) {
        if (error.name === "VersionError") {
            return res.status(409).json({
                message: "El perfil fue modificado. Intenta nuevamente"
            });
        }

        console.error("Error al actualizar descripción:", error);

        res.status(500).json({
            message: "Error al actualizar la descripción pública"
        });
    }
}

async function cambiarContrasena(req, res) {
    const id = leerId(req.params.id);
    const { contrasena_actual, contrasena_nueva, confirmar_contrasena } = req.body || {};

    if (!id) {
        return res.status(400).json({ message: "Identificador de usuario inválido" });
    }

    if (
        typeof contrasena_actual !== "string" ||
        typeof contrasena_nueva !== "string" ||
        typeof confirmar_contrasena !== "string" ||
        !contrasena_actual ||
        !contrasena_nueva.trim() ||
        !confirmar_contrasena
    ) {
        return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    if (contrasena_nueva.length < 8) {
        return res.status(400).json({ message: "La nueva contraseña debe tener al menos 8 caracteres" });
    }

    if (contrasena_nueva !== confirmar_contrasena) {
        return res.status(400).json({ message: "Las nuevas contraseñas no coinciden" });
    }

    try {
        // passwordHash tiene select:false, hay que pedirlo
        const usuario = await Usuario.findById(id).select("+passwordHash");

        if (!usuario) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        if (!(await bcrypt.compare(contrasena_actual, usuario.passwordHash))) {
            return res.status(401).json({ message: "La contraseña actual es incorrecta" });
        }

        if (contrasena_actual === contrasena_nueva) {
            return res.status(400).json({ message: "La nueva contraseña debe ser diferente a la actual" });
        }

        usuario.passwordHash = await bcrypt.hash(contrasena_nueva, 10);
        await usuario.save();

        res.status(200).json({ message: "Contraseña actualizada correctamente" });
    } catch (error) {
        console.error("Error al cambiar contraseña:", error);
        res.status(500).json({ message: "Error al actualizar la contraseña" });
    }
}

async function eliminarCuenta(req, res) {
    const id = leerId(req.params.id);
    const { contrasena_actual, confirmacion } = req.body || {};

    if (!id) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    if (
        typeof contrasena_actual !== "string" ||
        !contrasena_actual
    ) {
        return res.status(400).json({
            message: "Debes introducir tu contraseña actual"
        });
    }

    if (confirmacion !== "ELIMINAR") {
        return res.status(400).json({
            message: "Debes escribir ELIMINAR para confirmar"
        });
    }

    try {
        const resultado = await transaccion(async (session) => {

            const usuario = await Usuario.findById(id)
                .select("+passwordHash")
                .session(session);

            if (!usuario) {
                return {
                    status: 404,
                    message: "Usuario no encontrado"
                };
            }

            if (!(await bcrypt.compare(
                contrasena_actual,
                usuario.passwordHash
            ))) {
                return {
                    status: 401,
                    message: "La contraseña actual es incorrecta"
                };
            }

            let totalRetirados = 0;

            if (usuario.role === "desarrollador") {

                // Retirar videojuegos sin eliminarlos
                const retiro = await Videojuego.updateMany(
                    {
                        id_desarrollador: id,
                        estado: "publicado"
                    },
                    {
                        $set: { estado: "retirado" }
                    },
                    { session }
                );

                totalRetirados = retiro.modifiedCount;

                // Eliminar al desarrollador de los jugadores que lo siguen
                await Jugador.updateMany(
                    {
                        "atributos.desarrolladores_seguidos": id
                    },
                    {
                        $pull: {
                            "atributos.desarrolladores_seguidos": id
                        }
                    },
                    { session }
                );

            } else {

                // Identificar los juegos reseñados
                const juegosResenados = await Resena.distinct(
                    "juego_id",
                    { usuario_id: id }
                ).session(session);

                // Eliminar sus reseñas
                await Resena.deleteMany(
                    { usuario_id: id },
                    { session }
                );

                // Eliminar amistades y solicitudes
                await Amistad.deleteMany(
                    {
                        $or: [
                            { solicitante_id: id },
                            { receptor_id: id }
                        ]
                    },
                    { session }
                );

                // Actualizar los contadores de seguidores
                const seguidos =
                    usuario.atributos.desarrolladores_seguidos;

                if (seguidos.length > 0) {
                    await Desarrollador.updateMany(
                        {
                            _id: { $in: seguidos },
                            "atributos.seguidor_count": { $gt: 0 }
                        },
                        {
                            $inc: {
                                "atributos.seguidor_count": -1
                            }
                        },
                        { session }
                    );
                }

                // Recalcular calificaciones afectadas
                await recalcularCalificaciones(
                    juegosResenados,
                    session
                );
            }

            // Eliminar finalmente el documento del usuario
            const eliminacion = await Usuario.deleteOne(
                { _id: id },
                { session }
            );

            if (eliminacion.deletedCount !== 1) {
                throw new Error("No se pudo eliminar el usuario");
            }

            const respuesta = {
                status: 200,
                message: "Cuenta eliminada correctamente"
            };

            if (usuario.role === "desarrollador") {
                respuesta.videojuegos_retirados = totalRetirados;
            }

            return respuesta;
        });

        const { status, ...respuesta } = resultado;

        res.status(status).json(respuesta);

    } catch (error) {
        console.error("Error al eliminar cuenta:", error);

        res.status(500).json({
            message: "Error al eliminar la cuenta"
        });
    }
}

async function obtenerUsuario(req, res) {
    const id = leerId(req.params.id);

    if (!id) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    try {
        const usuario = await Usuario.findById(id)
            .select(
                "nombre_usuario correo role creditos descripcion_publica foto_perfil"
            )
            .lean();

        if (!usuario) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        res.status(200).json({
            user: datosUsuario(usuario)
        });

    } catch (error) {
        console.error("Error al consultar el usuario:", error);

        res.status(500).json({
            message: "Error al consultar el usuario"
        });
    }
}


// ---------- Biblioteca y favoritos ----------
// Cada registro de bibliotecas y favoritos solo guarda dos referencias:
// { usuario_id, videojuego_id }. Se ordenan por _id para conservar el orden
// en que se agregaron.

async function armarJuegos(ids) {
    const videojuegos = await Videojuego.find({
        _id: { $in: ids }
    }).lean();

    const desarrolladores = await Desarrollador.find(
        {
            _id: {
                $in: videojuegos.map(
                    juego => juego.id_desarrollador
                )
            }
        },
        "nombre_usuario"
    ).lean();

    const juegosPorId = new Map(
        videojuegos.map(juego => [
            String(juego._id),
            juego
        ])
    );

    const nombresDesarrolladores = new Map(
        desarrolladores.map(usuario => [
            String(usuario._id),
            usuario.nombre_usuario
        ])
    );

    // Conservar el orden de adquisición o agregado
    return ids.map(id => {
        const juego = juegosPorId.get(String(id));

        if (!juego) return null;

        const resultado = {
            ...juego,
            id: String(juego._id),
            id_desarrollador: String(juego.id_desarrollador),
            desarrollador: nombresDesarrolladores.get(String(juego.id_desarrollador)) || "Desarrollador desconocido",
            portada: juego.portada ? `/api/videojuegos/${juego._id}/portada` : null,

            dlcs: (juego.dlcs || []).map(dlc => ({
                id: String(dlc._id),
                id_videojuego: String(juego._id),
                nombre: dlc.nombre,
                tipo_contenido: dlc.tipo_contenido,
                descripcion: dlc.descripcion
            }))
        };

        delete resultado._id;
        delete resultado.__v;

        return resultado;

    }).filter(Boolean);
}

// Leer un usuario jugador a partir del :id de la URL.
async function obtenerJugador(req, res) {
    const id = leerId(req.params.id);

    if (!id) {
        res.status(400).json({
            message: "Identificador de usuario inválido"
        });

        return null;
    }

    if (req.usuario.role !== "jugador") {
        res.status(403).json({
            message: "Solo los jugadores tienen biblioteca y favoritos"
        });

        return null;
    }

    const jugador = await Jugador.findById(id).select("creditos atributos.biblioteca atributos.favoritos atributos.favoritos_perfil").lean();

    if (!jugador) {
        res.status(404).json({
            message: "Usuario no encontrado"
        });

        return null;
    }

    return jugador;
}

async function listarBiblioteca(req, res) {
    try {
        const jugador = await obtenerJugador(req, res);

        if (!jugador) return;

        const videojuegos = await armarJuegos(
            jugador.atributos.biblioteca
        );

        res.status(200).json({
            total: videojuegos.length,
            videojuegos
        });

    } catch (error) {
        console.error("Error al consultar la biblioteca:", error);

        res.status(500).json({
            message: "Error al consultar la biblioteca"
        });
    }
}

// Adquirir un videojuego: lo agrega a la biblioteca y transfiere los créditos al desarrollador
async function agregarABiblioteca(req, res) {
    const idJuego = leerId(req.body?.videojuego_id);
    const idJugador = req.usuario.id;

    if (!idJuego) {
        return res.status(400).json({
            message: "Identificador de videojuego inválido"
        });
    }

    if (req.usuario.role !== "jugador") {
        return res.status(403).json({
            message: "Solo los jugadores pueden adquirir videojuegos"
        });
    }

    try {
        const resultado = await transaccion(async session => {

            // Consultar el videojuego dentro de la transacción
            const juego = await Videojuego.findById(idJuego)
                .select("precio_creditos estado id_desarrollador")
                .session(session)
                .lean();

            if (!juego) {
                return {
                    status: 404,
                    message: "Videojuego no encontrado"
                };
            }

            if (juego.estado !== "publicado") {
                return {
                    status: 409,
                    message: "Este videojuego ya no está disponible en el catálogo"
                };
            }

            // Consultar el jugador
            const jugador = await Jugador.findById(idJugador)
                .select("creditos atributos.biblioteca")
                .session(session)
                .lean();

            if (!jugador) {
                return {
                    status: 404,
                    message: "Jugador no encontrado"
                };
            }

            // Evitar adquisiciones duplicadas
            if (contieneId(jugador.atributos.biblioteca, idJuego)) {
                return {
                    status: 409,
                    message: "Ya tienes este videojuego en tu biblioteca"
                };
            }

            const precio = juego.precio_creditos;

            if (!Number.isSafeInteger(precio) || precio < 1) {
                throw new Error("Precio de videojuego inválido");
            }

            // Comprobar saldo
            if (jugador.creditos < precio) {
                return {
                    status: 409,
                    message: "No tienes créditos suficientes para adquirir este videojuego"
                };
            }

            // Descontar créditos y agregar a la biblioteca
            const jugadorActualizado = await Jugador.findOneAndUpdate(
                {
                    _id: idJugador,
                    creditos: { $gte: precio },
                    "atributos.biblioteca": { $ne: idJuego }
                },
                {
                    $inc: {
                        creditos: -precio,
                        __v: 1
                    },
                    $addToSet: {
                        "atributos.biblioteca": idJuego
                    }
                },
                {
                    new: true,
                    session,
                    runValidators: true
                }
            )
                .select(
                    "nombre_usuario correo role creditos descripcion_publica foto_perfil"
                )
                .lean();

            if (!jugadorActualizado) {
                return {
                    status: 409,
                    message: "No fue posible realizar la adquisición"
                };
            }

            // Transferir el 100% de los créditos al desarrollador
            const transferencia = await Desarrollador.updateOne(
                {
                    _id: juego.id_desarrollador
                },
                {
                    $inc: {
                        creditos: precio,
                        __v: 1
                    }
                },
                { session }
            );

            // Si el desarrollador no existe, revertir la transacción
            if (transferencia.matchedCount !== 1) {
                const error = new Error(
                    "El videojuego no tiene un desarrollador válido"
                );

                error.status = 409;

                throw error;
            }

            // Detectar cambios concurrentes en el videojuego
            const comprobacion = await Videojuego.updateOne(
                {
                    _id: idJuego,
                    estado: "publicado"
                },
                {
                    $inc: { __v: 1 }
                },
                { session }
            );

            if (comprobacion.matchedCount !== 1) {
                const error = new Error(
                    "El videojuego ya no está disponible"
                );

                error.status = 409;

                throw error;
            }

            return {
                status: 201,
                message: "Videojuego agregado a tu biblioteca",
                user: datosUsuario(jugadorActualizado)
            };
        });

        const { status, ...respuesta } = resultado;

        res.status(status).json(respuesta);

    } catch (error) {
        if (error.status === 409) {
            return res.status(409).json({
                message: error.message
            });
        }

        console.error("Error al adquirir videojuego:", error);

        res.status(500).json({
            message: "Error al adquirir el videojuego"
        });
    }
}

// Consultar los favoritos del usuario
async function listarFavoritos(req, res) {
    try {
        const jugador = await obtenerJugador(req, res);

        if (!jugador) return;

        const videojuegos = await armarJuegos(
            jugador.atributos.favoritos
        );

        const favoritosPerfil =
            jugador.atributos.favoritos_perfil;

        res.status(200).json({
            total: videojuegos.length,
            videojuegos,

            favoritos_perfil: favoritosPerfil.map(id => id === null ? null : String(id))
        });

    } catch (error) {
        console.error("Error al consultar favoritos:", error);

        res.status(500).json({
            message: "Error al consultar los favoritos"
        });
    }
}

// Agregar un videojuego a favoritos (no requiere haberlo adquirido)
async function agregarFavorito(req, res) {
    const idJuego = leerId(req.body?.videojuego_id);

    if (!idJuego) {
        return res.status(400).json({
            message: "Identificador de videojuego inválido"
        });
    }

    try {
        const jugador = await obtenerJugador(req, res);

        if (!jugador) return;

        if (!(await Videojuego.exists({ _id: idJuego }))) {
            return res.status(404).json({
                message: "Videojuego no encontrado"
            });
        }

        // Agregar solamente si todavía no existe
        const resultado = await Jugador.updateOne(
            {
                _id: jugador._id,
                "atributos.favoritos": { $ne: idJuego }
            },
            {
                $addToSet: {
                    "atributos.favoritos": idJuego
                },
                $inc: { __v: 1 }
            },
            { runValidators: true }
        );

        if (resultado.matchedCount === 0) {
            return res.status(200).json({
                message: "El videojuego ya estaba en tus favoritos"
            });
        }

        res.status(201).json({
            message: "Videojuego agregado a favoritos"
        });

    } catch (error) {
        console.error("Error al agregar favorito:", error);

        res.status(500).json({
            message: "Error al agregar a favoritos"
        });
    }
}

// Quitar un videojuego de favoritos
async function eliminarFavorito(req, res) {
    const idJuego = leerId(req.params.juegoId);

    if (!idJuego) {
        return res.status(400).json({
            message: "Identificador de videojuego inválido"
        });
    }

    try {
        const jugador = await obtenerJugador(req, res);

        if (!jugador) return;

        const resultado = await Jugador.updateOne(
            {
                _id: jugador._id,
                "atributos.favoritos": idJuego
            },
            {
                $pull: {
                    "atributos.favoritos": idJuego
                },
                $inc: { __v: 1 }
            }
        );

        if (resultado.matchedCount === 0) {
            return res.status(404).json({
                message: "El videojuego no está en tus favoritos"
            });
        }

        res.status(200).json({
            message: "Videojuego quitado de favoritos"
        });

    } catch (error) {
        console.error("Error al quitar favorito:", error);

        res.status(500).json({
            message: "Error al quitar de favoritos"
        });
    }
}


module.exports = {
    actualizarNombre,
    actualizarCorreo,
    actualizarDescripcion,
    cambiarContrasena,
    eliminarCuenta,
    obtenerUsuario,
    listarBiblioteca,
    agregarABiblioteca,
    listarFavoritos,
    agregarFavorito,
    eliminarFavorito
};
