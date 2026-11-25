document.addEventListener("DOMContentLoaded", () => {

    const usuario = JSON.parse(sessionStorage.getItem("usuario"));

    if (!usuario || usuario.role !== "jugador") return;

    const el = (id) => document.getElementById(id);

    const NOMBRES_METODO = {
        tarjeta: "Tarjeta",
        paypal: "PayPal",
        oxxo: "OXXO",
        transferencia: "Transferencia"
    };



    function digitos(cantidad) {
        let texto = "";

        for (let i = 0; i < cantidad; i++) {
            texto += Math.floor(Math.random() * 10);
        }

        return texto;
    }

    function formatoFecha(fecha) {
        return new Date(fecha).toLocaleDateString("es-MX", {
            day: "numeric", month: "short", year: "numeric"
        });
    }


    function paqueteElegido() {
        const radio = document.querySelector('input[name="paquete"]:checked');

        return radio ? Number(radio.id.replace("paq", "")) : null;
    }

  
    function mostrarSaldo() {
        el("saldoCreditos").textContent = usuario.creditos;
        el("creditosPerfil").textContent = `${usuario.creditos} créditos`;
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
                    <span class="fila-valor">Compra de créditos · ${NOMBRES_METODO[compra.metodo]}</span>
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


    // ---------- Guardar la compra en el servidor ----------

  
    function comprar(metodo, modalActual, boton) {
        const paquete = paqueteElegido();

        if (!paquete) {
            alert("Elige un paquete de créditos");
            return;
        }

        boton.disabled = true;

        apiFetch("/api/compras", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usuario_id: usuario.id, paquete: paquete, metodo: metodo })
        })
            .then((response) => response.json().then((respuesta) => {
                if (!response.ok) throw new Error(respuesta.message);

                // Actualizar el saldo en la sesión y en la pantalla
                usuario.creditos = respuesta.creditos;
                sessionStorage.setItem("usuario", JSON.stringify(usuario));
                mostrarSaldo();
                cargarHistorial();

                // Cerrar el modal actual y mostrar "¡Compra realizada!"
                const modal = bootstrap.Modal.getOrCreateInstance(el(modalActual));

                el(modalActual).addEventListener("hidden.bs.modal", () => {
                    bootstrap.Modal.getOrCreateInstance(el("modalCompraExitosa")).show();
                }, { once: true });

                modal.hide();
            }))
            .catch((error) => alert(error.message))
            .finally(() => {
                boton.disabled = false;
            });
    }


    // ---------- Tarjeta ----------

  
    el("titular").addEventListener("input", () => {
        el("visualTitular").textContent = el("titular").value.toUpperCase() || "NOMBRE DEL TITULAR";
    });

    el("numTarjeta").addEventListener("input", () => {
        el("visualNumero").textContent = el("numTarjeta").value || "•••• •••• •••• ••••";
    });

    el("vencimiento").addEventListener("input", () => {
        el("visualVence").textContent = el("vencimiento").value || "MM/AA";
    });

    el("btnPagarTarjeta").addEventListener("click", (event) => {
        const numero = el("numTarjeta").value.replace(/\s/g, "");   // sin espacios
        const titular = el("titular").value.trim();
        const vencimiento = el("vencimiento").value.trim();
        const cvv = el("cvv").value.trim();

        let error = "";

        if (!/^\d{16}$/.test(numero)) {
            error = "El número de tarjeta debe tener 16 dígitos";
        } else if (titular.length < 3) {
            error = "Escribe el nombre del titular";
        } else if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(vencimiento)) {
            error = "El vencimiento debe tener el formato MM/AA";
        } else if (!/^\d{3,4}$/.test(cvv)) {
            error = "El CVV debe tener 3 o 4 dígitos";
        }

        if (error) {
            el("errorTarjeta").innerHTML = `<div class="alert alert-danger py-2 mb-0">${error}</div>`;
            return;
        }

        el("errorTarjeta").innerHTML = "";
        comprar("tarjeta", "modalComprar", event.currentTarget);
    });


    // ---------- PayPal ----------

    el("paypalCuenta").textContent = usuario.correo;

    el("btnPagarPaypal").addEventListener("click", (event) => {
        comprar("paypal", "modalPaypal", event.currentTarget);
    });


    // ---------- OXXO ----------

    
    el("modalOxxo").addEventListener("show.bs.modal", () => {
        el("oxxoReferencia").textContent = digitos(16).match(/.{4}/g).join(" ");

        const vence = new Date();
        let diasHabiles = 0;

        while (diasHabiles < 5) {
            vence.setDate(vence.getDate() + 1);

            const dia = vence.getDay();   

            if (dia !== 0 && dia !== 6) diasHabiles++;
        }

        el("oxxoVence").textContent = `Vence: ${formatoFecha(vence)}, 23:59`;
    });

    el("btnPagarOxxo").addEventListener("click", (event) => {
        comprar("oxxo", "modalOxxo", event.currentTarget);
    });


    // ---------- Transferencia ----------

    // Cada vez que se elige Transferencia: CLABE y concepto nuevos
    el("metSpei").addEventListener("change", () => {
        const clabe = digitos(18);

        el("speiClabe").textContent =
            `${clabe.slice(0, 3)} ${clabe.slice(3, 6)} ${clabe.slice(6, 17)} ${clabe.slice(17)}`;
        el("speiConcepto").textContent = `SP-${usuario.nombre_usuario.toUpperCase()}-${digitos(4)}`;
    });

    el("btnPagarSpei").addEventListener("click", (event) => {
        comprar("transferencia", "modalComprar", event.currentTarget);
    });


    // ---------- Inicio ----------

    mostrarSaldo();
    cargarHistorial();
});