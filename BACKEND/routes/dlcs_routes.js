const express = require("express");
const router = express.Router();

const dlcsController = require("../controllers/dlcs_controller");
const { requerirDesarrollador } = require("../controllers/auth_controller");

// Consultar los DLC (opcionalmente de un videojuego)
router.get("/", dlcsController.listarDlcs);

// Consultar un DLC
router.get("/:id", dlcsController.obtenerDlc);

// Agregar un DLC a un videojuego
router.post("/", requerirDesarrollador, dlcsController.crearDlc);

// Actualizar un DLC
router.put("/:id", requerirDesarrollador, dlcsController.actualizarDlc);

// Eliminar un DLC
router.delete("/:id", requerirDesarrollador, dlcsController.eliminarDlc);

module.exports = router;
