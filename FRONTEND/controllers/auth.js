
const formLogin = document.getElementById("formIniciarSesion");
const formRegistro = document.getElementById("formRegistrarUsuario");

// Mostrar mensajes de éxito o error
function mostrarMensaje(id, mensaje, tipo) {
    const elemento = document.getElementById(id);

    elemento.textContent = mensaje;
    elemento.className = `alert alert-${tipo} mb-0`;
}

// Mostrar u ocultar indicadores de carga
function mostrarCarga(botonId, spinnerId, cargando) {
    const boton = document.getElementById(botonId);
    const spinner = document.getElementById(spinnerId);

    boton.disabled = cargando;
    spinner.classList.toggle("d-none", !cargando);
}

formLogin.addEventListener("submit", (event) => {
    event.preventDefault();

    const correo = document.getElementById("correoEntrar").value.trim();
    const contrasena = document.getElementById("passEntrar").value;

    document.getElementById("mensajeLogin").classList.add("d-none");

    mostrarCarga("btnIniciarSesion", "spinnerLogin", true);

    fetch("/api/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({ correo, contrasena })
    })
        .then(response => {
            return response.json().then(datos => {
                if (!response.ok) {
                    throw new Error(datos.message || "Error al iniciar sesión");
                }

                return datos;
            });
        })
        .then(datos => {
            const usuario = datos.user;

            // Comprobar el rol recibido del backend
            if (usuario.role !== "jugador" && usuario.role !== "desarrollador") {
                throw new Error("El servidor devolvió un rol no válido");
            }

            // Guardar los datos públicos del usuario en la sesión temporalj
            sessionStorage.setItem("usuario", JSON.stringify({
                id: usuario.id,
                nombre_usuario: usuario.nombre_usuario,
                correo: usuario.correo,
                role: usuario.role,
                creditos: usuario.creditos,
                descripcion_publica: usuario.descripcion_publica || ""
            }));

            // Redirigir según el rol
            if (usuario.role === "jugador") {
                window.location.href = "user_library.html";
            } else {
                window.location.href = "dev_profile.html";
            }
        })
        .catch(error => {
            mostrarMensaje("mensajeLogin", error.message, "danger");
        })
        .finally(() => {
            mostrarCarga("btnIniciarSesion", "spinnerLogin", false);
        });
});

formRegistro.addEventListener("submit", (event) => {
    event.preventDefault();

    const nombre_usuario = document.getElementById("nombreRegistro").value.trim();
    const correo = document.getElementById("correoRegistro").value.trim();
    const contrasena = document.getElementById("passRegistro").value;
    const role = document.querySelector('input[name="tipoCuenta"]:checked').value;

    document.getElementById("mensajeRegistro").classList.add("d-none");

    mostrarCarga("btnRegistrarUsuario", "spinnerRegistro", true);

    fetch("/api/auth/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({
            nombre_usuario,
            correo,
            contrasena,
            role
        })
    })
        .then(response => {
            return response.json().then(datos => {
                if (!response.ok) {
                    throw new Error(datos.message || "Error al registrar usuario");
                }

                return datos;
            });
        })
        .then(datos => {
            mostrarMensaje(
                "mensajeRegistro",
                "Cuenta creada correctamente. Ahora puedes iniciar sesión.",
                "success"
            );

            formRegistro.reset();
        })
        .catch(error => {
            mostrarMensaje("mensajeRegistro", error.message, "danger");
        })
        .finally(() => {
            mostrarCarga("btnRegistrarUsuario", "spinnerRegistro", false);
        });
});
