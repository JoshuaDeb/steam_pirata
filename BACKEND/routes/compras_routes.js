const express = require("express");
const router = express.Router();

const comprasController = require("../controllers/compras_controller");
const { autenticarUsuario, requerirJugador } = require("../middlewares/auth_middleware");

// Todas las rutas requieren un jugador autenticado
router.use(autenticarUsuario);
router.use(requerirJugador);

// Historial de compras
router.get("/", comprasController.listarCompras);

// Paquetes disponibles
router.get("/paquetes", comprasController.listarPaquetes);

// Iniciar pago con Stripe Checkout
router.post("/checkout", comprasController.crearSesionCheckout);

// Consultar el estado de un pago
router.get("/checkout/:sessionId", comprasController.estadoSesion);

module.exports = router;