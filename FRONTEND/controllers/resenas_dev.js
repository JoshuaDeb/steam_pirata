document.addEventListener("DOMContentLoaded", () => {

    const usuario = JSON.parse(sessionStorage.getItem("usuario"));
    const lista = document.getElementById("listaResenasDev");
    const tab = document.getElementById("tabResenasDev");

    if (!usuario || !lista || !tab) return;


    function escapar(texto) {
        return String(texto ?? "").replace(/[&<>"']/g, (caracter) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[caracter]));
    }


    function cargarResenas() {
        lista.innerHTML = `<div class="list-group-item fila-meta">
            <span class="spinner-border spinner-border-sm"></span> Cargando reseñas...</div>`;

        fetch("/api/resenas/desarrollador", {
            headers: { "X-Usuario-Id": String(usuario.id) }
        })
            .then((response) => response.json())
            .then((datos) => {
                if (datos.resenas.length === 0) {
                    lista.innerHTML = `<div class="list-group-item fila-meta">
                        Todavía nadie ha reseñado tus juegos.</div>`;
                    return;
                }

                lista.innerHTML = datos.resenas.map(tarjetaResena).join("");
            })
            .catch(() => {
                lista.innerHTML = `<div class="list-group-item text-danger">No se pudieron cargar las reseñas</div>`;
            });
    }


    function tarjetaResena(resena) {
        return `
            <div class="list-group-item d-flex flex-column gap-2" data-id="${resena.id}">
                <span class="fila-meta">${escapar(resena.titulo_juego)}</span>
                <div>
                    <strong>${escapar(resena.nombre_usuario)}</strong>
                    <span class="text-warning">${"★".repeat(resena.estrellas)}</span>
                </div>
                <p class="mb-0">${escapar(resena.texto)}</p>

                <label class="form-label mb-0 mt-2">Tu respuesta</label>
                <textarea class="form-control respuesta" rows="2" maxlength="500"
                    placeholder="Escribe una respuesta para el jugador">${escapar(resena.respuesta || "")}</textarea>
                <div class="mensaje"></div>
                <div>
                    <button class="btn btn-primary btn-responder" type="button">
                        ${resena.respuesta ? "Guardar cambios" : "Responder"}
                    </button>
                </div>
            </div>`;
    }

    function mostrarMensaje(tarjeta, texto, tipo) {
        tarjeta.querySelector(".mensaje").innerHTML =
            `<div class="alert alert-${tipo} py-2 mb-0">${escapar(texto)}</div>`;
    }


    lista.addEventListener("click", (event) => {
        if (!event.target.classList.contains("btn-responder")) return;

        const tarjeta = event.target.closest("[data-id]");
        const texto = tarjeta.querySelector(".respuesta").value.trim();

        if (!texto) {
            mostrarMensaje(tarjeta, "Escribe una respuesta", "danger");
            return;
        }

        mostrarMensaje(tarjeta, "Guardando...", "secondary");

        fetch(`/api/resenas/${tarjeta.dataset.id}/respuesta`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-Usuario-Id": String(usuario.id)
            },
            body: JSON.stringify({ texto: texto })
        })
            .then((response) => response.json().then((respuesta) => {
                if (!response.ok) throw new Error(respuesta.message);

                mostrarMensaje(tarjeta, "Respuesta enviada al jugador", "success");
                event.target.textContent = "Guardar cambios";
            }))
            .catch((error) => mostrarMensaje(tarjeta, error.message, "danger"));
    });


    tab.addEventListener("shown.bs.tab", cargarResenas);
});