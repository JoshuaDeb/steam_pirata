// Biblioteca y favoritos del jugador.
// Usa "usuario" y "accesoPermitido", definidos en session.js.
// El backend solo guarda IDs (usuario_id y videojuego_id); aquí se consultan
// ya combinados con los datos del videojuego.

(function () {
    if (!accesoPermitido) return;

    const POR_PAGINA = 6;

    const CLASIFICACIONES = { E: "E · Todos", T: "T · +13", M: "M · +17" };

    let biblioteca = [];   // Videojuegos adquiridos (en orden de adquisición)
    let favoritos = [];    // Videojuegos favoritos (en orden en que se agregaron)

    let misResenas = new Map();   // juego_id -> reseña escrita por este usuario
    let juegoResena = null;       // Videojuego que se está reseñando

    const paginas = { biblioteca: 1, favoritos: 1 };

    const el = (id) => document.getElementById(id);


    // ---------- Utilidades ----------

    function escapar(texto) {
        return String(texto ?? "").replace(/[&<>"']/g, (caracter) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[caracter]));
    }

    function normalizar(texto) {
        return String(texto ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    }

    function iniciales(titulo) {
        const palabras = titulo.trim().split(/\s+/);

        return (palabras.length > 1
            ? palabras[0][0] + palabras[1][0]
            : titulo.trim().substring(0, 2)).toUpperCase();
    }

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

    function esFavorito(id) {
        return favoritos.some((juego) => juego.id === id);
    }

    function esAdquirido(id) {
        return biblioteca.some((juego) => juego.id === id);
    }

    function textoDlc(juego) {
        return juego.dlcs.length === 0
            ? "Sin DLC"
            : `${juego.dlcs.length} DLC`;
    }

    // Calificación promedio: "★ 4.5 (2 reseñas)" o "Sin reseñas"
    function textoCalificacion(juego) {
        const total = juego.total_resenas || 0;

        if (total === 0 || typeof juego.calificacion_promedio !== "number") {
            return "Sin reseñas";
        }

        return `★ ${juego.calificacion_promedio.toFixed(1)} (${total} ${total === 1 ? "reseña" : "reseñas"})`;
    }

    function portada(juego) {
        if (juego.portada) {
            return `<img class="position-absolute top-0 start-0 w-100 h-100 object-fit-cover"
                src="${escapar(juego.portada)}" alt="${escapar(juego.titulo)}">`;
        }

        return `<span class="juego-marca" aria-hidden="true">${escapar(iniciales(juego.titulo))}</span>`;
    }


    // ---------- Pintado ----------

    function botonCorazon(juego, prefijo) {
        return `
            <input name="favorito" aria-label="Guardar ${escapar(juego.titulo)} en favoritos"
                autocomplete="off" class="btn-check check-favorito" id="${prefijo}-${juego.id}"
                type="checkbox" value="${juego.id}" ${esFavorito(juego.id) ? "checked" : ""} />
            <label class="btn btn-outline-secondary boton-corazon" for="${prefijo}-${juego.id}"
                title="Agregar o quitar favorito">
                <span aria-hidden="true" class="corazon-vacio"><i class="fa-regular fa-heart"></i></span>
                <span aria-hidden="true" class="corazon-lleno"><i class="fa-solid fa-heart"></i></span>
            </label>`;
    }

    function tarjetaBiblioteca(juego) {
        const retirado = juego.estado === "retirado";

        return `
            <div class="col">
                <div class="juego-card h-100" data-juego-id="${juego.id}">
                    <div class="cubierta arte-nebula">${portada(juego)}</div>
                    <div class="tarjeta-cuerpo">
                        <span class="tipo-etiqueta">${escapar(juego.genero)}</span>
                        <h2 class="juego-nombre">${escapar(juego.titulo)}</h2>
                        <p class="metadatos mb-2">
                            ${escapar(juego.desarrollador)} - ${textoDlc(juego)} - ${textoCalificacion(juego)}
                        </p>
                        <span class="chip">${retirado ? "Retirado del catálogo" : "En mi biblioteca"}</span>
                        <div class="tarjeta-acciones">
                            <button class="btn btn-primary flex-grow-1 btn-detalle" data-accion="detalle"
                                type="button">Ver detalles</button>
                            <button class="btn btn-outline-secondary btn-resena" data-accion="resena"
                                type="button">${misResenas.has(juego.id) ? "Editar reseña" : "Reseñar"}</button>
                            ${botonCorazon(juego, "fav-bib")}
                        </div>
                    </div>
                </div>
            </div>`;
    }

    function tarjetaFavorito(juego) {
        const adquirido = esAdquirido(juego.id);

        return `
            <div class="col">
                <div class="juego-card h-100" data-juego-id="${juego.id}">
                    <div class="cubierta arte-nebula">${portada(juego)}</div>
                    <div class="tarjeta-cuerpo">
                        <span class="tipo-etiqueta">${escapar(juego.genero)}</span>
                        <h2 class="juego-nombre">${escapar(juego.titulo)}</h2>
                        <p class="metadatos mb-2">
                            ${escapar(juego.desarrollador)} - ${juego.precio_creditos} créditos - ${textoCalificacion(juego)}
                        </p>
                        <span class="chip ${adquirido ? "chip-adquirido" : "chip-pendiente"}">${adquirido ? "Ya adquirido" : "Por adquirir"}</span>
                        <div class="tarjeta-acciones">
                            <button class="btn btn-primary flex-grow-1 btn-detalle" data-accion="detalle"
                                type="button">Ver detalles</button>
                            ${botonCorazon(juego, "fav-fav")}
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // Aplicar búsqueda, filtro y orden de una pestaña
    function filtrar(tipo) {
        const esBiblioteca = tipo === "biblioteca";
        const lista = esBiblioteca ? biblioteca : favoritos;

        const texto = normalizar(el(esBiblioteca ? "buscarBiblioteca" : "buscarFavoritos").value.trim());
        const filtro = el(esBiblioteca ? "filtrarBiblioteca" : "filtrarFavoritos").value;
        const orden = el(esBiblioteca ? "ordenBiblioteca" : "ordenFavoritos").value;

        const resultado = lista.filter((juego) => {
            if (texto && !normalizar(juego.titulo).includes(texto)) return false;

            if (esBiblioteca) {
                if (filtro === "disponible") return juego.estado === "publicado";
                if (filtro === "retirado") return juego.estado === "retirado";
            } else {
                if (filtro === "adquirido") return esAdquirido(juego.id);
                if (filtro === "pendiente") return !esAdquirido(juego.id);
            }

            return true;
        });

        if (orden === "nombre") {
            resultado.sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
        } else if (orden === "reciente") {
            resultado.reverse();
        }

        // "antiguo": se conserva el orden en que se guardaron los registros
        return resultado;
    }

    function pintar(tipo) {
        const esBiblioteca = tipo === "biblioteca";
        const sufijo = esBiblioteca ? "Biblioteca" : "Favoritos";

        const resultado = filtrar(tipo);
        const totalPaginas = Math.max(1, Math.ceil(resultado.length / POR_PAGINA));

        paginas[tipo] = Math.min(paginas[tipo], totalPaginas);

        const inicio = (paginas[tipo] - 1) * POR_PAGINA;
        const visibles = resultado.slice(inicio, inicio + POR_PAGINA);

        el(`lista${sufijo}`).innerHTML = visibles
            .map(esBiblioteca ? tarjetaBiblioteca : tarjetaFavorito)
            .join("");

        el(`sin${sufijo}`).hidden = resultado.length > 0;

        // Contador de resultados
        const total = esBiblioteca ? biblioteca.length : favoritos.length;

        el(`resultados${sufijo}`).textContent = esBiblioteca
            ? `Mostrando ${resultado.length} de ${total} videojuegos`
            : `${resultado.length} ${resultado.length === 1 ? "videojuego" : "videojuegos"} en favoritos`;

        // Paginación
        el(`paginacion${sufijo}`).hidden = resultado.length <= POR_PAGINA;
        el(`paginaInfo${sufijo}`).textContent = `Página ${paginas[tipo]} de ${totalPaginas}`;
        el(`anterior${sufijo}`).disabled = paginas[tipo] <= 1;
        el(`siguiente${sufijo}`).disabled = paginas[tipo] >= totalPaginas;
    }

    function pintarTodo() {
        el("totalAdquiridos").textContent = biblioteca.length;
        el("totalFavoritos").textContent = favoritos.length;
        el("contadorBiblioteca").textContent = biblioteca.length;
        el("contadorFavoritos").textContent = favoritos.length;
        el("creditosBiblioteca").textContent = usuario.creditos;

        pintar("biblioteca");
        pintar("favoritos");
    }

    function fichaDetalle(juego) {
        const adquirido = esAdquirido(juego.id);
        const retirado = juego.estado === "retirado";

        const estado = adquirido
            ? `Adquirido - ${retirado ? "Retirado del catálogo" : "Disponible en el catálogo"}`
            : `Pendiente de adquirir - ${juego.precio_creditos} créditos`;

        return `
            <div class="modal-header">
                <h2 class="modal-title" id="tituloDetalleJuego">${escapar(juego.titulo)}</h2>
                <button aria-label="Cerrar" class="btn-close" data-bs-dismiss="modal" type="button"></button>
            </div>
            <div class="modal-body d-flex flex-column gap-3">
                <p class="info-modal mb-0">${escapar(juego.descripcion)}</p>
                <div>
                    <span class="fila-label">Desarrollador</span>
                    <div class="fila-valor">${escapar(juego.desarrollador)}</div>
                </div>
                <div>
                    <span class="fila-label">Categoría y clasificación</span>
                    <div class="fila-valor">${escapar(juego.genero)} - ${escapar(CLASIFICACIONES[juego.clasificacion_edad] || juego.clasificacion_edad)}</div>
                </div>
                <div>
                    <span class="fila-label">Calificación promedio</span>
                    <div class="fila-valor">${textoCalificacion(juego)}</div>
                </div>
                <div>
                    <span class="fila-label">Contenido adicional</span>
                    <div class="fila-valor">${juego.dlcs.length === 0
                ? "Sin DLC"
                : juego.dlcs.map((dlc) => escapar(dlc.nombre)).join(" · ")}</div>
                </div>
                <p class="fila-meta mb-0">${estado}</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline-secondary" data-bs-dismiss="modal" type="button">Cerrar</button>
                <a class="btn btn-primary" href="store.html">Ir al catálogo</a>
            </div>`;
    }


    // ---------- Carga ----------

    function cargar() {
        return Promise.all([
            pedir(`/api/users/${usuario.id}/library`),
            pedir(`/api/users/${usuario.id}/favorites`),
            // Reseñas del usuario (si fallan, solo se pierde el texto "Editar reseña")
            pedir(`/api/resenas?usuario_id=${usuario.id}`).catch(() => ({ resenas: [] }))
        ])
            .then(([datosBiblioteca, datosFavoritos, datosResenas]) => {
                biblioteca = datosBiblioteca.videojuegos;
                favoritos = datosFavoritos.videojuegos;
                misResenas = new Map(datosResenas.resenas.map((resena) => [resena.juego_id, resena]));

                pintarTodo();
            })
            .catch((error) => {
                for (const sufijo of ["Biblioteca", "Favoritos"]) {
                    el(`resultados${sufijo}`).textContent = error.message;
                    el(`paginacion${sufijo}`).hidden = true;
                }
            });
    }


    // ---------- Eventos ----------

    // Búsqueda, filtros y orden
    for (const [tipo, sufijo] of [["biblioteca", "Biblioteca"], ["favoritos", "Favoritos"]]) {
        for (const id of [`buscar${sufijo}`, `filtrar${sufijo}`, `orden${sufijo}`]) {
            el(id).addEventListener("input", () => {
                paginas[tipo] = 1;
                pintar(tipo);
            });
        }

        el(`anterior${sufijo}`).addEventListener("click", () => {
            paginas[tipo] -= 1;
            pintar(tipo);
        });

        el(`siguiente${sufijo}`).addEventListener("click", () => {
            paginas[tipo] += 1;
            pintar(tipo);
        });
    }

    // Todos los juegos que se pueden consultar (para el detalle y los corazones)
    function buscarJuego(id) {
        return biblioteca.find((juego) => juego.id === id) ||
            favoritos.find((juego) => juego.id === id);
    }

    // Ver detalles y reseñar
    document.querySelector("main").addEventListener("click", (event) => {
        const boton = event.target.closest("[data-accion]");

        if (!boton) return;

        const juego = buscarJuego(boton.closest("[data-juego-id]")?.dataset.juegoId);

        if (!juego) return;

        if (boton.dataset.accion === "detalle") {
            el("modalDetalleJuego").querySelector(".modal-content").innerHTML = fichaDetalle(juego);

            bootstrap.Modal.getOrCreateInstance(el("modalDetalleJuego")).show();
        } else if (boton.dataset.accion === "resena") {
            abrirResena(juego);
        }
    });

    // Agregar o quitar un favorito
    document.querySelector("main").addEventListener("change", (event) => {
        const casilla = event.target.closest(".check-favorito");

        if (!casilla) return;

        const id = casilla.value;
        const agregar = casilla.checked;
        const juego = buscarJuego(id);

        casilla.disabled = true;

        const peticion = agregar
            ? pedir(`/api/users/${usuario.id}/favorites`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videojuego_id: id })
            })
            : pedir(`/api/users/${usuario.id}/favorites/${id}`, { method: "DELETE" });

        peticion
            .then(() => {
                if (agregar && juego && !esFavorito(id)) {
                    favoritos.push(juego);
                } else if (!agregar) {
                    favoritos = favoritos.filter((item) => item.id !== id);
                }

                pintarTodo();
                mostrarAviso(agregar ? "Agregado a favoritos" : "Quitado de favoritos", agregar ? "success" : "info");
            })
            .catch(() => {
                casilla.checked = !agregar;
                mostrarAviso("No se pudo actualizar favoritos. Intenta de nuevo.", "danger");
                casilla.disabled = false;
            });
    });


    // ---------- Reseñas ----------

    const formResena = el("formResena");
    const mensajeResena = el("mensajeResena");
    const modalResena = el("modalResena");

    function mostrarMensajeResena(texto, tipo) {
        mensajeResena.textContent = texto;
        mensajeResena.className = `alert alert-${tipo} mb-0`;
    }

    function ocupadoResena(ocupado) {
        el("btnGuardarResena").disabled = ocupado;
        el("btnBorrarResena").disabled = ocupado;
        el("spinnerResena").classList.toggle("d-none", !ocupado);
    }

    // Preparar el modal: reseña nueva o edición de la que ya existe
    function abrirResena(juego) {
        juegoResena = juego;

        const existente = misResenas.get(juego.id) || null;

        formResena.reset();
        mensajeResena.className = "alert d-none mb-0";
        ocupadoResena(false);

        el("nombreJuegoResena").textContent = juego.titulo;
        el("tituloResena").textContent = existente ? "Editar tu reseña" : "Escribir reseña";
        el("btnGuardarResena").lastChild.textContent = existente ? " Guardar cambios" : " Publicar reseña";
        el("btnBorrarResena").classList.toggle("d-none", !existente);

        if (existente) {
            formResena.elements.calificacion.value = String(existente.estrellas);
            el("comentarioResena").value = existente.texto;
        }

        bootstrap.Modal.getOrCreateInstance(modalResena).show();
    }

    // Aplicar el promedio nuevo (lo devuelve el servidor) a las listas y repintar
    function aplicarCalificacion(respuesta) {
        for (const lista of [biblioteca, favoritos]) {
            const juego = lista.find((item) => item.id === juegoResena.id);

            if (juego && respuesta.total_resenas !== undefined) {
                juego.calificacion_promedio = respuesta.calificacion_promedio;
                juego.total_resenas = respuesta.total_resenas;
            }
        }

        pintarTodo();
    }

    function enviarResena(url, metodo, datos, exito) {
        ocupadoResena(true);
        mensajeResena.className = "alert d-none mb-0";

        return pedir(url, {
            method: metodo,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datos)
        })
            .then((respuesta) => {
                if (metodo === "DELETE") {
                    misResenas.delete(juegoResena.id);
                } else {
                    misResenas.set(juegoResena.id, respuesta.resena);
                }

                aplicarCalificacion(respuesta);

                // Premio por la primera reseña: actualizar el saldo
                if (respuesta.premio > 0) {
                    usuario.creditos = respuesta.creditos;
                    sessionStorage.setItem("usuario", JSON.stringify(usuario));

                    el("creditosBiblioteca").textContent = usuario.creditos;

                    exito += ` ¡Ganaste ${respuesta.premio} créditos!`;
                }

                mostrarMensajeResena(exito, "success");

                setTimeout(() => bootstrap.Modal.getOrCreateInstance(modalResena).hide(), 1200);
            })
            .catch((error) => {
                mostrarMensajeResena(error.message, "danger");
                ocupadoResena(false);
            });
    }

    // Publicar o guardar cambios
    formResena.addEventListener("submit", (event) => {
        event.preventDefault();

        const estrellas = Number(formResena.elements.calificacion.value);
        const texto = el("comentarioResena").value.trim();

        if (!estrellas) {
            mostrarMensajeResena("Elige de 1 a 5 estrellas", "danger");
            return;
        }

        if (texto.length < 5) {
            mostrarMensajeResena("La reseña debe tener al menos 5 caracteres", "danger");
            return;
        }

        const existente = misResenas.get(juegoResena.id);
        const datos = { juego_id: juegoResena.id, estrellas, texto };

        if (existente) {
            enviarResena(`/api/resenas/${existente.id}`, "PUT", datos, "Reseña actualizada");
        } else {
            enviarResena("/api/resenas", "POST", datos, "Reseña publicada");
        }
    });

    // Borrar la reseña propia
        el("btnBorrarResena").addEventListener("click", async () => {
        const existente = misResenas.get(juegoResena.id);

                if (!existente) return;

        if (!(await confirmar("Tu reseña se borrará para siempre.", { titulo: "¿Borrar tu reseña?", textoBoton: "Sí, borrar" }))) return;

        enviarResena(`/api/resenas/${existente.id}`, "DELETE", {}, "Reseña eliminada");
    });


    // ---------- Inicio ----------

    el("coleccionDe").textContent = `Colección de ${usuario.nombre_usuario}`;
    el("creditosBiblioteca").textContent = usuario.creditos;
    document.querySelectorAll(".lottie-vacio").forEach((contenedor) => {
        reproducirLottie(contenedor, "vacio", { loop: true });
    });

    cargar();
})();
