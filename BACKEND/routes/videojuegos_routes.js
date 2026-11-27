const express = require("express");
const router = express.Router();

const videojuegosController = require("../controllers/videojuegos_controller");

const { autenticarUsuario, requerirDesarrollador } = require("../middlewares/auth_middleware");

// Consultas públicas
router.get("/", videojuegosController.listarVideojuegos);
router.get("/:id/portada",videojuegosController.obtenerPortada);
router.get("/:id", videojuegosController.obtenerVideojuego);

// Operaciones protegidas
router.post("/", autenticarUsuario, requerirDesarrollador, videojuegosController.crearVideojuego);
router.put("/:id", autenticarUsuario, requerirDesarrollador, videojuegosController.actualizarVideojuego);
router.delete("/:id", autenticarUsuario, requerirDesarrollador, videojuegosController.retirarVideojuego);

module.exports = router;