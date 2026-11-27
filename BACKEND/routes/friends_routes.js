const express = require("express");
const router = express.Router();

const friendsController = require("../controllers/friends_controller");

const { autenticarUsuario, requerirJugador } = require("../middlewares/auth_middleware");

// Todas las rutas requieren un jugador autenticado
router.use(autenticarUsuario);
router.use(requerirJugador);

// Buscar jugadores registrados
router.get("/search", friendsController.buscarJugadores);

// Enviar solicitud de amistad
router.post("/request", friendsController.enviarSolicitud);

// Consultar solicitudes recibidas y enviadas
router.get("/requests", friendsController.listarSolicitudes);

// Aceptar solicitud de amistad
router.patch("/request/:id/accept", friendsController.aceptarSolicitud);

// Rechazar o cancelar una solicitud pendiente
router.delete("/request/:id", friendsController.eliminarSolicitud);

// Consultar amistades aceptadas
router.get("/friends", friendsController.listarAmigos);

// Eliminar una amistad aceptada
router.delete("/friend/:id", friendsController.eliminarAmistad);

module.exports = router;