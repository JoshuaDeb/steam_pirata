const express = require("express");
const router = express.Router();

const resenasController = require("../controllers/resenas_controller");

const { autenticarUsuario, requerirJugador, requerirDesarrollador} = require("../middlewares/auth_middleware");

// Consultar las reseñas de los juegos del desarrollador
router.get("/desarrollador", autenticarUsuario, requerirDesarrollador, resenasController.listarResenasDesarrollador);

// Responder una reseña
router.put("/:id/respuesta", autenticarUsuario, requerirDesarrollador, resenasController.responderResena);

// Consultar reseñas públicas
router.get("/", resenasController.listarResenas);

// Crear una reseña
router.post("/", autenticarUsuario, requerirJugador, resenasController.crearResena);

// Actualizar una reseña
router.put("/:id", autenticarUsuario, requerirJugador, resenasController.actualizarResena);

// Eliminar una reseña
router.delete("/:id", autenticarUsuario, requerirJugador, resenasController.eliminarResena);

module.exports = router;