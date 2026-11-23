const express = require("express");
const router = express.Router();

const comprasController = require("../controllers/compras_controller");


router.get("/", comprasController.listarCompras);


router.post("/", comprasController.crearCompra);

module.exports = router;