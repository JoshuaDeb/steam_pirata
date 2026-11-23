const express = require("express");
const router = express.Router();

const resenasController = require("../controllers/resenas_controller");
const { requerirDesarrollador } = require("../controllers/auth_controller");

router.get("/desarrollador", requerirDesarrollador, resenasController.listarResenasDesarrollador);
router.put("/:id/respuesta", requerirDesarrollador, resenasController.responderResena);

router.get("/", resenasController.listarResenas);


router.post("/", resenasController.crearResena);


router.put("/:id", resenasController.actualizarResena);


router.delete("/:id", resenasController.eliminarResena);

module.exports = router;