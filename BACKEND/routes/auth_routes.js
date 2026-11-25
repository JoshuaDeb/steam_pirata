const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth_controller");
const { autenticarUsuario } = require("../middlewares/auth_middleware");

// Registrar un nuevo usuario
router.post("/register", authController.registrarUsuario);

// Iniciar sesión
router.post("/login", authController.iniciarSesion);

// Consultar el usuario autenticado
router.get("/me", autenticarUsuario, (req, res) => {
    res.status(200).json({
        user: req.usuario
    });
});

module.exports = router;