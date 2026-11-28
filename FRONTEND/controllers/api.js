// Eliminar los datos de la sesión
function invalidarSesion(redirigir = true) {
    sessionStorage.removeItem("usuario");
    sessionStorage.removeItem("token");

    if (redirigir) {
        window.location.replace("login.html");
    }
}

// Realizar peticiones incluyendo el token de autenticación
async function apiFetch(url, opciones = {}) {
    const token = sessionStorage.getItem("token");
    const headers = new Headers(opciones.headers || {});

    const destino = new URL(url, window.location.origin);

    const esApiPropia =
        destino.origin === window.location.origin &&
        destino.pathname.startsWith("/api/");

    // Agregar el token únicamente a nuestra API
    if (token && esApiPropia) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(url, {
        ...opciones,
        headers
    });

    // Comprobar errores de autenticación
    if (esApiPropia && response.status === 401) {
        const datos = await response.clone().json().catch(() => ({}));

        if (
            datos.code === "AUTH_REQUIRED" &&
            token === sessionStorage.getItem("token")
        ) {
            const esPublico =
                window.location.pathname.endsWith("/store_public.html");

            invalidarSesion(!esPublico);
        }
    }

    return response;
}


function pintarAvatar(elemento, persona) {
    if (!elemento || !persona) return;

    elemento.textContent = "";

    if (persona.foto_perfil) {
        const imagen = document.createElement("img");

        imagen.src = persona.foto_perfil;
        imagen.alt = "";
        imagen.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";

        elemento.style.overflow = "hidden";
        elemento.appendChild(imagen);
    } else {
        elemento.textContent = persona.nombre_usuario.slice(0, 2).toUpperCase();
    }
}




function mostrarAviso(texto, tipo = "success") {
    let contenedor = document.getElementById("contenedorAvisos");


    if (!contenedor) {
        contenedor = document.createElement("div");
        contenedor.id = "contenedorAvisos";
        contenedor.className = "toast-container position-fixed bottom-0 end-0 p-3";
        contenedor.style.zIndex = "1090";
        document.body.appendChild(contenedor);
    }

    const aviso = document.createElement("div");

    aviso.className = `toast align-items-center text-bg-${tipo} border-0`;
    aviso.setAttribute("role", tipo === "danger" ? "alert" : "status");
    aviso.innerHTML = `
        <div class="d-flex">
            <div class="toast-body"></div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto"
                data-bs-dismiss="toast" aria-label="Cerrar"></button>
        </div>`;


    aviso.querySelector(".toast-body").textContent = texto;

    contenedor.appendChild(aviso);
    aviso.addEventListener("hidden.bs.toast", () => aviso.remove());

    bootstrap.Toast.getOrCreateInstance(aviso, { delay: 4000 }).show();
}

function confirmar(texto, { titulo = "¿Estás seguro?", textoBoton = "Sí, continuar", peligro = true } = {}) {
    return new Promise((resolve) => {
        const modal = document.createElement("div");

        modal.className = "modal fade";
        modal.tabIndex = -1;
        modal.style.zIndex = "1070";   
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title fs-5"></h2>
                    </div>
                    <div class="modal-body">
                        <p class="mb-0"></p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn ${peligro ? "btn-danger" : "btn-primary"} btn-aceptar"></button>
                    </div>
                </div>
            </div>`;

        modal.querySelector(".modal-title").textContent = titulo;
        modal.querySelector(".modal-body p").textContent = texto;
        modal.querySelector(".btn-aceptar").textContent = textoBoton;

        document.body.appendChild(modal);

        const instancia = new bootstrap.Modal(modal);
        let aceptado = false;

        modal.querySelector(".btn-aceptar").addEventListener("click", () => {
            aceptado = true;
            instancia.hide();
        });


        modal.addEventListener("shown.bs.modal", () => {
            const fondos = document.querySelectorAll(".modal-backdrop");

            fondos[fondos.length - 1].style.zIndex = "1065";
        });

        modal.addEventListener("hidden.bs.modal", () => {
            instancia.dispose();
            modal.remove();

            if (document.querySelector(".modal.show")) {
                document.body.classList.add("modal-open");
            }

            resolve(aceptado);
        });

        instancia.show();
    });
}


function htmlCargando(texto = "Cargando...") {
    return `
        <div class="d-flex align-items-center justify-content-center gap-2 py-4 text-secondary" role="status">
            <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <span>${texto}</span>
        </div>`;
}


function botonCargando(boton, cargando, texto = "Guardando...") {
    if (!boton) return;

    if (cargando) {

        if (boton.dataset.textoOriginal === undefined) {
            boton.dataset.textoOriginal = boton.innerHTML;
        }

        boton.disabled = true;
        boton.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${texto}`;
        return;
    }

    boton.disabled = false;

    if (boton.dataset.textoOriginal !== undefined) {
        boton.innerHTML = boton.dataset.textoOriginal;
        delete boton.dataset.textoOriginal;
    }
}

// ---------- Animaciones Lottie ----------
function prefiereMenosMovimiento() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}


function reproducirLottie(contenedor, nombre, { loop = false } = {}) {
    if (!contenedor || typeof lottie === "undefined") return null;

    contenedor.replaceChildren();

    const animacion = lottie.loadAnimation({
        container: contenedor,
        renderer: "svg",
        loop: loop,
        autoplay: !prefiereMenosMovimiento(),
        path: `/assets/lottie/${nombre}.json`
    });


    if (prefiereMenosMovimiento()) {
        animacion.addEventListener("DOMLoaded", () => {
            animacion.goToAndStop(animacion.totalFrames - 1, true);
        });
    }

    return animacion;
}


function celebrar() {
    if (typeof lottie === "undefined" || prefiereMenosMovimiento()) return;

    const capa = document.createElement("div");

    capa.setAttribute("aria-hidden", "true");
    capa.style.cssText = "position: fixed; inset: 0; pointer-events: none; z-index: 1100;";
    document.body.appendChild(capa);

    const animacion = lottie.loadAnimation({
        container: capa,
        renderer: "svg",
        loop: false,
        autoplay: true,
        path: "/assets/lottie/confeti.json",
        rendererSettings: { preserveAspectRatio: "xMidYMid slice" }
    });


    animacion.addEventListener("complete", () => {
        animacion.destroy();
        capa.remove();
    });
}