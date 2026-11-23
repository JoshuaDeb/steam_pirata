const express = require("express");
const router = express.Router();

const resenasController = require("../controllers/resenas_controller");


router.get("/", resenasController.listarResenas);


router.post("/", resenasController.crearResena);


router.put("/:id", resenasController.actualizarResena);


router.delete("/:id", resenasController.eliminarResena);

module.exports = router;