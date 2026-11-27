const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Usuario = require("../models/usuario");
const { siguienteId } = require("../models/contador");

// Generar token de autenticación
function generarToken(usuario) {
    return jwt.sign(
        { id: usuario.id, role: usuario.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
    );
}

// Datos del usuario que se envían al frontend (sin passwordHash)
function datosPublicos(usuario) {
    return {
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario,
        correo: usuario.correo,
        role: usuario.role,
        creditos: usuario.creditos,
        descripcion_publica: usuario.descripcion_publica || "",
        foto_perfil: usuario.foto_perfil || null
    };
}

async function registrarUsuario(req, res) {
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
        return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    const nombre = nombre_usuario.trim();
    const email = correo.trim().toLowerCase();

    if (nombre.length < 3 || nombre.length > 30) {
        return res.status(400).json({ message: "El nombre debe tener entre 3 y 30 caracteres" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "El correo electrónico no es válido" });
    }

    if (contrasena.length < 8) {
        return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
    }

    if (role !== "jugador" && role !== "desarrollador") {
        return res.status(400).json({ message: "El rol seleccionado no es válido" });
    }

    try {
        // Verificar correo duplicado
        if (await Usuario.exists({ correo: email })) {
            return res.status(409).json({ message: "El correo electrónico ya está registrado" });
        }

        // Verificar nombre duplicado (sin importar mayúsculas)
        const nombreExiste = await Usuario.findOne({ nombre_usuario: nombre })
            .collation({ locale: "es", strength: 2 })
            .lean();

        if (nombreExiste) {
            return res.status(409).json({ message: "El nombre de usuario ya está registrado" });
        }

        const hash = await bcrypt.hash(contrasena, 10);

        const nuevoUsuario = await Usuario.create({
            id: await siguienteId("usuarios"),
            nombre_usuario: nombre,
            correo: email,
            passwordHash: hash,
            role: role,
            creditos: role === "jugador" ? 100 : 0
        });

        // Iniciar sesión automáticamente
        res.status(201).json({
            message: "Usuario registrado correctamente",
            token: generarToken(nuevoUsuario),
            user: datosPublicos(nuevoUsuario)
        });
    } catch (error) {
        // Por si dos personas se registran con los mismos datos al mismo tiempo
        if (error.code === 11000) {
            const campo = Object.keys(error.keyPattern || {})[0];
            return res.status(409).json({
                message: campo === "correo"
                    ? "El correo electrónico ya está registrado"
                    : "El nombre de usuario ya está registrado"
            });
        }

        console.error("Error al registrar usuario:", error);
        res.status(500).json({ message: "Error al registrar usuario" });
    }
}

async function iniciarSesion(req, res) {
    const { correo, contrasena } = req.body;

    if (
        typeof correo !== "string" ||
        typeof contrasena !== "string" ||
        !correo.trim() ||
        !contrasena
    ) {
        return res.status(400).json({ message: "Correo y contraseña son obligatorios" });
    }

    try {
        // passwordHash tiene select:false, así que hay que pedirlo explícitamente
        const usuario = await Usuario.findOne({ correo: correo.trim().toLowerCase() })
            .select("+passwordHash")
            .lean();

        if (!usuario || !(await bcrypt.compare(contrasena, usuario.passwordHash))) {
            return res.status(401).json({ message: "Correo o contraseña incorrectos" });
        }

        res.status(200).json({
            message: "Credenciales correctas",
            token: generarToken(usuario),
            user: datosPublicos(usuario)
        });
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        res.status(500).json({ message: "Error al iniciar sesión" });
    }
}

module.exports = { registrarUsuario, iniciarSesion };