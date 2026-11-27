// 1 crédito = $10 MXN. Stripe trabaja en centavos ($100.00 = 10000).
const PAQUETES = [
    { creditos: 10,  precio_centavos: 10000 },
    { creditos: 20,  precio_centavos: 20000 },
    { creditos: 50,  precio_centavos: 50000 },
    { creditos: 100, precio_centavos: 100000 },
    { creditos: 200, precio_centavos: 200000 }
];

function buscarPaquete(creditos) {
    return PAQUETES.find(p => p.creditos === creditos) || null;
}

module.exports = { PAQUETES, buscarPaquete };