const express = require("express");
const router = express.Router();

const videojuegosController = require("../controllers/videojuegos_controller");

const { autenticarUsuario, requerirDesarrollador } = require("../middlewares/auth_middleware");

// Consultar el catálogo (con filtros opcionales)
router.get("/", videojuegosController.listarVideojuegos);

// Consultar un videojuego
router.get("/:id", videojuegosController.obtenerVideojuego);

// Publicar un videojuego
router.post("/", autenticarUsuario, requerirDesarrollador, videojuegosController.crearVideojuego);

// Actualizar un videojuego
router.put("/:id", autenticarUsuario, requerirDesarrollador, videojuegosController.actualizarVideojuego);

// Retirar un videojuego del catálogo
router.delete("/:id", autenticarUsuario, requerirDesarrollador, videojuegosController.retirarVideojuego);

module.exports = router;