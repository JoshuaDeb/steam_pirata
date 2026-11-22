const bcrypt = require("bcrypt");
const { leerDatos, guardarDatos } = require("../storage");

function registrarUsuario(req, res) {
    const { nombre_usuario, correo, contrasena, role } = req.body;

    if (
        typeof nombre_usuario !== "string" ||
        typeof correo !== "string" ||
        typeof contrasena !== "string" ||
        typeof role !== "string" ||
        !nombre_usuario.trim() ||
        !correo.trim() ||
        !contrasena.trim()
    ) {
        return res.status(400).json({
            message: "Todos los campos son obligatorios"
        });
    }

    const nombre = nombre_usuario.trim();
    const email = correo.trim().toLowerCase();

    if (nombre.length < 3 || nombre.length > 30) {
        return res.status(400).json({
            message: "El nombre debe tener entre 3 y 30 caracteres"
        });
    }

    // Validar correo
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
            message: "El correo electrónico no es válido"
        });
    }

    // Validar contraseña
    if (contrasena.length < 8) {
        return res.status(400).json({
            message: "La contraseña debe tener al menos 8 caracteres"
        });
    }

    // Validar rol
    if (role !== "jugador" && role !== "desarrollador") {
        return res.status(400).json({
            message: "El rol seleccionado no es válido"
        });
    }

    let usuarios;

    try {
        usuarios = leerDatos("usuarios");
    } catch (error) {
        console.error("Error al leer usuarios:", error);
        return res.status(500).json({
            message: "Error al consultar los usuarios"
        });
    }

    // Verificar correo duplicado
    const correoExiste = usuarios.some(usuario =>
        usuario.correo === email
    );

    if (correoExiste) {
        return res.status(409).json({
            message: "El correo electrónico ya está registrado"
        });
    }

    // Verificar nombre de usuario duplicado
    const nombreExiste = usuarios.some(usuario =>
        usuario.nombre_usuario.toLowerCase() === nombre.toLowerCase()
    );

    if (nombreExiste) {
        return res.status(409).json({
            message: "El nombre de usuario ya está registrado"
        });
    }

    const contadores = leerDatos("contadores");
    // Validar que el contador exista y sea correcto
    if (
        !contadores ||
        !Number.isSafeInteger(contadores.siguienteUsuarioId) ||
        contadores.siguienteUsuarioId < 1 ||
        contadores.siguienteUsuarioId >= Number.MAX_SAFE_INTEGER
    ) {
        return res.status(500).json({
            message: "Error en el contador de usuarios"
        });
    }

    // Obtener el siguiente ID disponible
    const idNuevo = contadores.siguienteUsuarioId;

    // Evitar conflictos con los usuarios existentes
    if (usuarios.some(user => user.id === idNuevo)) {
        return res.status(500).json({
            message: "El ID generado ya está en uso"
        });
    }

    // Reservar el ID antes de continuar con el registro
    contadores.siguienteUsuarioId = idNuevo + 1;
    guardarDatos("contadores", contadores);

    // Generar hash de la contraseña
    bcrypt.hash(contrasena, 10)
        .then(hash => {
            const nuevoUsuario = {
                id: idNuevo,
                nombre_usuario: nombre,
                correo: email,
                passwordHash: hash,
                role: role,
                creditos: role === "jugador" ? 100 : 0
            };

            usuarios.push(nuevoUsuario);
            guardarDatos("usuarios", usuarios);

            res.status(201).json({
                message: "Usuario registrado correctamente",
                user: {
                    id: nuevoUsuario.id,
                    nombre_usuario: nuevoUsuario.nombre_usuario,
                    correo: nuevoUsuario.correo,
                    role: nuevoUsuario.role,
                    creditos: nuevoUsuario.creditos
                }
            });
        })
        .catch(error => {
            console.error("Error al registrar usuario:", error);

            res.status(500).json({
                message: "Error al registrar usuario"
            });
        });
}


function iniciarSesion(req, res) {
    const { correo, contrasena } = req.body;

    // Validar campos obligatorios
    if (
        typeof correo !== "string" ||
        typeof contrasena !== "string" ||
        !correo.trim() ||
        !contrasena
    ) {
        return res.status(400).json({
            message: "Correo y contraseña son obligatorios"
        });
    }

    const email = correo.trim().toLowerCase();

    let usuarios;

    try {
        usuarios = leerDatos("usuarios");
    } catch (error) {
        console.error("Error al leer usuarios:", error);

        return res.status(500).json({
            message: "Error al consultar los usuarios"
        });
    }

    // Buscar usuario por correo
    const usuario = usuarios.find(user =>
        user.correo === email
    );

    // Validar que el usuario exista
    if (!usuario || !usuario.passwordHash) {
        return res.status(401).json({
            message: "Correo o contraseña incorrectos"
        });
    }

    // Comparar contraseña con el hash almacenado
    bcrypt.compare(contrasena, usuario.passwordHash)
        .then(coincide => {
            if (!coincide) {
                return res.status(401).json({
                    message: "Correo o contraseña incorrectos"
                });
            }

            // Credenciales correctas
            res.status(200).json({
                message: "Credenciales correctas",
                user: {
                    id: usuario.id,
                    nombre_usuario: usuario.nombre_usuario,
                    correo: usuario.correo,
                    role: usuario.role,
                    creditos: usuario.creditos,
                    descripcion_publica: usuario.descripcion_publica || ""
                }
            });
        })
        .catch(error => {
            console.error("Error al verificar contraseña:", error);

            res.status(500).json({
                message: "Error al iniciar sesión"
            });
        });
}

// Exige que quien hace la petición sea un desarrollador registrado.
// No vuelve a pedir credenciales: el frontend envía el id del usuario que ya
// inició sesión en el encabezado X-Usuario-Id y aquí solo se comprueba que
// exista y tenga el rol "desarrollador".
function requerirDesarrollador(req, res, next) {
    const id = Number(req.get("x-usuario-id"));

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(401).json({
            message: "Debes iniciar sesión para realizar esta acción"
        });
    }

    let usuarios;

    try {
        usuarios = leerDatos("usuarios");
    } catch (error) {
        console.error("Error al leer usuarios:", error);

        return res.status(500).json({
            message: "Error al consultar los usuarios"
        });
    }

    const usuario = usuarios.find(user => user.id === id);

    if (!usuario) {
        return res.status(401).json({
            message: "Debes iniciar sesión para realizar esta acción"
        });
    }

    if (usuario.role !== "desarrollador") {
        return res.status(403).json({
            message: "Solo los desarrolladores pueden realizar esta acción"
        });
    }

    req.usuario = {
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario,
        role: usuario.role
    };

    next();
}

module.exports = { registrarUsuario, iniciarSesion, requerirDesarrollador };