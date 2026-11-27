const express = require("express");
const router = express.Router();

const dlcsController = require("../controllers/dlcs_controller");

const {autenticarUsuario, requerirDesarrollador } = require("../middlewares/auth_middleware");

// Consultar los DLC (opcionalmente de un videojuego)
router.get("/", dlcsController.listarDlcs);

// Consultar un DLC
router.get("/:id", dlcsController.obtenerDlc);

// Agregar un DLC a un videojuego
router.post("/", autenticarUsuario, requerirDesarrollador, dlcsController.crearDlc);

// Actualizar un DLC
router.put("/:id", autenticarUsuario, requerirDesarrollador, dlcsController.actualizarDlc);

// Eliminar un DLC
router.delete("/:id", autenticarUsuario, requerirDesarrollador, dlcsController.eliminarDlc);

module.exports = router;
