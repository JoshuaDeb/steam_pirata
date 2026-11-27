const stripe = require("../config/stripe");
const { getModel } = require("../storage");
const { leerId, mismoId } = require("../utils/mongo_utils");
const { PAQUETES, buscarPaquete } = require("../config/paquetes");
const Jugador = getModel("jugadores");

// ---------- Historial de compras ----------
// GET /api/compras
async function listarCompras(req, res) {
    try {
        const jugador = await Jugador.findById(req.usuario.id).select("atributos.compras").lean();

        if (!jugador) {
            return res.status(404).json({
                message: "Jugador no encontrado"
            });
        }

        const compras = (jugador.atributos.compras || [])
            .map(compra => ({
                id: String(compra._id),
                usuario_id: String(jugador._id),
                creditos: compra.creditos,
                monto: compra.monto,
                metodo: compra.metodo,
                fecha: compra.fecha
            })).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        res.status(200).json({ compras });

    } catch (error) {
        console.error("Error al listar compras:", error);
        res.status(500).json({
            message: "Error al consultar el historial"
        });
    }
}


// ---------- Paquetes disponibles ----------
// GET /api/compras/paquetes
function listarPaquetes(req, res) {
    res.status(200).json({
        paquetes: PAQUETES
    });
}

// ---------- Stripe Checkout ----------
// POST /api/compras/checkout
async function crearSesionCheckout(req, res) {
    const paquete = buscarPaquete(Number(req.body?.paquete));

    if (!paquete) {
        return res.status(400).json({
            message: "Elige un paquete de créditos válido"
        });
    }

    try {
        const sesion = await stripe.checkout.sessions.create({
            mode: "payment",
            allowed_payment_method_types: ["card"],
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: "mxn",
                    unit_amount: paquete.precio_centavos,
                    product_data: {
                        name: `${paquete.creditos} créditos SteamPirata`
                    }
                }
            }],
            customer_email: req.usuario.correo,
            client_reference_id: String(req.usuario.id),
            metadata: {
                aplicacion: "SteamPirata",
                usuario_id: String(req.usuario.id),
                creditos: String(paquete.creditos)
            },
            success_url: `${process.env.FRONTEND_URL}/user_profile.html?pago=exito&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/user_profile.html?pago=cancelado`,
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60
        });
        res.status(201).json({
            url: sesion.url
        });

    } catch (error) {
        console.error("Error al crear sesión de Stripe:", error);
        res.status(502).json({
            message: "No se pudo iniciar el pago con Stripe"
        });
    }
}


// ---------- Acreditación de créditos ----------
async function acreditarCompra(sesionStripe) {
    const usuarioId = leerId(sesionStripe.metadata?.usuario_id);
    const paquete = buscarPaquete(Number(sesionStripe.metadata?.creditos));

    // Verificar que sea un pago de prueba
    // correspondiente a SteamPirata
    if (sesionStripe.livemode !== false || sesionStripe.mode !== "payment" || sesionStripe.payment_status !== "paid" || sesionStripe.metadata?.aplicacion !== "SteamPirata") {
        return;
    }

    // Verificar el usuario, paquete y monto pagado
    if (!usuarioId || !paquete || !mismoId(sesionStripe.client_reference_id, usuarioId) || sesionStripe.currency !== "mxn" || sesionStripe.amount_total !== paquete.precio_centavos
    ) {
        console.warn("Sesión de Stripe con datos inconsistentes:", sesionStripe.id);
        return;
    }

    // Preparar el subdocumento de la compra
    const compra = {
        creditos: paquete.creditos,
        monto: sesionStripe.amount_total / 100,
        metodo: "card",
        stripe_session_id: sesionStripe.id,
        fecha: new Date()
    };

    // Incrementar el saldo y registrar la compra
    // únicamente si la sesión no fue acreditada antes
    const resultado = await Jugador.updateOne(
        {
            _id: usuarioId,

            "atributos.compras.stripe_session_id": {
                $ne: sesionStripe.id
            }
        },
        {
            $inc: {
                creditos: paquete.creditos,
                __v: 1
            },

            $push: {
                "atributos.compras": compra
            }
        },
        {
            runValidators: true
        }
    );

    if (resultado.modifiedCount === 1) {
        console.log("Créditos acreditados correctamente:", paquete.creditos);
        return;
    }

    // Distinguir una compra duplicada de una cuenta eliminada
    const jugadorExiste = await Jugador.exists({
        _id: usuarioId
    });

    if (!jugadorExiste) {
        console.warn("Pago de prueba de un usuario que ya no existe:", sesionStripe.id);
        return;
    }

    console.log("Compra previamente acreditada:", sesionStripe.id);
}


// ---------- Webhook de Stripe ----------
// POST /api/stripe/webhook
async function webhookStripe(req, res) {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        return res.status(503).json({
            message: "Webhook de Stripe no configurado"
        });
    }

    let evento;

    // Verificar la autenticidad del evento
    try {
        evento = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);

    } catch (error) {
        return res.status(400).json({
            message: "Firma de webhook inválida"
        });
    }

    // No procesar eventos de pagos reales
    if (evento.livemode !== false) {
        return res.status(400).json({
            message: "Solo se permiten eventos de prueba"
        });
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
                console.log("Sesión expirada:", sesion.id);
                break;
        }

        res.status(200).json({
            received: true
        });

    } catch (error) {
        console.error("Error al procesar webhook:", error);

        // Stripe podrá reintentar la entrega del evento
        res.status(500).end();
    }
}

// ---------- Consultar estado del pago ----------
// GET /api/compras/checkout/:sessionId
async function estadoSesion(req, res) {
    const { sessionId } = req.params;

    if (!/^cs_test_[A-Za-z0-9]+$/.test(sessionId)) {
        return res.status(400).json({
            message: "Sesión inválida"
        });
    }

    try {
        const sesion = await stripe.checkout.sessions.retrieve(sessionId);

        if (sesion.livemode !== false || sesion.metadata?.aplicacion !== "SteamPirata" || !mismoId(sesion.metadata?.usuario_id, req.usuario.id)) {
            return res.status(403).json({
                message: "Esta sesión no te pertenece"
            });
        }

        const jugador = await Jugador.findById(req.usuario.id).select("creditos atributos.compras").lean();

        if (!jugador) {
            return res.status(404).json({
                message: "Jugador no encontrado"
            });
        }

        const acreditada = (jugador.atributos.compras || []).some(compra => compra.stripe_session_id === sessionId);

        let estado;

        if (acreditada) {
            estado = "acreditada";
        } else if (sesion.payment_status === "paid") {
            estado = "procesando";
        } else if (sesion.status === "complete") {
            estado = "pendiente";
        } else if (sesion.status === "expired") {
            estado = "expirada";
        } else {
            estado = "fallida";
        }

        res.status(200).json({
            estado,
            creditos: Number(sesion.metadata.creditos),
            saldo: jugador.creditos
        });

    } catch (error) {

        if (error.code === "resource_missing") {
            return res.status(404).json({
                message: "Sesión de pago no encontrada"
            });
        }

        console.error(
            "Error al consultar la sesión de Stripe:",
            error
        );

        res.status(500).json({
            message: "No se pudo verificar el pago"
        });
    }
}

module.exports = { listarCompras, listarPaquetes, crearSesionCheckout, webhookStripe, estadoSesion };