const { leerDatos, guardarDatos } = require("../storage");
const bcrypt = require("bcrypt");
const { recalcularCalificaciones } = require("./resenas_controller");

function actualizarNombre(req, res) {
    const id = Number(req.params.id);
    const { nombre_usuario } = req.body;

    // Validar identificador
    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    // Validar nombre de usuario
    if (typeof nombre_usuario !== "string" ||
        nombre_usuario.trim().length < 3 ||
        nombre_usuario.trim().length > 30) {
        return res.status(400).json({
            message: "El nombre debe tener entre 3 y 30 caracteres"
        });
    }

    const nombre = nombre_usuario.trim();

    try {
        const usuarios = leerDatos("usuarios");

        // Buscar el usuario por ID
        const usuario = usuarios.find(user => user.id === id);

        if (!usuario) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        // Comprobar que el nombre no esté ocupado
        const nombreExiste = usuarios.some(user =>
            user.id !== id &&
            user.nombre_usuario.toLowerCase() === nombre.toLowerCase()
        );

        if (nombreExiste) {
            return res.status(409).json({
                message: "El nombre de usuario ya está registrado"
            });
        }

        // Actualizar y guardar
        usuario.nombre_usuario = nombre;
        guardarDatos("usuarios", usuarios);

        res.status(200).json({
            message: "Nombre actualizado correctamente",
            user: {
                id: usuario.id,
                nombre_usuario: usuario.nombre_usuario,
                correo: usuario.correo,
                role: usuario.role,
                creditos: usuario.creditos
            }
        });

    } catch (error) {
        console.error("Error al actualizar usuario:", error);

        res.status(500).json({
            message: "Error al actualizar el usuario"
        });
    }
}

function actualizarCorreo(req, res) {
    const id = Number(req.params.id);
    const { correo } = req.body;

    // Validar identificador
    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    // Validar correo electrónico
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
        const usuarios = leerDatos("usuarios");

        // Buscar usuario
        const usuario = usuarios.find(user => user.id === id);

        if (!usuario) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        // Comprobar que el correo no pertenezca a otro usuario
        const correoExiste = usuarios.some(user =>
            user.id !== id &&
            user.correo.toLowerCase() === email
        );

        if (correoExiste) {
            return res.status(409).json({
                message: "El correo electrónico ya está registrado"
            });
        }

        // Actualizar correo
        usuario.correo = email;
        guardarDatos("usuarios", usuarios);

        res.status(200).json({
            message: "Correo actualizado correctamente",
            user: {
                id: usuario.id,
                nombre_usuario: usuario.nombre_usuario,
                correo: usuario.correo,
                role: usuario.role,
                creditos: usuario.creditos
            }
        });

    } catch (error) {
        console.error("Error al actualizar correo:", error);

        res.status(500).json({
            message: "Error al actualizar el correo electrónico"
        });
    }
}

function actualizarDescripcion(req, res) {
    const id = Number(req.params.id);
    const { descripcion_publica } = req.body;

    // Validar identificador
    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    // Validar descripción
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
        const usuarios = leerDatos("usuarios");

        // Buscar usuario
        const usuario = usuarios.find(user => user.id === id);

        if (!usuario) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        // Actualizar descripción
        usuario.descripcion_publica = descripcion_publica.trim();

        // Guardar cambios
        guardarDatos("usuarios", usuarios);

        res.status(200).json({
            message: "Descripción pública actualizada correctamente",
            user: {
                id: usuario.id,
                nombre_usuario: usuario.nombre_usuario,
                correo: usuario.correo,
                role: usuario.role,
                creditos: usuario.creditos,
                descripcion_publica: usuario.descripcion_publica
            }
        });

    } catch (error) {
        console.error("Error al actualizar descripción:", error);

        res.status(500).json({
            message: "Error al actualizar la descripción pública"
        });
    }
}

function cambiarContrasena(req, res) {
    const id = Number(req.params.id);

    const {
        contrasena_actual,
        contrasena_nueva,
        confirmar_contrasena
    } = req.body;

    // Validar identificador
    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    // Validar campos obligatorios
    if (
        typeof contrasena_actual !== "string" ||
        typeof contrasena_nueva !== "string" ||
        typeof confirmar_contrasena !== "string" ||
        !contrasena_actual ||
        !contrasena_nueva.trim() ||
        !confirmar_contrasena
    ) {
        return res.status(400).json({
            message: "Todos los campos son obligatorios"
        });
    }

    // Validar longitud de la nueva contraseña
    if (contrasena_nueva.length < 8) {
        return res.status(400).json({
            message: "La nueva contraseña debe tener al menos 8 caracteres"
        });
    }

    // Validar coincidencia de contraseñas
    if (contrasena_nueva !== confirmar_contrasena) {
        return res.status(400).json({
            message: "Las nuevas contraseñas no coinciden"
        });
    }

    try {
        const usuarios = leerDatos("usuarios");

        // Buscar usuario
        const usuario = usuarios.find(user => user.id === id);

        if (!usuario) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        if (!usuario.passwordHash) {
            return res.status(500).json({
                message: "No se pudo verificar la contraseña"
            });
        }

        // Verificar contraseña actual
        bcrypt.compare(contrasena_actual, usuario.passwordHash)
            .then(coincide => {
                if (!coincide) {
                    return res.status(401).json({
                        message: "La contraseña actual es incorrecta"
                    });
                }

                // Impedir reutilizar la contraseña actual
                if (contrasena_actual === contrasena_nueva) {
                    return res.status(400).json({
                        message: "La nueva contraseña debe ser diferente a la actual"
                    });
                }

                // Generar el hash de la nueva contraseña
                return bcrypt.hash(contrasena_nueva, 10)
                    .then(hash => {
                        usuario.passwordHash = hash;

                        // Guardar en usuarios.json
                        guardarDatos("usuarios", usuarios);

                        res.status(200).json({
                            message: "Contraseña actualizada correctamente"
                        });
                    });
            })
            .catch(error => {
                console.error("Error al cambiar contraseña:", error);

                res.status(500).json({
                    message: "Error al actualizar la contraseña"
                });
            });

    } catch (error) {
        console.error("Error al consultar usuarios:", error);

        res.status(500).json({
            message: "Error al consultar los usuarios"
        });
    }
}

function eliminarCuenta(req, res) {
    const id = Number(req.params.id);
    const { contrasena_actual, confirmacion } = req.body || {};

    // Validar identificador
    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    // Validar contraseña actual
    if (
        typeof contrasena_actual !== "string" ||
        !contrasena_actual
    ) {
        return res.status(400).json({
            message: "Debes introducir tu contraseña actual"
        });
    }

    // Validar confirmación
    if (confirmacion !== "ELIMINAR") {
        return res.status(400).json({
            message: "Debes escribir ELIMINAR para confirmar"
        });
    }

    try {
        const usuarios = leerDatos("usuarios");

        // Buscar al usuario
        const usuario = usuarios.find(user => user.id === id);

        if (!usuario) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        if (!usuario.passwordHash) {
            return res.status(500).json({
                message: "No se pudo verificar la contraseña"
            });
        }

        // Verificar la contraseña actual
        bcrypt.compare(contrasena_actual, usuario.passwordHash)
            .then(coincide => {
                if (!coincide) {
                    return res.status(401).json({
                        message: "La contraseña actual es incorrecta"
                    });
                }

                // La eliminación de desarrolladores requiere
                // integrar primero sus videojuegos publicados.
                if (usuario.role === "desarrollador") {
                    return res.status(409).json({
                        message: "La eliminación de desarrolladores estará disponible al integrar sus videojuegos"
                    });
                }

                // Leer las relaciones del usuario
                const bibliotecas = leerDatos("bibliotecas");
                const favoritos = leerDatos("favoritos");
                const resenas = leerDatos("resenas");
                const amistades = leerDatos("amistades");

                // Comprobar que todos los archivos sean arreglos
                if (!Array.isArray(bibliotecas) || !Array.isArray(favoritos) || !Array.isArray(resenas) || !Array.isArray(amistades)) {
                    throw new Error("Una colección tiene una estructura inválida");
                }

                // Preparar las colecciones sin los datos del usuario
                const bibliotecasActualizadas = bibliotecas.filter(registro => registro.usuario_id !== id);

                const favoritosActualizados = favoritos.filter(registro => registro.usuario_id !== id);

                const resenasActualizadas = resenas.filter(resena => resena.usuario_id !== id).map(resena => ({...resena, respuestas: Array.isArray(resena.respuestas) ? resena.respuestas.filter(respuesta => respuesta.usuario_id !== id) : resena.respuestas}));

                const amistadesActualizadas = amistades.filter(amistad => amistad.solicitante_id !== id && amistad.receptor_id !== id);

                const usuariosActualizados = usuarios.filter(registro => registro.id !== id);

                // Guardar relaciones actualizadas
                guardarDatos("bibliotecas", bibliotecasActualizadas);
                guardarDatos("favoritos", favoritosActualizados);
                guardarDatos("resenas", resenasActualizadas);

                // Las reseñas del usuario ya no cuentan en el promedio de los juegos
                recalcularCalificaciones();
                guardarDatos("amistades", amistadesActualizadas);

                // Eliminar físicamente al usuario al final
                guardarDatos("usuarios", usuariosActualizados);

                return res.status(200).json({
                    message: "Cuenta eliminada correctamente"
                });
            })
            .catch(error => {
                console.error("Error al eliminar cuenta:", error);

                return res.status(500).json({
                    message: "Error al eliminar la cuenta"
                });
            });

    } catch (error) {
        console.error("Error al consultar usuarios:", error);

        return res.status(500).json({
            message: "Error al consultar los usuarios"
        });
    }
}

// ---------- Biblioteca y favoritos ----------
// Cada registro de bibliotecas.json y favoritos.json solo guarda dos
// referencias: { usuario_id, videojuego_id }. El orden del arreglo conserva
// el orden en que se agregaron.

// Convertir un valor en un ID válido (entero positivo) o null
function leerIdPositivo(valor) {
    const id = Number(valor);

    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Datos públicos del usuario (sin passwordHash)
function usuarioPublico(usuario) {
    return {
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario,
        correo: usuario.correo,
        role: usuario.role,
        creditos: usuario.creditos,
        descripcion_publica: usuario.descripcion_publica || ""
    };
}

// Combinar los registros (solo IDs) con los datos del videojuego
function armarJuegos(registros, videojuegos, usuarios, dlcs) {
    return registros
        .map(registro => {
            const juego = videojuegos.find(item => item.id === registro.videojuego_id);

            if (!juego) return null;

            const desarrollador = usuarios.find(user => user.id === juego.id_desarrollador);

            return {
                ...juego,
                desarrollador: desarrollador
                    ? desarrollador.nombre_usuario
                    : "Desarrollador desconocido",
                dlcs: dlcs.filter(dlc => dlc.id_videojuego === juego.id)
            };
        })
        .filter(Boolean);
}

// Leer un usuario jugador a partir del :id de la URL.
// Devuelve { usuarios, usuario } o responde con el error y devuelve null.
function obtenerJugador(req, res) {
    const id = leerIdPositivo(req.params.id);

    if (id === null) {
        res.status(400).json({ message: "Identificador de usuario inválido" });
        return null;
    }

    const usuarios = leerDatos("usuarios");
    const usuario = usuarios.find(user => user.id === id);

    if (!usuario) {
        res.status(404).json({ message: "Usuario no encontrado" });
        return null;
    }

    if (usuario.role !== "jugador") {
        res.status(403).json({
            message: "Solo los jugadores tienen biblioteca y favoritos"
        });
        return null;
    }

    return { usuarios, usuario };
}

// Consultar la biblioteca del usuario
function listarBiblioteca(req, res) {
    try {
        const contexto = obtenerJugador(req, res);

        if (!contexto) return;

        const { usuarios, usuario } = contexto;

        const registros = leerDatos("bibliotecas")
            .filter(registro => registro.usuario_id === usuario.id);

        const videojuegos = armarJuegos(
            registros,
            leerDatos("videojuegos"),
            usuarios,
            leerDatos("dlcs")
        );

        res.status(200).json({ total: videojuegos.length, videojuegos });

    } catch (error) {
        console.error("Error al consultar la biblioteca:", error);

        res.status(500).json({ message: "Error al consultar la biblioteca" });
    }
}

// Adquirir un videojuego: lo agrega a la biblioteca y descuenta los créditos
function agregarABiblioteca(req, res) {
    const idJuego = leerIdPositivo(req.body?.videojuego_id);

    if (idJuego === null) {
        return res.status(400).json({
            message: "Identificador de videojuego inválido"
        });
    }

    try {
        const contexto = obtenerJugador(req, res);

        if (!contexto) return;

        const { usuarios, usuario } = contexto;

        const juego = leerDatos("videojuegos").find(item => item.id === idJuego);

        if (!juego) {
            return res.status(404).json({ message: "Videojuego no encontrado" });
        }

        if (juego.estado !== "publicado") {
            return res.status(409).json({
                message: "Este videojuego ya no está disponible en el catálogo"
            });
        }

        const bibliotecas = leerDatos("bibliotecas");

        const yaAdquirido = bibliotecas.some(registro =>
            registro.usuario_id === usuario.id &&
            registro.videojuego_id === idJuego
        );

        if (yaAdquirido) {
            return res.status(409).json({
                message: "Ya tienes este videojuego en tu biblioteca"
            });
        }

        if (usuario.creditos < juego.precio_creditos) {
            return res.status(409).json({
                message: "No tienes créditos suficientes para adquirir este videojuego"
            });
        }

        // Descontar créditos y agregar la referencia a la biblioteca
        usuario.creditos -= juego.precio_creditos;
        bibliotecas.push({ usuario_id: usuario.id, videojuego_id: idJuego });

        guardarDatos("bibliotecas", bibliotecas);
        guardarDatos("usuarios", usuarios);

        res.status(201).json({
            message: "Videojuego agregado a tu biblioteca",
            user: usuarioPublico(usuario)
        });

    } catch (error) {
        console.error("Error al agregar a la biblioteca:", error);

        res.status(500).json({ message: "Error al adquirir el videojuego" });
    }
}

// Consultar los favoritos del usuario
function listarFavoritos(req, res) {
    try {
        const contexto = obtenerJugador(req, res);

        if (!contexto) return;

        const { usuarios, usuario } = contexto;

        const registros = leerDatos("favoritos")
            .filter(registro => registro.usuario_id === usuario.id);

        const videojuegos = armarJuegos(
            registros,
            leerDatos("videojuegos"),
            usuarios,
            leerDatos("dlcs")
        );

        res.status(200).json({ total: videojuegos.length, videojuegos });

    } catch (error) {
        console.error("Error al consultar los favoritos:", error);

        res.status(500).json({ message: "Error al consultar los favoritos" });
    }
}

// Agregar un videojuego a favoritos (no requiere haberlo adquirido)
function agregarFavorito(req, res) {
    const idJuego = leerIdPositivo(req.body?.videojuego_id);

    if (idJuego === null) {
        return res.status(400).json({
            message: "Identificador de videojuego inválido"
        });
    }

    try {
        const contexto = obtenerJugador(req, res);

        if (!contexto) return;

        const { usuario } = contexto;

        const juego = leerDatos("videojuegos").find(item => item.id === idJuego);

        if (!juego) {
            return res.status(404).json({ message: "Videojuego no encontrado" });
        }

        const favoritos = leerDatos("favoritos");

        const yaFavorito = favoritos.some(registro =>
            registro.usuario_id === usuario.id &&
            registro.videojuego_id === idJuego
        );

        if (yaFavorito) {
            return res.status(200).json({
                message: "El videojuego ya estaba en tus favoritos"
            });
        }

        favoritos.push({ usuario_id: usuario.id, videojuego_id: idJuego });
        guardarDatos("favoritos", favoritos);

        res.status(201).json({ message: "Videojuego agregado a favoritos" });

    } catch (error) {
        console.error("Error al agregar favorito:", error);

        res.status(500).json({ message: "Error al agregar a favoritos" });
    }
}

// Quitar un videojuego de favoritos
function eliminarFavorito(req, res) {
    const idJuego = leerIdPositivo(req.params.juegoId);

    if (idJuego === null) {
        return res.status(400).json({
            message: "Identificador de videojuego inválido"
        });
    }

    try {
        const contexto = obtenerJugador(req, res);

        if (!contexto) return;

        const { usuario } = contexto;

        const favoritos = leerDatos("favoritos");

        const restantes = favoritos.filter(registro =>
            !(registro.usuario_id === usuario.id && registro.videojuego_id === idJuego)
        );

        if (restantes.length === favoritos.length) {
            return res.status(404).json({
                message: "El videojuego no está en tus favoritos"
            });
        }

        guardarDatos("favoritos", restantes);

        res.status(200).json({ message: "Videojuego quitado de favoritos" });

    } catch (error) {
        console.error("Error al quitar favorito:", error);

        res.status(500).json({ message: "Error al quitar de favoritos" });
    }
}


module.exports = {
    actualizarNombre,
    actualizarCorreo,
    actualizarDescripcion,
    cambiarContrasena,
    eliminarCuenta,
    listarBiblioteca,
    agregarABiblioteca,
    listarFavoritos,
    agregarFavorito,
    eliminarFavorito
};