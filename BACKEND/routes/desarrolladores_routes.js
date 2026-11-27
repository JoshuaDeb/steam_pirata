const express = require("express");
const router = express.Router();

const desarrolladoresController = require("../controllers/desarrolladores_controller");


router.get("/:id", desarrolladoresController.obtenerDesarrollador);

module.exports = router;