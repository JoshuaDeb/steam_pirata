const { leerDatos, guardarDatos } = require("../storage");

const PAQUETES = [10, 20, 50, 100, 200];
const METODOS = ["tarjeta", "paypal", "oxxo", "transferencia"];
const PRECIO_POR_CREDITO = 10;               // 1 crédito = $10 MXN


function listarCompras(req, res) {
    const usuarioId = req.usuario.id;
    const compras = leerDatos("compras")
        .filter(compra => compra.usuario_id === usuarioId)
        .reverse();

    res.status(200).json({ compras: compras });
}



function crearCompra(req, res) {
    const usuarioId = req.usuario.id;
    const paquete = Number(req.body.paquete);
    const metodo = req.body.metodo;

    if (!PAQUETES.includes(paquete)) {
        return res.status(400).json({ message: "Elige un paquete de créditos válido" });
    }

    if (!METODOS.includes(metodo)) {
        return res.status(400).json({ message: "Elige una forma de pago válida" });
    }

    const usuarios = leerDatos("usuarios");
    const usuario = usuarios.find(u => u.id === usuarioId);

    if (!usuario || usuario.role !== "jugador") {
        return res.status(403).json({ message: "Solo los jugadores pueden comprar créditos" });
    }

    const compras = leerDatos("compras");


    const nuevoId = compras.length > 0
        ? Math.max(...compras.map(compra => compra.id)) + 1
        : 1;

    const nuevaCompra = {
        id: nuevoId,
        usuario_id: usuarioId,
        creditos: paquete,
        monto: paquete * PRECIO_POR_CREDITO,
        metodo: metodo,
        fecha: new Date().toISOString()
    };


    usuario.creditos = usuario.creditos + paquete;

    compras.push(nuevaCompra);
    guardarDatos("compras", compras);
    guardarDatos("usuarios", usuarios);

    res.status(201).json({
        message: "Pago confirmado",
        compra: nuevaCompra,
        creditos: usuario.creditos
    });
}

module.exports = { listarCompras, crearCompra };