// Foto de perfil: elegir una imagen, recortarla y reducirla en el navegador,
// subirla al servidor o eliminarla. Se usa en user_profile.html (jugadores y desarrolladores).
document.addEventListener("DOMContentLoaded", () => {

    const inputFoto = document.getElementById("inputFotoPerfil");
    const btnEliminar = document.getElementById("btnEliminarFoto");
    const mensaje = document.getElementById("mensajeFoto");

    if (!inputFoto || !sessionStorage.getItem("usuario")) return;

    const LADO = 256;   // La foto se guarda de 256 x 256 px
    const TIPOS = ["image/png", "image/jpeg", "image/webp"];

    // Leer siempre la sesión actual (otros formularios, como el del nombre, también la cambian)
    function usuarioActual() {
        return JSON.parse(sessionStorage.getItem("usuario"));
    }

    function mostrarMensaje(texto, tipo) {
        mensaje.className = `small text-${tipo}`;
        mensaje.textContent = texto;
    }

    // Volver a pintar los avatares de la página (foto o iniciales)
    function pintarAvatares() {
        const usuario = usuarioActual();

        ["avatarUsuarioNav", "avatarPerfil", "avatarPerfilPublico"].forEach((id) => {
            pintarAvatar(document.getElementById(id), usuario);
        });

        btnEliminar.hidden = !usuario.foto_perfil;
    }

    // Recortar la imagen al centro (cuadrada) y reducirla a 256 x 256 en formato JPG
    function reducirImagen(archivo) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(archivo);
            const imagen = new Image();

            imagen.onload = () => {
                const lado = Math.min(imagen.width, imagen.height);
                const lienzo = document.createElement("canvas");

                lienzo.width = LADO;
                lienzo.height = LADO;

                lienzo.getContext("2d").drawImage(
                    imagen,
                    (imagen.width - lado) / 2, (imagen.height - lado) / 2, lado, lado,
                    0, 0, LADO, LADO
                );

                URL.revokeObjectURL(url);
                resolve(lienzo.toDataURL("image/jpeg", 0.85));
            };

            imagen.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("No se pudo leer la imagen"));
            };

            imagen.src = url;
        });
    }

    // PATCH = subir o cambiar, DELETE = eliminar
    function enviarFoto(metodo, foto) {
        const usuario = usuarioActual();

        return apiFetch(`/api/users/${usuario.id}/photo`, {
            method: metodo,
            headers: { "Content-Type": "application/json" },
            body: foto ? JSON.stringify({ foto_perfil: foto }) : undefined
        })
            .then((response) => response.json().then((datos) => {
                if (!response.ok) {
                    throw new Error(datos.message || "No se pudo guardar la foto");
                }

                return datos;
            }))
            .then((datos) => {
                // Guardar la foto nueva en la sesión y actualizar la página
                const actualizado = usuarioActual();

                actualizado.foto_perfil = datos.user.foto_perfil;
                sessionStorage.setItem("usuario", JSON.stringify(actualizado));

                pintarAvatares();
                mostrarMensaje(datos.message, "success");
            });
    }

    // Elegir una imagen
    inputFoto.addEventListener("change", () => {
        const archivo = inputFoto.files[0];

        inputFoto.value = "";   // Permite volver a elegir la misma imagen

        if (!archivo) return;

        if (!TIPOS.includes(archivo.type)) {
            mostrarMensaje("Elige una imagen PNG, JPG o WEBP", "danger");
            return;
        }

        if (archivo.size > 10 * 1024 * 1024) {
            mostrarMensaje("La imagen no puede superar los 10 MB", "danger");
            return;
        }

        mostrarMensaje("Subiendo foto...", "secondary");
        mensaje.insertAdjacentHTML("afterbegin", '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>');

        reducirImagen(archivo)
            .then((foto) => enviarFoto("PATCH", foto))
            .catch((error) => mostrarMensaje(error.message, "danger"));
    });

    // Eliminar la foto
        btnEliminar.addEventListener("click", async () => {
                if (!(await confirmar("Volverán a mostrarse tus iniciales en lugar de la foto.", { titulo: "¿Eliminar tu foto de perfil?", textoBoton: "Sí, eliminar" }))) return;

        btnEliminar.disabled = true;

        enviarFoto("DELETE")
            .catch((error) => mostrarMensaje(error.message, "danger"))
            .finally(() => {
                btnEliminar.disabled = false;
            });
    });

    pintarAvatares();
});