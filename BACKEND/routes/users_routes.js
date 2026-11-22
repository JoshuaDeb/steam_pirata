const express = require("express");
const router = express.Router();

const usersController = require("../controllers/users_controller");

// Actualizar nombre de usuario
router.patch("/:id/name", usersController.actualizarNombre);

// Actualizar correo electrónico
router.patch("/:id/email", usersController.actualizarCorreo);

// Actualizar descripción pública
router.patch("/:id/description", usersController.actualizarDescripcion);

// Cambiar contraseña del usuario
router.patch("/:id/password", usersController.cambiarContrasena);

// Eliminar cuenta de usuario
router.delete("/:id", usersController.eliminarCuenta);

module.exports = router;