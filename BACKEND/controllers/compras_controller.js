const mongoose = require("mongoose");
const stripe = require("../config/stripe");
const Compra = require("../models/compra");
const Usuario = require("../models/usuario");
const { siguienteId } = require("../models/contador");
const { PAQUETES, buscarPaquete } = require("../config/paquetes");


// GET /api/compras → historial del jugador (más reciente primero)
async function listarCompras(req, res) {
    try {
        const compras = await Compra.find({ usuario_id: req.usuario.id })
            .sort({ fecha: -1 })
            .select("-_id")
            .lean();

        res.status(200).json({ compras });
    } catch (error) {
        console.error("Error al listar compras:", error);
        res.status(500).json({ message: "Error al consultar el historial" });
    }
}


// GET /api/compras/paquetes → paquetes y precios disponibles
function listarPaquetes(req, res) {
    res.status(200).json({ paquetes: PAQUETES });
}


// POST /api/compras/checkout → crea la sesión de Stripe Checkout
async function crearSesionCheckout(req, res) {
    const paquete = buscarPaquete(Number(req.body?.paquete));

    if (!paquete) {
        return res.status(400).json({ message: "Elige un paquete de créditos válido" });
    }

    try {
        const sesion = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: "mxn",
                    unit_amount: paquete.precio_centavos,
                    product_data: { name: `${paquete.creditos} créditos SteamPirata` }
                }
            }],
            customer_email: req.usuario.correo,
            client_reference_id: String(req.usuario.id),
            metadata: {
                usuario_id: String(req.usuario.id),
                creditos: String(paquete.creditos)
            },
            success_url: `${process.env.FRONTEND_URL}/user_profile.html?pago=exito&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/user_profile.html?pago=cancelado`,
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60   // expira en 30 minutos
        });

        res.status(201).json({ url: sesion.url });
    } catch (error) {
        console.error("Error al crear sesión de Stripe:", error);
        res.status(502).json({ message: "No se pudo iniciar el pago con Stripe" });
    }
}


// Acredita los créditos UNA sola vez por sesión de Stripe.
// La compra y la suma de créditos van en una transacción: o se guardan las dos o ninguna.
// El índice único de stripe_session_id impide registrar la misma sesión dos veces.
async function acreditarCompra(sesionStripe) {
    const paquete = buscarPaquete(Number(sesionStripe.metadata?.creditos));
    const usuarioId = Number(sesionStripe.metadata?.usuario_id);

    // Validar que lo cobrado coincida con el paquete
    if (!paquete ||
        !Number.isSafeInteger(usuarioId) ||
        sesionStripe.currency !== "mxn" ||
        sesionStripe.amount_total !== paquete.precio_centavos) {
        console.warn("Sesión de Stripe con datos inconsistentes:", sesionStripe.id);
        return;
    }

    // Si ya se registró, no hacer nada (Stripe puede mandar el mismo evento varias veces)
    if (await Compra.exists({ stripe_session_id: sesionStripe.id })) {
        return;
    }

    const sesionDb = await mongoose.startSession();

    try {
        const idCompra = await siguienteId("compras");

        await sesionDb.withTransaction(async () => {
            const resultado = await Usuario.updateOne(
                { id: usuarioId, role: "jugador" },
                { $inc: { creditos: paquete.creditos } },
                { session: sesionDb }
            );

            if (resultado.matchedCount === 0) {
                throw new Error("USUARIO_NO_EXISTE");
            }

            await Compra.create([{
                id: idCompra,
                usuario_id: usuarioId,
                creditos: paquete.creditos,
                monto: sesionStripe.amount_total / 100,
                metodo: sesionStripe.payment_method_types?.[0] || "card",
                stripe_session_id: sesionStripe.id,
                fecha: new Date()
            }], { session: sesionDb });
        });
    } catch (error) {
        if (error.code === 11000) return;   // otro aviso igual ya la registró

        if (error.message === "USUARIO_NO_EXISTE") {
            console.warn("Pago de un usuario que ya no existe:", sesionStripe.id);
            return;
        }

        throw error;   // → 500 y Stripe reintenta más tarde
    } finally {
        await sesionDb.endSession();
    }
}


// POST /api/stripe/webhook → ÚNICO lugar donde se suman créditos
async function webhookStripe(req, res) {
    let evento;

    // Verificar que el aviso realmente venga de Stripe
    try {
        evento = stripe.webhooks.constructEvent(
            req.body,
            req.get("stripe-signature"),
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        return res.status(400).send(`Firma de webhook inválida: ${error.message}`);
    }

    try {
        const sesion = evento.data.object;

        switch (evento.type) {
            case "checkout.session.completed":
            case "checkout.session.async_payment_succeeded":
                if (sesion.payment_status === "paid") {
                    await acreditarCompra(sesion);
                }
                break;

            case "checkout.session.async_payment_failed":
                console.log("Pago fallido:", sesion.id);
                break;

            case "checkout.session.expired":
                console.log("Sesión expirada sin pago:", sesion.id);
                break;
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error("Error al procesar webhook:", error);
        res.status(500).end();
    }
}


// GET /api/compras/checkout/:sessionId → el frontend pregunta cómo quedó el pago
async function estadoSesion(req, res) {
    const { sessionId } = req.params;

    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
        return res.status(400).json({ message: "Sesión inválida" });
    }

    try {
        const sesion = await stripe.checkout.sessions.retrieve(sessionId);

        if (sesion.metadata?.usuario_id !== String(req.usuario.id)) {
            return res.status(403).json({ message: "Esta sesión no te pertenece" });
        }

        const acreditada = await Compra.exists({ stripe_session_id: sessionId });
        const usuario = await Usuario.findOne({ id: req.usuario.id }, "creditos").lean();

        let estado;
        if (acreditada) estado = "acreditada";
        else if (sesion.payment_status === "paid") estado = "procesando";   // webhook en camino
        else if (sesion.status === "complete") estado = "pendiente";        // ej. OXXO sin pagar
        else if (sesion.status === "expired") estado = "expirada";
        else estado = "fallida";

        res.status(200).json({
            estado,
            creditos: Number(sesion.metadata.creditos),
            saldo: usuario ? usuario.creditos : null
        });
    } catch (error) {
        console.error("Error al consultar la sesión de Stripe:", error);
        res.status(500).json({ message: "No se pudo verificar el pago" });
    }
}

module.exports = { listarCompras, listarPaquetes, crearSesionCheckout, webhookStripe, estadoSesion };