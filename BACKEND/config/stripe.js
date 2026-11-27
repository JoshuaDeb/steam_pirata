const Stripe = require("stripe");

if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("La variable STRIPE_SECRET_KEY no está configurada");
}

module.exports = new Stripe(process.env.STRIPE_SECRET_KEY);