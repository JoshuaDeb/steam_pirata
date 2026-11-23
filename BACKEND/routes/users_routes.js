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

// Consultar la biblioteca del usuario
router.get("/:id/library", usersController.listarBiblioteca);

// Adquirir un videojuego (agregarlo a la biblioteca)
router.post("/:id/library", usersController.agregarABiblioteca);

// Consultar los favoritos del usuario
router.get("/:id/favorites", usersController.listarFavoritos);

// Agregar un videojuego a favoritos
router.post("/:id/favorites", usersController.agregarFavorito);

// Quitar un videojuego de favoritos
router.delete("/:id/favorites/:juegoId", usersController.eliminarFavorito);

// Eliminar cuenta de usuario
router.delete("/:id", usersController.eliminarCuenta);

module.exports = router;