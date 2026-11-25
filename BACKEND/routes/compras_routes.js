const express = require("express");
const router = express.Router();

const comprasController = require("../controllers/compras_controller");

const { autenticarUsuario, requerirJugador } = require("../middlewares/auth_middleware");

// Todas las rutas requieren un jugador autenticado
router.use(autenticarUsuario);
router.use(requerirJugador);

// Consultar historial de compras
router.get("/", comprasController.listarCompras);

// Comprar créditos
router.post("/", comprasController.crearCompra);

module.exports = router;