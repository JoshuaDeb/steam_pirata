const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth_controller");

// Registrar un nuevo usuario
router.post("/register", authController.registrarUsuario);

// Iniciar sesión
router.post("/login", authController.iniciarSesion);

module.exports = router;
