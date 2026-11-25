const jwt = require("jsonwebtoken");
const { leerDatos } = require("../storage");

// Verificar que el usuario esté autenticado
function autenticarUsuario(req, res, next) {
    const authorization = req.get("Authorization");

    // Verificar que se haya enviado un token
    if (!authorization || !authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            code: "AUTH_REQUIRED",
            message: "Debes iniciar sesión para realizar esta acción"
        });
    }

    // Extraer el token del encabezado
    const token = authorization.split(" ")[1];

    let datosToken;

    // Verificar la firma y vigencia del token
    try {
        datosToken = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ["HS256"]
        });
    } catch (error) {
        return res.status(401).json({
            code: "AUTH_REQUIRED",
            message: "Token inválido o expirado"
        });
    }

    let usuarios;

    // Consultar los usuarios registrados
    try {
        usuarios = leerDatos("usuarios");
    } catch (error) {
        console.error("Error al leer usuarios:", error);

        return res.status(500).json({
            message: "Error al consultar los usuarios"
        });
    }

    // Verificar que el usuario todavía exista
    const usuario = usuarios.find(user =>
        user.id === datosToken.id
    );

    if (!usuario) {
        return res.status(401).json({
            code: "AUTH_REQUIRED",
            message: "El usuario ya no existe"
        });
    }

    // Guardar la información del usuario autenticado
    req.usuario = {
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario,
        correo: usuario.correo,
        role: usuario.role,
        creditos: usuario.creditos,
        descripcion_publica: usuario.descripcion_publica || ""
    };

    // Continuar con la petición
    next();
}

// Verificar que el usuario solo pueda acceder a su propia cuenta
function requerirPropietario(req, res, next) {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: "Identificador de usuario inválido"
        });
    }

    if (req.usuario.id !== id) {
        return res.status(403).json({
            message: "No tienes permiso para realizar esta acción"
        });
    }

    next();
}

// Verificar que el usuario autenticado sea jugador
function requerirJugador(req, res, next) {
    if (req.usuario.role !== "jugador") {
        return res.status(403).json({
            message: "Esta acción solo está disponible para jugadores"
        });
    }

    next();
}

// Verificar que el usuario autenticado sea desarrollador
function requerirDesarrollador(req, res, next) {
    if (req.usuario.role !== "desarrollador") {
        return res.status(403).json({
            message: "Solo los desarrolladores pueden realizar esta acción"
        });
    }

    next();
}

module.exports = { autenticarUsuario, requerirPropietario, requerirJugador, requerirDesarrollador };