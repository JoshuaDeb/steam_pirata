// Catálogo: consulta los videojuegos publicados y muestra su ficha.
// Sirve a store.html (con sesión) y a store_public.html (sin sesión).
// En store.html usa "usuario" y "accesoPermitido", definidos en session.js.

(function () {
    const esPublico = window.location.pathname.split("/").pop() === "store_public.html";

    if (!esPublico && !accesoPermitido) return;

    const POR_PAGINA = 12;

    const CLASIFICACIONES = {
        E: { texto: "E · Todos", ayuda: "Apto para todo público" },
        T: { texto: "T · +13", ayuda: "Mayores de 13 años" },
        M: { texto: "M · +17", ayuda: "Mayores de 17 años" }
    };

    const esJugador = !esPublico && usuario.role === "jugador";

    let juegosCargados = [];   // Videojuegos de la página actual
    let juegoActual = null;    // Videojuego abierto en la ficha

    // IDs de videojuegos del jugador (solo referencias, como en el backend)
    const enBiblioteca = new Set();
    const enFavoritos = new Set();

    const el = (id) => document.getElementById(id);

    const formFiltros = el("formFiltrosCatalogo");
    const listaJuegos = el("listaJuegos");
    const modalJuego = el("modalJuego");
    const modalAdquirir = el("modalAdquirir");   // Solo existe en store.html


    // ---------- Utilidades ----------

    // Escapar texto antes de insertarlo como HTML
    function escapar(texto) {
        return String(texto ?? "").replace(/[&<>"']/g, (caracter) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[caracter]));
    }

    // Iniciales para las portadas
    function iniciales(titulo) {
        const palabras = titulo.trim().split(/\s+/);

        const letras = palabras.length > 1
            ? palabras[0][0] + palabras[1][0]
            : titulo.trim().substring(0, 2);

        return letras.toUpperCase();
    }

    // Portada: la imagen guardada en assets/images o, si no hay, las iniciales
    function contenidoPortada(juego) {
        if (juego.portada) {
            return `<img class="position-absolute top-0 start-0 w-100 h-100 object-fit-cover"
                src="/assets/images/${encodeURIComponent(juego.portada)}" alt="Portada de ${escapar(juego.titulo)}">`;
        }

        return `<span class="juego-marca" aria-hidden="true">${escapar(iniciales(juego.titulo))}</span>`;
    }

    // Calificación promedio: "★ 4.5 (2 reseñas)" o "Sin reseñas"
    function textoCalificacion(juego) {
        const total = juego.total_resenas || 0;

        if (total === 0 || typeof juego.calificacion_promedio !== "number") {
            return "Sin reseñas";
        }

        return `★ ${juego.calificacion_promedio.toFixed(1)} (${total} ${total === 1 ? "reseña" : "reseñas"})`;
    }

    // Color de portada (portada-1 ... portada-4)
    function colorPortada(id) {
        return `portada-${((id - 1) % 4) + 1}`;
    }


    // ---------- Carga de datos ----------

    // Petición a la API que devuelve el JSON o lanza un Error con el mensaje
    function pedir(url, opciones) {
        return apiFetch(url, opciones).then((response) => {
            return response.json().catch(() => ({})).then((datos) => {
                if (!response.ok) {
                    throw new Error(datos.message || "Error en la petición");
                }

                return datos;
            });
        });
    }

    // Consultar la biblioteca y los favoritos del jugador
    function cargarRelaciones() {
        if (!esJugador) return Promise.resolve();

        return Promise.all([
            pedir(`/api/users/${usuario.id}/library`),
            pedir(`/api/users/${usuario.id}/favorites`)
        ])
            .then(([biblioteca, favoritos]) => {
                enBiblioteca.clear();
                enFavoritos.clear();

                biblioteca.videojuegos.forEach((juego) => enBiblioteca.add(juego.id));
                favoritos.videojuegos.forEach((juego) => enFavoritos.add(juego.id));
            })
            .catch((error) => {
                // El catálogo sigue siendo consultable aunque fallen estas listas
                console.error("No se pudieron consultar biblioteca y favoritos:", error);
            });
    }

    // Guardar los créditos actualizados en la sesión y en la pantalla
    function actualizarCreditos(creditos) {
        usuario.creditos = creditos;
        sessionStorage.setItem("usuario", JSON.stringify(usuario));

        const saldo = el("saldoCreditosCatalogo");

        if (saldo) saldo.textContent = `${creditos} créditos`;
    }

    function cargarCatalogo(numeroPagina = 1) {
        const campos = formFiltros.elements;
        const filtros = {
            q: campos.q.value.trim(),
            genero: campos.genero.value,
            clasificacion: campos.clasificacion.value,
            precio_max: campos.precio_max.value.trim(),
            calificacion_min: campos.calificacion_min.value,
            orden: campos.orden.value
        };

        const params = new URLSearchParams();

        for (const [nombre, valor] of Object.entries(filtros)) {
            if (valor) params.set(nombre, valor);
        }

        params.set("pagina", numeroPagina);
        params.set("limite", POR_PAGINA);

        const hayFiltros = Boolean(
            filtros.q || filtros.genero || filtros.clasificacion || filtros.precio_max || filtros.calificacion_min
        );

        return apiFetch(`/api/videojuegos?${params}`, { credentials: "same-origin" })
            .then((response) => {
                return response.json().catch(() => ({})).then((datos) => {
                    if (!response.ok) {
                        throw new Error(datos.message || "Error al consultar el catálogo");
                    }

                    return datos;
                });
            })
            .then((datos) => {
                juegosCargados = datos.videojuegos;
                renderizarCatalogo(datos, hayFiltros);
            })
            .catch((error) => {
                juegosCargados = [];

                el("resumenResultados").textContent = "No se pudo cargar el catálogo";
                el("paginacionCatalogo").hidden = true;

                listaJuegos.innerHTML = `
                    <li class="col-12">
                        <div class="alert alert-danger mb-0" role="alert">${escapar(error.message)}</div>
                    </li>`;
            });
    }


    // ---------- Pintado ----------

    function renderizarCatalogo(datos, hayFiltros) {
        el("tituloResultados").textContent = hayFiltros ? "Resultados" : "Todos los videojuegos";

        if (datos.total === 0) {
            el("resumenResultados").textContent = "No se encontraron videojuegos";
            el("paginacionCatalogo").hidden = true;

            listaJuegos.innerHTML = `
                <li class="col-12 fila-meta text-center py-5">
                    ${hayFiltros
                        ? "Ningún videojuego coincide con tu búsqueda."
                        : "Todavía no hay videojuegos publicados."}
                </li>`;
            return;
        }

        const primero = (datos.pagina - 1) * datos.limite + 1;
        const ultimo = primero + datos.videojuegos.length - 1;

        el("resumenResultados").textContent =
            `Mostrando ${primero}-${ultimo} de ${datos.total} ${datos.total === 1 ? "videojuego" : "videojuegos"}`;

        listaJuegos.innerHTML = datos.videojuegos.map(tarjetaJuego).join("");

        renderizarPaginacion(datos.pagina, datos.total_paginas);
    }

    // Favoritos: solo los jugadores los guardan; sin sesión se pide iniciar sesión
    function botonFavorito(juego) {
        if (esPublico) {
            return `<button aria-label="Inicia sesión para guardar ${escapar(juego.titulo)} en favoritos"
                            class="btn btn-outline-secondary boton-corazon" data-bs-target="#modalAccesoRequerido"
                            data-bs-toggle="modal" title="Inicia sesión para agregar a favoritos" type="button"><i
                                aria-hidden="true" class="fa-regular fa-heart"></i></button>`;
        }

        if (!esJugador) return "";

        return `<input name="favorito" aria-label="Guardar ${escapar(juego.titulo)} en favoritos"
                            autocomplete="off" class="btn-check check-favorito" id="favorito-${juego.id}"
                            type="checkbox" value="${juego.id}"
                            ${enFavoritos.has(juego.id) ? "checked" : ""} />
                        <label class="btn btn-outline-secondary boton-corazon" for="favorito-${juego.id}"
                            title="Agregar o quitar favorito">
                            <span aria-hidden="true" class="corazon-vacio">
                                <i class="fa-regular fa-heart"></i>
                            </span>
                            <span aria-hidden="true" class="corazon-lleno">
                                <i class="fa-solid fa-heart"></i>
                            </span>
                        </label>`;
    }

    function tarjetaJuego(juego) {
        const edad = CLASIFICACIONES[juego.clasificacion_edad];

        return `
            <li class="col">
                <article class="juego position-relative" data-juego-id="${juego.id}">
                    <div class="juego-portada ${colorPortada(juego.id)}">
                        ${contenidoPortada(juego)}
                        <span class="juego-edad" title="${edad.ayuda}">${edad.texto}</span>
                        ${botonFavorito(juego)}
                    </div>
                    <div class="juego-cuerpo">
                        <h3 class="juego-titulo">
                            <a class="stretched-link" data-bs-toggle="modal" data-bs-target="#modalJuego">
                                ${escapar(juego.titulo)}
                            </a>
                        </h3>
                        <p class="juego-genero">${escapar(juego.genero)}</p>
                        <div class="juego-pie">
                            <span class="juego-calif fila-meta">${textoCalificacion(juego)}</span>
                            <span class="juego-precio">${juego.precio_creditos} créditos</span>
                        </div>
                    </div>
                </article>
            </li>`;
    }

    function renderizarPaginacion(actual, total) {
        const paginas = [];

        for (let numero = 1; numero <= total; numero++) {
            paginas.push(numero === actual
                ? `<li class="page-item active" aria-current="page"><span class="page-link">${numero}</span></li>`
                : `<li class="page-item"><a class="page-link" href="#" data-pagina="${numero}">${numero}</a></li>`);
        }

        el("listaPaginas").innerHTML = paginas.join("");
        el("paginacionCatalogo").hidden = false;
    }

    function fichaJuego(juego) {
        const edad = CLASIFICACIONES[juego.clasificacion_edad];
        const dlcs = juego.dlcs.length > 0
            ? juego.dlcs.map((dlc) => escapar(dlc.nombre)).join(" · ")
            : "Sin DLC";

        return `
            <button type="button" class="btn-close cerrar-modal" data-bs-dismiss="modal"
                aria-label="Cerrar"></button>

            <div class="modal-body d-flex flex-column gap-4">

                <div class="d-flex align-items-start gap-3 pe-5">
                    <div class="portada-modal ${colorPortada(juego.id)}" aria-hidden="true">
                        ${contenidoPortada(juego)}
                    </div>
                    <div class="d-flex flex-column gap-1">
                        <span class="fila-meta">${escapar(juego.genero)} · ${edad.texto}</span>
                        <h2 class="modal-title" id="juegoTitulo">${escapar(juego.titulo)}</h2>
                        <p class="calif-modal mb-0"><span class="fila-meta">${textoCalificacion(juego)}</span></p>
                    </div>
                </div>

                <p class="mb-0">${escapar(juego.descripcion)}</p>

                <dl class="ficha">
                    <div class="ficha-fila">
                        <dt>Desarrollador</dt>
                        <dd>${escapar(juego.desarrollador)}</dd>
                    </div>
                    <div class="ficha-fila">
                        <dt>Especificaciones</dt>
                        <dd>${escapar(juego.especificaciones) || "No especificadas"}</dd>
                    </div>
                    <div class="ficha-fila">
                        <dt>DLC incluidos</dt>
                        <dd>${dlcs}</dd>
                    </div>
                </dl>

                <section aria-labelledby="resenasTitulo">
                    <h3 class="resenas-titulo" id="resenasTitulo">Reseñas</h3>
                    <div id="zonaResenas" class="d-flex flex-column gap-3"></div>
                </section>
            </div>

            <div class="modal-footer justify-content-between">
                <div class="d-flex flex-column">
                    <span class="precio-modal">${juego.precio_creditos} créditos</span>
                    ${esJugador ? `<span class="fila-meta" id="saldoModalJuego">Tu saldo: ${usuario.creditos} créditos</span>` : ""}
                    ${esPublico ? `<span class="fila-meta">Consulta libre · Adquisición con sesión</span>` : ""}
                </div>
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
                    ${esJugador && enBiblioteca.has(juego.id)
                        ? `<button type="button" class="btn btn-primary btn-grande" disabled>En tu biblioteca</button>`
                        : ""}
                    ${esJugador && !enBiblioteca.has(juego.id) ? `<button type="button" class="btn btn-primary btn-grande" data-bs-toggle="modal"
                        data-bs-target="#modalAdquirir">Adquirir</button>` : ""}
                    ${esPublico ? `<button type="button" class="btn btn-primary btn-grande" data-bs-toggle="modal"
                        data-bs-target="#modalAccesoRequerido">Iniciar sesión para adquirir</button>` : ""}
                </div>
            </div>`;
    }

    function confirmacionAdquirir(juego) {
        const saldoPrevisto = usuario.creditos - juego.precio_creditos;
        const sinSaldo = saldoPrevisto < 0;

        return `
            <div class="modal-header">
                <h2 class="modal-title" id="tituloModalAdquirir">Adquirir ${escapar(juego.titulo)}</h2>
                <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
                <p class="mb-3">¿Quieres adquirir este videojuego por <strong>${juego.precio_creditos} créditos</strong>?</p>
                <dl class="ficha mb-3">
                    <div class="ficha-fila">
                        <dt>Tu saldo actual</dt>
                        <dd>${usuario.creditos} créditos</dd>
                    </div>
                    <div class="ficha-fila">
                        <dt>Saldo previsto</dt>
                        <dd>${saldoPrevisto >= 0 ? `${saldoPrevisto} créditos` : "Créditos insuficientes"}</dd>
                    </div>
                    <div class="ficha-fila">
                        <dt>Desarrollador</dt>
                        <dd>${escapar(juego.desarrollador)}</dd>
                    </div>
                </dl>
                <div id="mensajeAdquirir" class="alert alert-danger d-none mb-0" role="alert"></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancelar</button>
                <button id="btnConfirmarAdquirir" class="btn btn-primary" type="button" ${sinSaldo ? "disabled" : ""}>
                    <span id="spinnerAdquirir" class="spinner-border spinner-border-sm d-none" aria-hidden="true"></span>
                    Confirmar adquisición
                </button>
            </div>`;
    }


    // ---------- Eventos ----------

    // Buscar y filtrar
    formFiltros.addEventListener("submit", (event) => {
        event.preventDefault();

        cargarCatalogo(1);
    });

    // Cambiar de página
    el("listaPaginas").addEventListener("click", (event) => {
        const enlace = event.target.closest("[data-pagina]");

        if (!enlace) return;

        event.preventDefault();

        cargarCatalogo(Number(enlace.dataset.pagina)).then(() => {
            window.scrollTo(0, 0);
        });
    });

    // Abrir la ficha del videojuego pulsado
    modalJuego.addEventListener("show.bs.modal", (event) => {
        const tarjeta = event.relatedTarget?.closest("[data-juego-id]");

        juegoActual = juegosCargados.find((juego) =>
            juego.id === Number(tarjeta?.dataset.juegoId)
        );

        if (!juegoActual) {
            event.preventDefault();
            return;
        }

        modalJuego.querySelector(".modal-content").innerHTML = fichaJuego(juegoActual);
        cargarResenas();
    });

    // Marcar o desmarcar un favorito
    listaJuegos.addEventListener("change", (event) => {
        const casilla = event.target.closest(".check-favorito");

        if (!casilla || !esJugador) return;

        const idJuego = Number(casilla.value);
        const agregar = casilla.checked;

        casilla.disabled = true;

        const peticion = agregar
            ? pedir(`/api/users/${usuario.id}/favorites`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videojuego_id: idJuego })
            })
            : pedir(`/api/users/${usuario.id}/favorites/${idJuego}`, { method: "DELETE" });

        peticion
            .then(() => {
                if (agregar) enFavoritos.add(idJuego);
                else enFavoritos.delete(idJuego);
            })
            .catch(() => {
                // Revertir la casilla si el servidor no guardó el cambio
                casilla.checked = !agregar;
            })
            .finally(() => {
                casilla.disabled = false;
            });
    });

    // Confirmación de adquisición
    if (modalAdquirir) {
        modalAdquirir.addEventListener("click", (event) => {
            if (!event.target.closest("#btnConfirmarAdquirir") || !juegoActual) return;

            const boton = el("btnConfirmarAdquirir");
            const spinner = el("spinnerAdquirir");
            const mensaje = el("mensajeAdquirir");
            const juego = juegoActual;

            boton.disabled = true;
            spinner.classList.remove("d-none");
            mensaje.classList.add("d-none");

            pedir(`/api/users/${usuario.id}/library`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videojuego_id: juego.id })
            })
                .then((datos) => {
                    enBiblioteca.add(juego.id);
                    actualizarCreditos(datos.user.creditos);

                    bootstrap.Modal.getOrCreateInstance(modalAdquirir).hide();
                    bootstrap.Modal.getOrCreateInstance(modalJuego).hide();
                })
                .catch((error) => {
                    mensaje.textContent = error.message;
                    mensaje.classList.remove("d-none");
                    boton.disabled = false;
                })
                .finally(() => {
                    spinner.classList.add("d-none");
                });
        });

        modalAdquirir.addEventListener("show.bs.modal", (event) => {
            if (!juegoActual) {
                event.preventDefault();
                return;
            }

            modalAdquirir.querySelector(".modal-content").innerHTML = confirmacionAdquirir(juegoActual);
        });
    }

    // ---------- Reseñas ----------

    let miResena = null;   // Reseña del usuario en el juego abierto (null si no ha escrito)

    // Pedir las reseñas del juego abierto y pintarlas
    function cargarResenas(mensajeExito) {
        const zona = el("zonaResenas");

        zona.innerHTML = `<div class="fila-meta">
            <span class="spinner-border spinner-border-sm"></span> Cargando reseñas...</div>`;

        apiFetch(`/api/resenas?juego_id=${juegoActual.id}`)
            .then((response) => response.json())
            .then((datos) => {
                // Buscar si el usuario ya escribió una reseña de este juego
                miResena = esJugador
                    ? datos.resenas.find((resena) => resena.usuario_id === usuario.id)
                    : null;

                zona.innerHTML = formularioResena() + listaResenas(datos.resenas);

                if (mensajeExito) mostrarMensajeResena(mensajeExito, "success");
            })
            .catch(() => {
                zona.innerHTML = `<div class="alert alert-danger mb-0">No se pudieron cargar las reseñas</div>`;
            });
    }

    // Formulario para escribir (o editar) la reseña. Solo lo ven los jugadores.
    function formularioResena() {
        if (!esJugador) return "";

        // Solo se reseñan los videojuegos adquiridos (si ya hay reseña, se puede editar)
        if (!miResena && !enBiblioteca.has(juegoActual.id)) {
            return `<div class="fila-meta">Adquiere este videojuego para escribir una reseña.
                Tu primera reseña de cada juego te da 10 créditos.</div>`;
        }

        const opciones = [5, 4, 3, 2, 1].map((numero) =>
            `<option value="${numero}" ${miResena?.estrellas === numero ? "selected" : ""}>${"★".repeat(numero)}</option>`
        ).join("");

        return `
            <form id="formResena" class="d-flex flex-column gap-2">
                <label class="form-label mb-0" for="estrellasResena">
                    ${miResena ? "Tu reseña (puedes editarla)" : "Escribe una reseña (+10 créditos la primera vez)"}
                </label>
                <select class="form-select" id="estrellasResena">${opciones}</select>
                <textarea class="form-control" id="textoResena" rows="3" maxlength="500"
                    placeholder="¿Qué te pareció el juego?">${miResena ? escapar(miResena.texto) : ""}</textarea>
                <div id="mensajeResena"></div>
                <div class="d-flex gap-2">
                    <button class="btn btn-primary" type="submit">
                        ${miResena ? "Guardar cambios" : "Publicar reseña"}
                    </button>
                    ${miResena ? `<button class="btn btn-outline-danger" type="button" id="btnBorrarResena">Borrar</button>` : ""}
                </div>
            </form>`;
    }

    // Lista con las reseñas de todos
    function listaResenas(resenas) {
        if (resenas.length === 0) {
            return `<span class="fila-meta">Todavía no hay reseñas</span>`;
        }

        return resenas.map((resena) => `
            <div class="border rounded p-2">
                <strong>${escapar(resena.nombre_usuario)}</strong>
                <span class="text-warning">${"★".repeat(resena.estrellas)}</span>
                <p class="mb-0">${escapar(resena.texto)}</p>
                ${resena.respuesta ? `
                <div class="border-start border-primary border-3 ps-2 mt-2">
                    <span class="fila-meta">Respuesta del desarrollador</span>
                    <p class="mb-0">${escapar(resena.respuesta)}</p>
                </div>` : ""}
            </div>`).join(""); 
    }

    function mostrarMensajeResena(texto, tipo) {
        const mensaje = el("mensajeResena");

        if (mensaje) {
            mensaje.innerHTML = `<div class="alert alert-${tipo} py-2 mb-0">${escapar(texto)}</div>`;
        }
    }

    // Mandar la reseña al servidor (POST = crear, PUT = editar, DELETE = borrar)
    function enviarResena(url, metodo, datos, mensajeExito) {
        mostrarMensajeResena("Guardando...", "secondary");

        apiFetch(url, {
            method: metodo,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datos)
        })
            .then((response) => response.json().then((respuesta) => {
                if (!response.ok) {
                    throw new Error(respuesta.message || "No se pudo guardar la reseña");
                }

                aplicarCalificacion(respuesta);   // Promedio nuevo del juego

                // Premio por la primera reseña: actualizar el saldo
                if (respuesta.premio > 0) {
                    actualizarCreditos(respuesta.creditos);

                    const saldoModal = el("saldoModalJuego");

                    if (saldoModal) saldoModal.textContent = `Tu saldo: ${usuario.creditos} créditos`;

                    mensajeExito += ` · ¡Ganaste ${respuesta.premio} créditos!`;
                }

                cargarResenas(mensajeExito);      // Volver a pintar las reseñas
            }))
            .catch((error) => mostrarMensajeResena(error.message, "danger"));
    }

    // Mostrar el promedio actualizado (que devuelve el servidor) en la ficha y en la tarjeta
    function aplicarCalificacion(respuesta) {
        if (!juegoActual || respuesta.total_resenas === undefined) return;

        for (const juego of [juegoActual, juegosCargados.find((item) => item.id === juegoActual.id)]) {
            if (!juego) continue;

            juego.calificacion_promedio = respuesta.calificacion_promedio;
            juego.total_resenas = respuesta.total_resenas;
        }

        const textoModal = modalJuego.querySelector(".calif-modal .fila-meta");

        if (textoModal) textoModal.textContent = textoCalificacion(juegoActual);

        const textoTarjeta = listaJuegos.querySelector(`[data-juego-id="${juegoActual.id}"] .juego-calif`);

        if (textoTarjeta) textoTarjeta.textContent = textoCalificacion(juegoActual);
    }

    // Publicar o guardar cambios
    modalJuego.addEventListener("submit", (event) => {
        if (event.target.id !== "formResena") return;

        event.preventDefault();

        const datos = {
            juego_id: juegoActual.id,
            estrellas: Number(el("estrellasResena").value),
            texto: el("textoResena").value.trim()
        };

        if (datos.texto.length < 5) {
            mostrarMensajeResena("La reseña debe tener al menos 5 caracteres", "danger");
            return;
        }

        if (miResena) {
            enviarResena(`/api/resenas/${miResena.id}`, "PUT", datos, "Reseña actualizada");
        } else {
            enviarResena("/api/resenas", "POST", datos, "Reseña publicada");
        }
    });

    // Borrar la reseña
    modalJuego.addEventListener("click", (event) => {
        if (event.target.id !== "btnBorrarResena") return;

        if (!confirm("¿Seguro que quieres borrar tu reseña?")) return;

        enviarResena(`/api/resenas/${miResena.id}`, "DELETE", {}, "Reseña eliminada");
    });


    // ---------- Inicio ----------

    cargarRelaciones().then(() => cargarCatalogo(1));
})();
