// Pestaña "Mis reseñas" del perfil: ver, editar y borrar las reseñas del usuario.
document.addEventListener("DOMContentLoaded", () => {

    const usuario = JSON.parse(sessionStorage.getItem("usuario"));
    const lista = document.getElementById("listaMisResenas");

    if (!usuario || !lista) return;


    function escapar(texto) {
        return String(texto ?? "").replace(/[&<>"']/g, (caracter) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[caracter]));
    }


    function cargarMisResenas() {
        lista.innerHTML = `<div class="list-group-item fila-meta">
            <span class="spinner-border spinner-border-sm"></span> Cargando reseñas...</div>`;

        apiFetch(`/api/resenas?usuario_id=${usuario.id}`)
            .then((response) => response.json())
            .then((datos) => {
                if (datos.resenas.length === 0) {
                    lista.innerHTML = `<div class="list-group-item fila-meta">
                        Todavía no has escrito reseñas. Puedes escribirlas desde el catálogo.</div>`;
                    return;
                }

                lista.innerHTML = datos.resenas.map(tarjetaResena).join("");
            })
            .catch(() => {
                lista.innerHTML = `<div class="list-group-item text-danger">No se pudieron cargar tus reseñas</div>`;
            });
    }


    function tarjetaResena(resena) {
        const opciones = [5, 4, 3, 2, 1].map((numero) =>
            `<option value="${numero}" ${resena.estrellas === numero ? "selected" : ""}>${"★".repeat(numero)}</option>`
        ).join("");

        return `
            <div class="list-group-item d-flex flex-column gap-2" data-id="${resena.id}">
                <span class="fila-label">Reseña de</span>
                <strong class="fila-valor">${escapar(resena.titulo_juego)}</strong>
                <select class="form-select estrellas">${opciones}</select>
                <textarea class="form-control texto" rows="3" maxlength="500">${escapar(resena.texto)}</textarea>

                ${resena.respuesta ? `
                <div class="border-start border-primary border-3 ps-2">
                    <span class="fila-meta">Respuesta del desarrollador</span>
                    <p class="mb-0">${escapar(resena.respuesta)}</p>
                </div>` : ""}
                
                <div class="mensaje"></div>
                <div class="d-flex gap-2">
                    <button class="btn btn-primary btn-guardar" type="button">Guardar cambios</button>
                    <button class="btn btn-outline-danger btn-borrar" type="button">Borrar</button>
                </div>
            </div>`;
    }

    function mostrarMensaje(tarjeta, texto, tipo) {
        tarjeta.querySelector(".mensaje").innerHTML =
            `<div class="alert alert-${tipo} py-2 mb-0">${escapar(texto)}</div>`;
    }


    lista.addEventListener("click", (event) => {
        const tarjeta = event.target.closest("[data-id]");

        if (!tarjeta) return;

        const id = tarjeta.dataset.id;


        if (event.target.classList.contains("btn-guardar")) {
            const datos = {
                estrellas: Number(tarjeta.querySelector(".estrellas").value),
                texto: tarjeta.querySelector(".texto").value.trim()
            };

            if (datos.texto.length < 5) {
                mostrarMensaje(tarjeta, "La reseña debe tener al menos 5 caracteres", "danger");
                return;
            }

            mostrarMensaje(tarjeta, "Guardando...", "secondary");

            apiFetch(`/api/resenas/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(datos)
            })
                .then((response) => response.json().then((respuesta) => {
                    if (!response.ok) throw new Error(respuesta.message);

                    mostrarMensaje(tarjeta, "Reseña actualizada", "success");
                }))
                .catch((error) => mostrarMensaje(tarjeta, error.message, "danger"));
        }


        if (event.target.classList.contains("btn-borrar")) {
            if (!confirm("¿Seguro que quieres borrar esta reseña?")) return;

            apiFetch(`/api/resenas/${id}`, {
                method: "DELETE"
            })
                .then((response) => response.json().then((respuesta) => {
                    if (!response.ok) throw new Error(respuesta.message);

                    cargarMisResenas();   
                }))
                .catch((error) => mostrarMensaje(tarjeta, error.message, "danger"));
        }
    });

    cargarMisResenas();
});