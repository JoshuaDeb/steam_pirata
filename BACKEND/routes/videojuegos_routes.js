const express = require("express");
const router = express.Router();

const videojuegosController = require("../controllers/videojuegos_controller");
const { requerirDesarrollador } = require("../controllers/auth_controller");

// Consultar el catálogo (con filtros opcionales)
router.get("/", videojuegosController.listarVideojuegos);

// Consultar un videojuego
router.get("/:id", videojuegosController.obtenerVideojuego);

// Publicar un videojuego
router.post("/", requerirDesarrollador, videojuegosController.crearVideojuego);

// Actualizar un videojuego
router.put("/:id", requerirDesarrollador, videojuegosController.actualizarVideojuego);

// Retirar un videojuego del catálogo
router.delete("/:id", requerirDesarrollador, videojuegosController.retirarVideojuego);

module.exports = router;
