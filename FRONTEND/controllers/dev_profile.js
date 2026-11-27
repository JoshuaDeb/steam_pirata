// Panel del desarrollador: publicar, editar y retirar videojuegos, y administrar sus DLC.
// Usa "usuario" y "accesoPermitido", definidos en session.js.

(function () {
    if (!accesoPermitido) return;

    const GENEROS = [
        "Acción", "Aventura", "Carreras", "Deportes",
        "Estrategia", "RPG", "Simulación", "Terror"
    ];
    const CLASIFICACIONES = {
        E: "E · Todos",
        T: "T · +13",
        M: "M · +17"
    };
    const TIPOS_DLC = ["Expansión", "Vehículos", "Personajes", "Cosméticos", "Niveles"];
    const FORMATOS_PORTADA = ["image/png", "image/jpeg", "image/webp"];
    const PORTADA_MAX_BYTES = 2 * 1024 * 1024;

    let juegos = [];            // Videojuegos del desarrollador (publicados y retirados)
    let juegoDlcActivo = null;  // Videojuego cuya pestaña de DLC está abierta
    let juegoPorRetirar = null;
    let dlcPorEliminar = null;

    const el = (id) => document.getElementById(id);

    const alertasPanel = el("alertasPanel");
    const listaPublicados = el("listaPublicados");
    const listaRetirados = el("listaRetirados");
    const chipsDlc = el("chipsDlc");
    const panesDlc = el("panesDlc");
    const modalDetalle = el("modalDetalle");
    const modalRetirar = el("modalRetirar");
    const modalEliminarDlc = el("modalEliminarDlc");
    const formPublicar = el("formPublicarVideojuego");


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

    function contenidoPortada(juego) {
        if (juego.portada) {
            const version = encodeURIComponent(juego.updatedAt || "");
            const url = `${juego.portada}?v=${version}`;
            return `<img src="${escapar(url)}" alt="">`;
        }

        return escapar(iniciales(juego.titulo));
    }
    // Leer la imagen elegida y convertirla a data URL para enviarla al servidor.
    // Devuelve null si no se eligió archivo.
    function leerPortada(input) {

        const archivo = input?.files?.[0];

        if (!archivo) return Promise.resolve(null);

        if (!FORMATOS_PORTADA.includes(archivo.type)) {
            return Promise.reject(new Error("La portada debe ser una imagen PNG, JPG o WEBP"));
        }

        if (archivo.size > PORTADA_MAX_BYTES) {
            return Promise.reject(new Error("La portada no puede superar los 2 MB"));
        }

        return new Promise((resolve, reject) => {
            const lector = new FileReader();

            lector.onload = () => resolve(lector.result);
            lector.onerror = () => reject(new Error("No se pudo leer la imagen"));
            lector.readAsDataURL(archivo);
        });
    }

    // Color de portada (portada-1 ... portada-4)
    function colorPortada(id) {
        const numero = parseInt(String(id).slice(-2), 16);
        return `portada-${(numero % 4) + 1}`;
    }

    function opcionesTexto(lista, seleccionado) {
        return lista.map((texto) =>
            `<option${texto === seleccionado ? " selected" : ""}>${escapar(texto)}</option>`
        ).join("");
    }

    function opcionesClasificacion(seleccionada) {
        return Object.entries(CLASIFICACIONES).map(([valor, texto]) =>
            `<option value="${valor}"${valor === seleccionada ? " selected" : ""}>${texto}</option>`
        ).join("");
    }

    function textoDlc(cantidad) {
        return cantidad === 0 ? "Sin DLC" : `${cantidad} DLC`;
    }

    function buscarJuego(id) {
        return juegos.find((juego) => juego.id === id);
    }

    function buscarDlc(id) {
        for (const juego of juegos) {
            const dlc = juego.dlcs.find((item) => item.id === id);

            if (dlc) return dlc;
        }

        return undefined;
    }

    // Llamar a la API utilizando el token de autenticación
    function api(url, metodo = "GET", cuerpo) {
        const opciones = {
            method: metodo,
            headers: {},
            credentials: "same-origin",
            cache: "no-store"
        };

        if (cuerpo !== undefined) {
            opciones.headers["Content-Type"] = "application/json";
            opciones.body = JSON.stringify(cuerpo);
        }

        return apiFetch(url, opciones).then((response) => {
            return response.json().catch(() => ({})).then((datos) => {
                if (!response.ok) {
                    throw new Error(datos.message || "Error al procesar la solicitud");
                }

                return datos;
            });
        });
    }

    function mostrarAlerta(mensaje, tipo = "success") {
        alertasPanel.innerHTML = `
            <div class="alert alert-${tipo} alert-dismissible fade show" role="alert">
                ${escapar(mensaje)}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
            </div>`;

        alertasPanel.scrollIntoView?.({ block: "nearest" });
    }

    function cerrarModal(modal) {
        bootstrap.Modal.getOrCreateInstance(modal).hide();
    }

    // Enviar un formulario: bloquea el botón y muestra los errores del servidor dentro del formulario
    function enviarFormulario(form, peticion, alTerminar) {
        const boton = form.querySelector('button[type="submit"]');
        const error = form.querySelector("[data-error]");

        error.classList.add("d-none");
        boton.disabled = true;

        peticion()
            .then(alTerminar)
            .catch((fallo) => {
                error.textContent = fallo.message;
                error.classList.remove("d-none");
            })
            .finally(() => {
                boton.disabled = false;
            });
    }

    // Al publicar la portada es obligatoria; al editar solo se envía si se eligió una nueva
    function leerDatosJuego(form, portadaObligatoria) {
        const campos = form.elements;
        const precio = campos.precio_creditos.value.trim();

        const datos = {
            titulo: campos.titulo.value,
            descripcion: campos.descripcion.value,
            genero: campos.genero.value,
            clasificacion_edad: campos.clasificacion_edad.value,
            precio_creditos: precio === "" ? null : Number(precio),
            especificaciones: campos.especificaciones.value
        };

        return leerPortada(campos.portada).then((portada) => {
            if (portada === null && portadaObligatoria) {
                throw new Error("Debes agregar una portada para publicar el videojuego");
            }

            if (portada !== null) datos.portada = portada;

            return datos;
        });
    }

    function leerDatosDlc(form) {
        const campos = form.elements;

        return {
            nombre: campos.nombre.value,
            tipo_contenido: campos.tipo_contenido.value,
            descripcion: campos.descripcion.value
        };
    }


    // ---------- Carga de datos ----------

    function cargarJuegos() {
        return api(`/api/videojuegos?id_desarrollador=${usuario.id}&estado=todos`)
            .then((datos) => {
                juegos = datos.videojuegos;
                renderizar();
            })
            .catch((error) => {
                listaPublicados.innerHTML =
                    '<div class="list-group-item vacio">No se pudieron cargar los videojuegos.</div>';
                mostrarAlerta(error.message, "danger");
            });
    }


    // ---------- Pintado ----------

    function renderizar() {
        const publicados = juegos.filter((juego) => juego.estado === "publicado");
        const retirados = juegos.filter((juego) => juego.estado === "retirado");
        const totalDlc = publicados.reduce((suma, juego) => suma + juego.dlcs.length, 0);

        el("resumenPanel").textContent =
            `${publicados.length} ${publicados.length === 1 ? "publicado" : "publicados"} · ${totalDlc} DLC`;

        renderizarPublicados(publicados);
        renderizarDlc(publicados);
        renderizarRetirados(retirados);
    }

    function renderizarPublicados(publicados) {
        if (publicados.length === 0) {
            listaPublicados.innerHTML = `
                <div class="list-group-item vacio">
                    Todavía no has publicado videojuegos. Usa «Publicar videojuego» para empezar.
                </div>`;
            return;
        }

        listaPublicados.innerHTML = publicados.map((juego) => `
            <div class="list-group-item">
                <div class="d-flex flex-wrap flex-md-nowrap align-items-center gap-3">
                    <div class="portada ${colorPortada(juego.id)}" aria-hidden="true">${contenidoPortada(juego)}</div>
                    <div class="juego-info d-flex flex-column">
                        <span class="juego-titulo">${escapar(juego.titulo)}</span>
                        <span class="fila-meta">${escapar(juego.genero)} · ${juego.clasificacion_edad} · ${textoDlc(juego.dlcs.length)}</span>
                    </div>
                    <span class="juego-precio">${juego.precio_creditos} créditos</span>
                    <div class="d-flex gap-2 ms-auto ms-md-0">
                        <button class="btn btn-outline-secondary" type="button" data-bs-toggle="modal"
                            data-bs-target="#modalDetalle" data-id="${juego.id}">Ver</button>
                        <button class="btn btn-outline-secondary" type="button" data-bs-toggle="collapse"
                            data-bs-target="#editarJuego${juego.id}" aria-expanded="false"
                            aria-controls="editarJuego${juego.id}">Editar</button>
                    </div>
                </div>

                <div class="collapse" id="editarJuego${juego.id}">
                    ${formularioEditarJuego(juego)}
                </div>
            </div>`).join("");
    }

    function formularioEditarJuego(juego) {
        const dlcs = juego.dlcs.length > 0
            ? juego.dlcs.map((dlc) => `
                <div class="mini-item"><span>${escapar(dlc.nombre)}</span><span class="fila-meta">${escapar(dlc.tipo_contenido)}</span></div>`).join("")
            : '<div class="mini-item"><span class="fila-meta">Sin DLC todavía</span></div>';

        return `
            <form enctype="multipart/form-data" method="post" data-juego-id="${juego.id}"
                class="form-edicion d-flex flex-column gap-3" novalidate>
                <div class="d-flex align-items-center gap-3">
                    <div class="portada ${colorPortada(juego.id)}" aria-hidden="true">${contenidoPortada(juego)}</div>
                    <div class="juego-info d-flex flex-column">
                        <span class="fila-label">Editando</span>
                        <strong>${escapar(juego.titulo)}</strong>
                    </div>
                    <label class="btn btn-outline-secondary boton-archivo">
                        Cambiar portada
                        <input id="portadaEditar${juego.id}" name="portada" class="visually-hidden"
                            type="file" accept="image/png, image/jpeg, image/webp">
                    </label>
                </div>
                <div class="row g-3">
                    <div class="col-12">
                        <label class="form-label" for="titulo${juego.id}">Título</label>
                        <input name="titulo" class="form-control" type="text" id="titulo${juego.id}"
                            value="${escapar(juego.titulo)}" maxlength="60">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label" for="genero${juego.id}">Género</label>
                        <select name="genero" class="form-select" id="genero${juego.id}">
                            ${opcionesTexto(GENEROS, juego.genero)}
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label" for="clasificacion${juego.id}">Clasificación de edad</label>
                        <select name="clasificacion_edad" class="form-select" id="clasificacion${juego.id}">
                            ${opcionesClasificacion(juego.clasificacion_edad)}
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label" for="precio${juego.id}">Precio en créditos</label>
                        <input name="precio_creditos" class="form-control" type="number" id="precio${juego.id}"
                            value="${juego.precio_creditos}" min="1" step="1">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label" for="specs${juego.id}">Especificaciones</label>
                        <input name="especificaciones" class="form-control" type="text" id="specs${juego.id}"
                            value="${escapar(juego.especificaciones)}">
                    </div>
                    <div class="col-12">
                        <label class="form-label" for="descripcion${juego.id}">Descripción</label>
                        <textarea name="descripcion" class="form-control" id="descripcion${juego.id}"
                            rows="2">${escapar(juego.descripcion)}</textarea>
                    </div>
                </div>
                <div class="d-flex flex-column gap-2">
                    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <span class="fila-label">DLC de este juego</span>
                        <span class="fila-meta">Se administran en la pestaña DLC</span>
                    </div>
                    ${dlcs}
                </div>
                <div class="alert alert-danger d-none mb-0" role="alert" data-error></div>
                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <button class="btn btn-link text-danger px-0" type="button" data-bs-toggle="modal"
                        data-bs-target="#modalRetirar" data-id="${juego.id}">Retirar del catálogo</button>
                    <div class="d-flex gap-2">
                        <button class="btn btn-link" type="button" data-bs-toggle="collapse"
                            data-bs-target="#editarJuego${juego.id}">Cancelar</button>
                        <button class="btn btn-primary" type="submit">Guardar</button>
                    </div>
                </div>
            </form>`;
    }

    function renderizarRetirados(retirados) {
        if (retirados.length === 0) {
            listaRetirados.innerHTML =
                '<div class="list-group-item vacio">No tienes videojuegos retirados.</div>';
            return;
        }

        listaRetirados.innerHTML = retirados.map((juego) => `
            <div class="list-group-item retirado">
                <div class="d-flex flex-wrap flex-md-nowrap align-items-center gap-3">
                    <div class="portada ${colorPortada(juego.id)}" aria-hidden="true">${contenidoPortada(juego)}</div>
                    <div class="juego-info d-flex flex-column">
                        <span class="juego-titulo">${escapar(juego.titulo)}</span>
                        <span class="fila-meta">${escapar(juego.genero)} · ${juego.clasificacion_edad} · ${textoDlc(juego.dlcs.length)}</span>
                    </div>
                    <span class="juego-precio">${juego.precio_creditos} créditos</span>
                    <div class="d-flex gap-2 ms-auto ms-md-0">
                        <button class="btn btn-outline-secondary" type="button" data-bs-toggle="modal"
                            data-bs-target="#modalDetalle" data-id="${juego.id}">Ver</button>
                    </div>
                </div>
            </div>`).join("");
    }

    function renderizarDlc(publicados) {
        chipsDlc.hidden = publicados.length === 0;

        if (publicados.length === 0) {
            chipsDlc.innerHTML = "";
            panesDlc.innerHTML = `
                <div class="list-group tarjeta">
                    <div class="list-group-item vacio">Publica un videojuego para poder agregarle DLC.</div>
                </div>`;
            return;
        }

        // Conservar la pestaña abierta si el videojuego sigue publicado
        if (!publicados.some((juego) => juego.id === juegoDlcActivo)) {
            juegoDlcActivo = publicados[0].id;
        }

        chipsDlc.innerHTML = publicados.map((juego) => {
            const activo = juego.id === juegoDlcActivo;

            return `
                <li class="nav-item" role="presentation">
                    <button class="nav-link${activo ? " active" : ""}" id="chipJuego${juego.id}" type="button"
                        role="tab" data-bs-toggle="pill" data-bs-target="#dlcJuego${juego.id}"
                        aria-controls="dlcJuego${juego.id}" aria-selected="${activo}" data-juego-id="${juego.id}">
                        <span class="portada ${colorPortada(juego.id)}" aria-hidden="true">${contenidoPortada(juego)}</span>${escapar(juego.titulo)} · ${juego.dlcs.length}
                    </button>
                </li>`;
        }).join("");

        panesDlc.innerHTML = publicados.map((juego) => {
            const activo = juego.id === juegoDlcActivo;

            const filas = juego.dlcs.length > 0
                ? juego.dlcs.map(filaDlc).join("")
                : `<div class="list-group-item vacio">${escapar(juego.titulo)} todavía no tiene DLC.</div>`;

            return `
                <div class="tab-pane fade${activo ? " show active" : ""}" id="dlcJuego${juego.id}" role="tabpanel"
                    aria-labelledby="chipJuego${juego.id}" tabindex="0">
                    <div class="list-group tarjeta">
                        ${filas}
                        ${filaAgregarDlc(juego)}
                    </div>
                </div>`;
        }).join("");
    }

    function filaDlc(dlc) {
        return `
            <div class="list-group-item">
                <div class="d-flex align-items-center justify-content-between gap-3">
                    <div class="d-flex flex-column">
                        <span class="fila-label">${escapar(dlc.tipo_contenido)}</span>
                        <span class="fila-valor">${escapar(dlc.nombre)}</span>
                        <span class="fila-meta">${escapar(dlc.descripcion)}</span>
                    </div>
                    <div class="d-flex gap-1 flex-shrink-0">
                        <button class="btn btn-outline-secondary" type="button" data-bs-toggle="collapse"
                            data-bs-target="#editarDlc${dlc.id}" aria-expanded="false"
                            aria-controls="editarDlc${dlc.id}">Editar</button>
                        <button class="btn btn-link text-danger" type="button" data-bs-toggle="modal"
                            data-bs-target="#modalEliminarDlc" data-id="${dlc.id}">Eliminar</button>
                    </div>
                </div>
                <div class="collapse" id="editarDlc${dlc.id}">
                    <form method="post" data-dlc-id="${dlc.id}" class="form-edicion d-flex flex-column gap-3" novalidate>
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label" for="nombreDlc${dlc.id}">Nombre del DLC</label>
                                <input name="nombre" class="form-control" type="text" id="nombreDlc${dlc.id}"
                                    value="${escapar(dlc.nombre)}" maxlength="60">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label" for="tipoDlc${dlc.id}">Tipo de contenido</label>
                                <select name="tipo_contenido" class="form-select" id="tipoDlc${dlc.id}">
                                    ${opcionesTexto(TIPOS_DLC, dlc.tipo_contenido)}
                                </select>
                            </div>
                            <div class="col-12">
                                <label class="form-label" for="descDlc${dlc.id}">Descripción</label>
                                <textarea name="descripcion" class="form-control" id="descDlc${dlc.id}"
                                    rows="2">${escapar(dlc.descripcion)}</textarea>
                            </div>
                        </div>
                        <div class="alert alert-danger d-none mb-0" role="alert" data-error></div>
                        <div class="d-flex justify-content-end gap-2">
                            <button class="btn btn-link" type="button" data-bs-toggle="collapse"
                                data-bs-target="#editarDlc${dlc.id}">Cancelar</button>
                            <button class="btn btn-primary" type="submit">Guardar</button>
                        </div>
                    </form>
                </div>
            </div>`;
    }

    function filaAgregarDlc(juego) {
        return `
            <div class="list-group-item p-0">
                <button class="btn btn-link dlc-agregar" type="button" data-bs-toggle="collapse"
                    data-bs-target="#agregarDlc${juego.id}" aria-expanded="false" aria-controls="agregarDlc${juego.id}">
                    <span class="mas" aria-hidden="true">+</span>Agregar DLC a ${escapar(juego.titulo)}
                </button>
                <div class="collapse px-3 pb-3" id="agregarDlc${juego.id}">
                    <form method="post" data-nuevo-dlc-juego="${juego.id}"
                        class="form-edicion mt-0 d-flex flex-column gap-3" novalidate>
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label" for="nombreNuevoDlc${juego.id}">Nombre del DLC</label>
                                <input name="nombre" class="form-control" type="text"
                                    id="nombreNuevoDlc${juego.id}" maxlength="60">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label" for="tipoNuevoDlc${juego.id}">Tipo de contenido</label>
                                <select name="tipo_contenido" class="form-select" id="tipoNuevoDlc${juego.id}">
                                    ${opcionesTexto(TIPOS_DLC, TIPOS_DLC[0])}
                                </select>
                            </div>
                            <div class="col-12">
                                <label class="form-label" for="descNuevoDlc${juego.id}">Descripción</label>
                                <textarea name="descripcion" class="form-control" id="descNuevoDlc${juego.id}"
                                    rows="2" placeholder="Qué incluye este contenido"></textarea>
                            </div>
                        </div>
                        <div class="alert alert-danger d-none mb-0" role="alert" data-error></div>
                        <div class="d-flex justify-content-end gap-2">
                            <button class="btn btn-link" type="button" data-bs-toggle="collapse"
                                data-bs-target="#agregarDlc${juego.id}">Cancelar</button>
                            <button class="btn btn-primary" type="submit">Agregar</button>
                        </div>
                    </form>
                </div>
            </div>`;
    }

    function detalleJuego(juego) {
        const retirado = juego.estado === "retirado";
        const dlcs = juego.dlcs.length > 0
            ? juego.dlcs.map((dlc) => escapar(dlc.nombre)).join(" · ")
            : "Sin DLC";

        const filas = [
            ["Descripción", escapar(juego.descripcion)],
            ["Clasificación de edad", CLASIFICACIONES[juego.clasificacion_edad]],
            ["Especificaciones", escapar(juego.especificaciones) || "No especificadas"],
            ["Contenido descargable", dlcs]
        ];

        if (retirado) {
            filas.push(["Estado", "Ya no se puede adquirir; sigue en las bibliotecas de quienes lo compraron."]);
        } else {
            filas.push(["Calificación promedio", juego.total_resenas > 0 && typeof juego.calificacion_promedio === "number"
                ? `★ ${juego.calificacion_promedio.toFixed(1)} (${juego.total_resenas} ${juego.total_resenas === 1 ? "reseña" : "reseñas"})`
                : "Sin reseñas todavía"]);
        }

        return `
            <div class="modal-header gap-3">
                <div class="portada portada-lg ${colorPortada(juego.id)}${retirado ? " portada-retirada" : ""}" aria-hidden="true">${contenidoPortada(juego)}</div>
                <div class="d-flex flex-column gap-1 me-auto">
                    <span class="${retirado ? "estado-retirado" : "estado-publicado"} small">${retirado ? "Retirado" : "Publicado"}</span>
                    <h2 class="modal-title" id="detalleTitulo">${escapar(juego.titulo)}</h2>
                    <span class="fila-meta">${escapar(juego.genero)} · ${juego.precio_creditos} créditos</span>
                </div>
                <button type="button" class="btn-close align-self-start" data-bs-dismiss="modal"
                    aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
                <div class="list-group tarjeta">
                    ${filas.map(([etiqueta, valor]) => `
                    <div class="list-group-item d-flex flex-column"><span class="fila-label">${etiqueta}</span><span
                            class="fila-valor">${valor}</span></div>`).join("")}
                </div>
            </div>
            <div class="modal-footer${retirado ? "" : " justify-content-between"}">
                ${retirado ? "" : `<button type="button" class="btn btn-link text-danger px-0" data-bs-target="#modalRetirar"
                    data-bs-toggle="modal" data-id="${juego.id}">Retirar del catálogo</button>`}
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            </div>`;
    }


    // ---------- Eventos ----------

    // Detalle de un videojuego
    modalDetalle.addEventListener("show.bs.modal", (event) => {
        const juego = buscarJuego(event.relatedTarget?.dataset.id);
        if (!juego) {
            event.preventDefault();
            return;
        }

        modalDetalle.querySelector(".modal-content").innerHTML = detalleJuego(juego);
    });

    // Publicar un videojuego
    formPublicar.addEventListener("submit", (event) => {
        event.preventDefault();

        enviarFormulario(
            formPublicar,
            () => leerDatosJuego(formPublicar, true).then((datos) => api("/api/videojuegos", "POST", datos)),
            (respuesta) => {
                cerrarModal(el("modalPublicar"));
                mostrarAlerta(`"${respuesta.videojuego.titulo}" se publicó correctamente.`);
                cargarJuegos();
            }
        );
    });

    // Mostrar la portada elegida antes de guardarla
    function mostrarVistaPrevia(input, contenedor, textoOriginal) {
        const archivo = input.files[0];

        if (!archivo || !FORMATOS_PORTADA.includes(archivo.type)) {
            contenedor.textContent = textoOriginal;
            return;
        }

        const imagen = document.createElement("img");

        imagen.alt = "";
        imagen.src = URL.createObjectURL(archivo);
        imagen.onload = () => URL.revokeObjectURL(imagen.src);
        contenedor.replaceChildren(imagen);
    }

    formPublicar.elements.portada.addEventListener("change", (event) => {
        mostrarVistaPrevia(event.target, formPublicar.querySelector(".portada-preview"), "+ Portada");
    });

    listaPublicados.addEventListener("change", (event) => {
        if (event.target.name !== "portada") return;

        const form = event.target.closest("form[data-juego-id]");
        const miniatura = form?.querySelector(".portada");
        const juego = buscarJuego(form?.dataset.juegoId);

        if (!miniatura || !juego) return;

        if (event.target.files[0]) {
            mostrarVistaPrevia(event.target, miniatura, "");
        } else {
            miniatura.innerHTML = contenidoPortada(juego);
        }
    });

    // Limpiar el formulario al cerrar la ventana de publicación
    el("modalPublicar").addEventListener("hidden.bs.modal", () => {
        formPublicar.reset();
        formPublicar.querySelector(".portada-preview").textContent = "+ Portada";
        formPublicar.querySelector("[data-error]").classList.add("d-none");
    });

    // Editar un videojuego
    listaPublicados.addEventListener("submit", (event) => {
        event.preventDefault();

        const form = event.target.closest("form[data-juego-id]");

        if (!form) return;

        const id = form.dataset.juegoId;

        enviarFormulario(
            form,
            () => leerDatosJuego(form, false).then((datos) => api(`/api/videojuegos/${id}`, "PUT", datos)),
            async (respuesta) => {
                await cargarJuegos();
                mostrarAlerta(`"${respuesta.videojuego.titulo}" se actualizó correctamente.`);
            }
        );
    });

    // Retirar un videojuego: se recuerda cuál se eligió al abrir la confirmación
    modalRetirar.addEventListener("show.bs.modal", (event) => {
        juegoPorRetirar = buscarJuego(event.relatedTarget?.dataset.id);

        if (!juegoPorRetirar) {
            event.preventDefault();
            return;
        }

        el("modalRetirarTitulo").textContent = `¿Retirar «${juegoPorRetirar.titulo}» del catálogo?`;
        el("errorRetirar").classList.add("d-none");
    });

    el("btnConfirmarRetiro").addEventListener("click", (event) => {
        if (!juegoPorRetirar) return;

        const boton = event.currentTarget;
        const juego = juegoPorRetirar;

        boton.disabled = true;

        api(`/api/videojuegos/${juego.id}`, "DELETE")
            .then(() => {
                cerrarModal(modalRetirar);
                mostrarAlerta(`"${juego.titulo}" se retiró del catálogo.`);
                cargarJuegos();
            })
            .catch((error) => {
                el("errorRetirar").textContent = error.message;
                el("errorRetirar").classList.remove("d-none");
            })
            .finally(() => {
                boton.disabled = false;
            });
    });

    chipsDlc.addEventListener("shown.bs.tab", (event) => {
        juegoDlcActivo = event.target.dataset.juegoId;
    });

    // Agregar o editar un DLC
    panesDlc.addEventListener("submit", (event) => {
        event.preventDefault();

        const form = event.target.closest("form");

        if (!form) return;

        const datos = leerDatosDlc(form);

        if (form.dataset.nuevoDlcJuego) {
            const idJuego = form.dataset.nuevoDlcJuego;
            const juego = buscarJuego(idJuego);

            enviarFormulario(
                form,
                () => api("/api/dlcs", "POST", { id_videojuego: idJuego, ...datos }),
                (respuesta) => {
                    mostrarAlerta(`El DLC "${respuesta.dlc.nombre}" se agregó a "${juego.titulo}".`);
                    cargarJuegos();
                }
            );
        } else if (form.dataset.dlcId) {
            const idDlc = form.dataset.dlcId;

            enviarFormulario(
                form,
                () => api(`/api/dlcs/${idDlc}`, "PUT", datos),
                (respuesta) => {
                    mostrarAlerta(`El DLC "${respuesta.dlc.nombre}" se actualizó correctamente.`);
                    cargarJuegos();
                }
            );
        }
    });

    // Eliminar un DLC
    modalEliminarDlc.addEventListener("show.bs.modal", (event) => {
        dlcPorEliminar = buscarDlc(event.relatedTarget?.dataset.id);

        if (!dlcPorEliminar) {
            event.preventDefault();
            return;
        }

        el("modalEliminarDlcTitulo").textContent = `¿Eliminar el DLC «${dlcPorEliminar.nombre}»?`;
        el("errorEliminarDlc").classList.add("d-none");
    });

    el("btnConfirmarEliminarDlc").addEventListener("click", (event) => {
        if (!dlcPorEliminar) return;

        const boton = event.currentTarget;
        const dlc = dlcPorEliminar;

        boton.disabled = true;

        api(`/api/dlcs/${dlc.id}`, "DELETE")
            .then(() => {
                cerrarModal(modalEliminarDlc);
                mostrarAlerta(`El DLC "${dlc.nombre}" se eliminó correctamente.`);
                cargarJuegos();
            })
            .catch((error) => {
                el("errorEliminarDlc").textContent = error.message;
                el("errorEliminarDlc").classList.remove("d-none");
            })
            .finally(() => {
                boton.disabled = false;
            });
    });


    // ---------- Inicio ----------

    el("nombreEstudio").textContent = usuario.nombre_usuario;
    el("marcaBanner").textContent = usuario.nombre_usuario;
    pintarAvatar(el("avatarEstudio"), usuario);
    api(`/api/desarrolladores/${usuario.id}`)
        .then((datos) => {
            const total = datos.desarrollador.seguidores;

            el("seguidoresPanel").textContent = `${total} ${total === 1 ? "seguidor" : "seguidores"}`;
        })
        .catch(() => {
            el("seguidoresPanel").textContent = "Seguidores no disponibles";
        });

    cargarJuegos();
})();
