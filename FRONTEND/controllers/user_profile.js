document.addEventListener("DOMContentLoaded", () => {

    const formNombre = document.getElementById("formEditarNombreUsuario");
    const btnGuardar = document.getElementById("btnGuardarNombre");
    const spinner = document.getElementById("spinnerGuardarNombre");
    const mensaje = document.getElementById("mensajeEditarNombre");

    const textoMensaje = document.getElementById("textoMensajeEditarNombre");
    const btnCerrarMensaje = document.getElementById("btnCerrarMensajeNombre");

    // Cerrar la alerta manualmente
    btnCerrarMensaje.addEventListener("click", () => {
        mensaje.classList.add("d-none");
    });

    formNombre.addEventListener("submit", (event) => {
        event.preventDefault();

        const usuario = JSON.parse(sessionStorage.getItem("usuario"));
        const nuevoNombre = document.getElementById("inputNombre").value.trim();

        // Validar el nombre
        if (nuevoNombre.length < 3 || nuevoNombre.length > 30) {
            textoMensaje.textContent = "El nombre debe tener entre 3 y 30 caracteres";
            mensaje.className = "alert alert-danger alert-dismissible mt-2 mb-0";
            return;
        }

        // Mostrar indicador de carga
        btnGuardar.disabled = true;
        spinner.classList.remove("d-none");
        mensaje.classList.add("d-none");

        fetch(`/api/users/${usuario.id}/name`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                nombre_usuario: nuevoNombre
            })
        })
            .then(response => {
                return response.json().then(datos => {
                    if (!response.ok) {
                        throw new Error(datos.message || "Error al actualizar nombre");
                    }

                    return datos;
                });
            })
            .then(datos => {
                const nombreActualizado = datos.user.nombre_usuario;

                // Actualizar la sesión temporal
                usuario.nombre_usuario = nombreActualizado;
                sessionStorage.setItem("usuario", JSON.stringify(usuario));

                // Actualizar información del perfil
                document.getElementById("infoNombreUsuario").textContent = nombreActualizado;
                document.getElementById("nombrePerfil").textContent = nombreActualizado;
                document.getElementById("nombreBanner").textContent = nombreActualizado;

                // Actualizar encabezado y avatares
                document.getElementById("nombreUsuarioNav").textContent = nombreActualizado;

                const iniciales = nombreActualizado.substring(0, 2).toUpperCase();

                document.getElementById("avatarUsuarioNav").textContent = iniciales;
                document.getElementById("avatarPerfil").textContent = iniciales;

                document.getElementById("nombrePerfilPublico").textContent = nombreActualizado;
                document.getElementById("avatarPerfilPublico").textContent = iniciales;

                // Mostrar confirmación
                textoMensaje.textContent = datos.message;
                mensaje.className = "alert alert-success alert-dismissible mt-2 mb-0";

                // Cerrar formulario
                const collapse = bootstrap.Collapse.getOrCreateInstance(
                    document.getElementById("editarNombre")
                );

                collapse.hide();
            })
            .catch(error => {
                textoMensaje.textContent = error.message;
                mensaje.className = "alert alert-danger alert-dismissible mt-2 mb-0";
            })
            .finally(() => {
                btnGuardar.disabled = false;
                spinner.classList.add("d-none");
            });
    });

    // Elementos del formulario de correo
    const formCorreo = document.getElementById("formEditarCorreoUsuario");
    const btnGuardarCorreo = document.getElementById("btnGuardarCorreo");
    const spinnerCorreo = document.getElementById("spinnerGuardarCorreo");
    const mensajeCorreo = document.getElementById("mensajeEditarCorreo");
    const textoMensajeCorreo = document.getElementById("textoMensajeEditarCorreo");
    const btnCerrarMensajeCorreo = document.getElementById("btnCerrarMensajeCorreo");

    // Cerrar la alerta manualmente
    btnCerrarMensajeCorreo.addEventListener("click", () => {
        mensajeCorreo.classList.add("d-none");
    });

    // EDITAR CORREO ELECTRÓNICO
    formCorreo.addEventListener("submit", (event) => {
        event.preventDefault();

        const usuario = JSON.parse(sessionStorage.getItem("usuario"));
        const nuevoCorreo = document.getElementById("inputCorreo").value.trim().toLowerCase();

        // Validar correo electrónico
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevoCorreo)) {
            textoMensajeCorreo.textContent = "El correo electrónico no es válido";
            mensajeCorreo.className = "alert alert-danger alert-dismissible mt-2 mb-0";
            return;
        }

        // Mostrar indicador de carga
        btnGuardarCorreo.disabled = true;
        spinnerCorreo.classList.remove("d-none");
        mensajeCorreo.classList.add("d-none");

        fetch(`/api/users/${usuario.id}/email`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                correo: nuevoCorreo
            })
        })
            .then(response => {
                return response.json().then(datos => {
                    if (!response.ok) {
                        throw new Error(datos.message || "Error al actualizar correo");
                    }

                    return datos;
                });
            })
            .then(datos => {
                const correoActualizado = datos.user.correo;

                // Actualizar la sesión temporal
                usuario.correo = correoActualizado;
                sessionStorage.setItem("usuario", JSON.stringify(usuario));

                // Actualizar la información del perfil
                document.getElementById("infoCorreoUsuario").textContent = correoActualizado;
                document.getElementById("inputCorreo").value = correoActualizado;

                // Mostrar confirmación
                textoMensajeCorreo.textContent = datos.message;
                mensajeCorreo.className = "alert alert-success alert-dismissible mt-2 mb-0";

                // Cerrar el formulario de edición
                const collapse = bootstrap.Collapse.getOrCreateInstance(
                    document.getElementById("editarCorreo")
                );

                collapse.hide();
            })
            .catch(error => {
                textoMensajeCorreo.textContent = error.message;
                mensajeCorreo.className = "alert alert-danger alert-dismissible mt-2 mb-0";
            })
            .finally(() => {
                btnGuardarCorreo.disabled = false;
                spinnerCorreo.classList.add("d-none");
            });
    });

    // Elementos del formulario de descripción pública
    const formDescripcion = document.getElementById("formEditarPerfilPublico");
    const inputDescripcion = document.getElementById("descripcionPublica");
    const btnGuardarDescripcion = document.getElementById("btnGuardarDescripcion");
    const spinnerDescripcion = document.getElementById("spinnerGuardarDescripcion");
    const mensajeDescripcion = document.getElementById("mensajeEditarDescripcion");
    const textoMensajeDescripcion = document.getElementById("textoMensajeEditarDescripcion");
    const btnCerrarMensajeDescripcion = document.getElementById("btnCerrarMensajeDescripcion");

    // Recuperar la descripción de la sesión temporal
    const usuarioActual = JSON.parse(sessionStorage.getItem("usuario"));

    if (usuarioActual) {
        const descripcion = usuarioActual.descripcion_publica || "";

        inputDescripcion.value = descripcion;

        document.getElementById("textoDescripcionPublica").textContent =
            descripcion || "Aún no has agregado una descripción pública.";
    }

    // Cerrar la alerta manualmente
    btnCerrarMensajeDescripcion.addEventListener("click", () => {
        mensajeDescripcion.classList.add("d-none");
    });

    // ACTUALIZAR DESCRIPCIÓN PÚBLICA
    formDescripcion.addEventListener("submit", (event) => {
        event.preventDefault();

        const usuario = JSON.parse(sessionStorage.getItem("usuario"));
        const nuevaDescripcion = inputDescripcion.value.trim();

        // Validar descripción
        if (nuevaDescripcion.length < 1 || nuevaDescripcion.length > 300) {
            textoMensajeDescripcion.textContent =
                "La descripción debe tener entre 1 y 300 caracteres";

            mensajeDescripcion.className =
                "alert alert-danger alert-dismissible mt-2 mb-0";

            return;
        }

        // Mostrar indicador de carga
        btnGuardarDescripcion.disabled = true;
        spinnerDescripcion.classList.remove("d-none");
        mensajeDescripcion.classList.add("d-none");

        fetch(`/api/users/${usuario.id}/description`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                descripcion_publica: nuevaDescripcion
            })
        })
            .then(response => {
                return response.json().then(datos => {
                    if (!response.ok) {
                        throw new Error(datos.message || "Error al actualizar descripción");
                    }

                    return datos;
                });
            })
            .then(datos => {
                const descripcionActualizada = datos.user.descripcion_publica;

                // Actualizar la sesión temporal
                usuario.descripcion_publica = descripcionActualizada;
                sessionStorage.setItem("usuario", JSON.stringify(usuario));

                // Actualizar la vista previa sin recargar
                document.getElementById("textoDescripcionPublica").textContent =
                    descripcionActualizada;

                inputDescripcion.value = descripcionActualizada;

                // Mostrar confirmación
                textoMensajeDescripcion.textContent = datos.message;
                mensajeDescripcion.className =
                    "alert alert-success alert-dismissible mt-2 mb-0";
            })
            .catch(error => {
                textoMensajeDescripcion.textContent = error.message;
                mensajeDescripcion.className =
                    "alert alert-danger alert-dismissible mt-2 mb-0";
            })
            .finally(() => {
                btnGuardarDescripcion.disabled = false;
                spinnerDescripcion.classList.add("d-none");
            });
    });

    // Elementos del formulario de cambio de contraseña
    const formContrasena = document.getElementById("formCambiarContrasena");
    const btnCambiarContrasena = document.getElementById("btnCambiarContrasena");
    const spinnerContrasena = document.getElementById("spinnerCambiarContrasena");
    const mensajeContrasena = document.getElementById("mensajeCambiarContrasena");
    const textoMensajeContrasena = document.getElementById("textoMensajeCambiarContrasena");
    const btnCerrarMensajeContrasena = document.getElementById("btnCerrarMensajeContrasena");

    // Cerrar alerta manualmente
    btnCerrarMensajeContrasena.addEventListener("click", () => {
        mensajeContrasena.classList.add("d-none");
    });

    // CAMBIAR CONTRASEÑA
    formContrasena.addEventListener("submit", (event) => {
        event.preventDefault();

        const usuario = JSON.parse(sessionStorage.getItem("usuario"));

        const contrasenaActual = document.getElementById("passActual").value;
        const contrasenaNueva = document.getElementById("passNueva").value;
        const confirmarContrasena = document.getElementById("passConfirmar").value;

        // Ocultar mensajes anteriores
        mensajeContrasena.classList.add("d-none");

        // Validar que las contraseñas coincidan
        if (contrasenaNueva !== confirmarContrasena) {
            textoMensajeContrasena.textContent =
                "Las nuevas contraseñas no coinciden";

            mensajeContrasena.className =
                "alert alert-danger alert-dismissible mt-3 mb-0";

            return;
        }

        // Mostrar indicador de carga
        btnCambiarContrasena.disabled = true;
        spinnerContrasena.classList.remove("d-none");

        fetch(`/api/users/${usuario.id}/password`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contrasena_actual: contrasenaActual,
                contrasena_nueva: contrasenaNueva,
                confirmar_contrasena: confirmarContrasena
            })
        })
            .then(response => {
                return response.json().then(datos => {
                    if (!response.ok) {
                        throw new Error(
                            datos.message || "Error al actualizar la contraseña"
                        );
                    }

                    return datos;
                });
            })
            .then(datos => {
                // Limpiar los campos después del cambio exitoso
                formContrasena.reset();

                // Mostrar mensaje de éxito
                textoMensajeContrasena.textContent = datos.message;
                mensajeContrasena.className =
                    "alert alert-success alert-dismissible mt-3 mb-0";
            })
            .catch(error => {
                textoMensajeContrasena.textContent = error.message;
                mensajeContrasena.className =
                    "alert alert-danger alert-dismissible mt-3 mb-0";
            })
            .finally(() => {
                btnCambiarContrasena.disabled = false;
                spinnerContrasena.classList.add("d-none");
            });
    });

    // Elementos del formulario de eliminación de cuenta
    const formEliminarCuenta = document.getElementById("formEliminarCuenta");
    const btnEliminarCuenta = document.getElementById("btnEliminarCuenta");
    const spinnerEliminarCuenta = document.getElementById("spinnerEliminarCuenta");
    const mensajeEliminarCuenta = document.getElementById("mensajeEliminarCuenta");
    const textoMensajeEliminarCuenta = document.getElementById("textoMensajeEliminarCuenta");

    // ELIMINAR CUENTA
    formEliminarCuenta.addEventListener("submit", (event) => {
        event.preventDefault();

        const usuario = JSON.parse(sessionStorage.getItem("usuario"));

        const contrasenaActual = document.getElementById("passEliminar").value;
        const confirmacion = document.getElementById("inputConfirmacion").value;

        // Ocultar mensajes anteriores
        mensajeEliminarCuenta.classList.add("d-none");

        // Comprobar que existe una sesión
        if (!usuario) {
            textoMensajeEliminarCuenta.textContent =
                "Debes iniciar sesión para realizar esta acción";

            mensajeEliminarCuenta.classList.remove("d-none");
            return;
        }

        // Validar la confirmación
        if (confirmacion !== "ELIMINAR") {
            textoMensajeEliminarCuenta.textContent =
                "Debes escribir ELIMINAR para confirmar";

            mensajeEliminarCuenta.classList.remove("d-none");
            return;
        }

        // Mostrar indicador de carga
        btnEliminarCuenta.disabled = true;
        spinnerEliminarCuenta.classList.remove("d-none");

        fetch(`/api/users/${usuario.id}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contrasena_actual: contrasenaActual,
                confirmacion: confirmacion
            })
        })
            .then(response => {
                return response.json().then(datos => {
                    if (!response.ok) {
                        throw new Error(
                            datos.message || "Error al eliminar la cuenta"
                        );
                    }

                    return datos;
                });
            })
            .then(datos => {
                // Eliminar los datos de la sesión temporal
                sessionStorage.removeItem("usuario");

                // Redirigir al inicio de sesión
                window.location.replace("/login.html");
            })
            .catch(error => {
                textoMensajeEliminarCuenta.textContent = error.message;
                mensajeEliminarCuenta.classList.remove("d-none");
            })
            .finally(() => {
                btnEliminarCuenta.disabled = false;
                spinnerEliminarCuenta.classList.add("d-none");
            });
    });
});
