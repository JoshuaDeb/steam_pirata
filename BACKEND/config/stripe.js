const Stripe = require("stripe");

const clave = process.env.STRIPE_SECRET_KEY;

if (!clave) {
    throw new Error("La variable STRIPE_SECRET_KEY no está configurada");
}

if (!clave.startsWith("sk_test_")) {
    throw new Error("SteamPirata solo permite claves de prueba de Stripe");
}

module.exports = new Stripe(clave);