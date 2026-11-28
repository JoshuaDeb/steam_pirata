document.addEventListener("DOMContentLoaded", () => {

    const usuario = JSON.parse(sessionStorage.getItem("usuario"));

    if (!usuario || usuario.role !== "jugador") return;

    const el = (id) => document.getElementById(id);

    // Nombre visible de cada método de pago (los antiguos se conservan para el historial)
    const NOMBRES_METODO = {
        card: "Tarjeta (Stripe)",
        oxxo: "OXXO (Stripe)",
        tarjeta: "Tarjeta",
        paypal: "PayPal",
        transferencia: "Transferencia"
    };


    function formatoFecha(fecha) {
        return new Date(fecha).toLocaleDateString("es-MX", {
            day: "numeric", month: "short", year: "numeric"
        });
    }

    function paqueteElegido() {
        const radio = document.querySelector('input[name="paquete"]:checked');

        return radio ? Number(radio.id.replace("paq", "")) : null;
    }

    // Guardar el saldo nuevo en la sesión y mostrarlo en pantalla
    function actualizarSaldo(creditos) {
        usuario.creditos = creditos;
        sessionStorage.setItem("usuario", JSON.stringify(usuario));
        mostrarSaldo();
    }

    function mostrarSaldo() {
        el("saldoCreditos").textContent = usuario.creditos;
        el("creditosPerfil").textContent = `${usuario.creditos} créditos`;
    }

    // Consultar el saldo real en el servidor (pudo cambiar mientras el usuario estaba en Stripe)
    function refrescarSaldo() {
        apiFetch("/api/auth/me")
            .then((response) => response.ok ? response.json() : null)
            .then((datos) => {
                if (datos && datos.user) actualizarSaldo(datos.user.creditos);
            })
            .catch(() => { /* se conserva el saldo guardado */ });
    }


    // ---------- Historial de compras (5 por página) ----------

    const POR_PAGINA = 5;
    let compras = [];
    let pagina = 1;

    function cargarHistorial() {
        el("listaHistorial").innerHTML = `<div class="list-group-item fila-meta">
            <span class="spinner-border spinner-border-sm"></span> Cargando historial...</div>`;

        apiFetch("/api/compras")
            .then((response) => response.json())
            .then((datos) => {
                compras = datos.compras;
                pagina = 1;
                pintarHistorial();
            })
            .catch(() => {
                el("listaHistorial").innerHTML =
                    `<div class="list-group-item text-danger">No se pudo cargar el historial</div>`;
            });
    }

    function pintarHistorial() {
        if (compras.length === 0) {
            el("listaHistorial").innerHTML = `<div class="list-group-item fila-meta">
                Todavía no has comprado créditos.</div>`;
            el("paginacionHistorial").hidden = true;
            return;
        }

        const totalPaginas = Math.ceil(compras.length / POR_PAGINA);
        const inicio = (pagina - 1) * POR_PAGINA;
        const comprasDeLaPagina = compras.slice(inicio, inicio + POR_PAGINA);

        el("listaHistorial").innerHTML = comprasDeLaPagina.map((compra) => `
            <div class="list-group-item d-flex justify-content-between align-items-center gap-3">
                <div class="d-flex flex-column">
                    <span class="fila-valor">Compra de créditos · ${NOMBRES_METODO[compra.metodo] || "Stripe"}</span>
                    <span class="fila-meta">${formatoFecha(compra.fecha)} · $${compra.monto}.00 MXN</span>
                </div>
                <span class="movimiento-mas">+${compra.creditos}</span>
            </div>`).join("");

        el("paginacionHistorial").hidden = totalPaginas <= 1;
        el("textoPaginaHistorial").textContent = `Página ${pagina} de ${totalPaginas}`;
        el("btnHistorialAnterior").disabled = pagina === 1;
        el("btnHistorialSiguiente").disabled = pagina === totalPaginas;
    }

    el("btnHistorialAnterior").addEventListener("click", () => {
        pagina--;
        pintarHistorial();
    });

    el("btnHistorialSiguiente").addEventListener("click", () => {
        pagina++;
        pintarHistorial();
    });


    // ---------- Ir a Stripe Checkout ----------

    const btnPagar = el("btnPagarStripe");

    btnPagar.addEventListener("click", () => {
        const paquete = paqueteElegido();

        if (!paquete) {
            mostrarAviso("Elige un paquete de créditos", "danger");
            return;
        }

        btnPagar.disabled = true;
        btnPagar.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Redirigiendo a Stripe...`;

        apiFetch("/api/compras/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paquete: paquete })
        })
            .then((response) => response.json().then((datos) => {
                if (!response.ok) throw new Error(datos.message);


                window.location.href = datos.url;
            }))
            .catch((error) => {
                mostrarAviso(error.message || "No se pudo iniciar el pago", "danger");
                reiniciarBotonPago();
            });
    });

    

    function reiniciarBotonPago() {
        btnPagar.disabled = false;
        btnPagar.textContent = "Pagar con Stripe";
    }


    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            reiniciarBotonPago();
            refrescarSaldo();
        }
    });

    // ---------- Resultado al volver de Stripe ----------

    function mostrarResultado(titulo, texto) {
        el("tituloResultadoPago").textContent = titulo;
        el("textoResultadoPago").textContent = texto;
        bootstrap.Modal.getOrCreateInstance(el("modalResultadoPago")).show();
    }

    // Preguntar al backend si el webhook ya acreditó los créditos
    function verificarPago(sessionId, intento = 0) {
        apiFetch(`/api/compras/checkout/${encodeURIComponent(sessionId)}`)
            .then((response) => response.json())
            .then((datos) => {
                if (datos.estado === "acreditada") {
                    actualizarSaldo(datos.saldo);
                    cargarHistorial();
                    el("creditosAgregados").textContent = datos.creditos;
                    bootstrap.Modal.getOrCreateInstance(el("modalCompraExitosa")).show();
                    reproducirLottie(el("lottieExito"), "exito");
                } else if (datos.estado === "procesando" && intento < 10) {
                    // El webhook puede tardar unos segundos: volver a preguntar
                    setTimeout(() => verificarPago(sessionId, intento + 1), 1500);
                } else if (datos.estado === "procesando") {
                    mostrarResultado("Pago en proceso",
                        "Tu pago se confirmó; los créditos aparecerán en unos momentos.");
                } else if (datos.estado === "pendiente") {
                    mostrarResultado("Pago pendiente",
                        "Tus créditos se agregarán cuando se confirme el pago.");
                } else {
                    mostrarResultado("Pago no completado",
                        "El pago falló o expiró. No se realizó ningún cargo.");
                }
            })
            .catch(() => mostrarResultado("Error", "No se pudo verificar el pago."));
    }

    function revisarRegresoDeStripe() {
        const params = new URLSearchParams(window.location.search);
        const pago = params.get("pago");

        if (!pago) return;

        // Limpiar la URL para que al recargar no se repita el mensaje
        history.replaceState(null, "", window.location.pathname);

        // Abrir la pestaña de Créditos
        bootstrap.Tab.getOrCreateInstance(el("tabCreditos")).show();

        if (pago === "cancelado") {
            mostrarResultado("Pago cancelado", "Cancelaste el pago. No se realizó ningún cargo.");
        } else if (pago === "exito" && params.get("session_id")) {
            verificarPago(params.get("session_id"));
        }
    }


    // ---------- Inicio ----------

    mostrarSaldo();
    refrescarSaldo();
    cargarHistorial();
    revisarRegresoDeStripe();
});