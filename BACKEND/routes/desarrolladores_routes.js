const express = require("express");
const router = express.Router();

const desarrolladoresController = require("../controllers/desarrolladores_controller");

const { autenticarUsuario, requerirJugador } = require("../middlewares/auth_middleware");

router.get("/siguiendo", autenticarUsuario, requerirJugador, desarrolladoresController.listarSiguiendo);


router.get("/:id", desarrolladoresController.obtenerDesarrollador);


router.post("/:id/seguir", autenticarUsuario, requerirJugador, desarrolladoresController.seguirDesarrollador);
router.delete("/:id/seguir", autenticarUsuario, requerirJugador, desarrolladoresController.dejarDeSeguir);

module.exports = router;