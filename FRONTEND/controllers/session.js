const permisos = {
    "store.html": ["jugador", "desarrollador"],
    "user_library.html": ["jugador"],
    "user_friends.html": ["jugador"],
    "user_profile.html": ["jugador", "desarrollador"],
    "dev_profile.html": ["desarrollador"]
};

// Obtener el usuario de la sesión
let usuario = null;

try {
    usuario = JSON.parse(sessionStorage.getItem("usuario"));
} catch (error) {
    sessionStorage.removeItem("usuario");
}

// Identificar la página actual
const pagina = window.location.pathname.split("/").pop();

// Comprobar acceso inmediatamente
const tokenSesion = sessionStorage.getItem("token");

const accesoPermitido = tokenSesion &&
    usuario &&
    usuario.id != null &&
    permisos[pagina]?.includes(usuario.role);

if (!accesoPermitido) {
    let destino = "login.html";

    if (!tokenSesion || !usuario?.id) {
        sessionStorage.removeItem("usuario");
        sessionStorage.removeItem("token");
    } else if (usuario.role === "jugador") {
        destino = "user_library.html";
    } else if (usuario.role === "desarrollador") {
        destino = "dev_profile.html";
    }

    window.location.replace(destino);
}

// Actualizar la interfaz cuando esté disponible el HTML
document.addEventListener("DOMContentLoaded", () => {

    if (!accesoPermitido) return;

    const nombreNav = document.getElementById("nombreUsuarioNav");
    const avatarNav = document.getElementById("avatarUsuarioNav");

    if (nombreNav) {
        nombreNav.textContent = usuario.nombre_usuario;
    }

    if (avatarNav) {
        avatarNav.textContent = usuario.nombre_usuario
            .substring(0, 2)
            .toUpperCase();
    }

    // Adaptar el catálogo según el rol
    if (pagina === "store.html") {
        const esJugador = usuario.role === "jugador";

        // Mostrar las opciones correspondientes
        document.getElementById("navBiblioteca").hidden = !esJugador;
        document.getElementById("navAmigos").hidden = !esJugador;
        document.getElementById("navPanel").hidden = esJugador;

        // Mostrar el banner correspondiente
        document.getElementById("bannerJugador").hidden = !esJugador;
        document.getElementById("bannerDesarrollador").hidden = esJugador;

        if (esJugador) {
            document.getElementById("saldoCreditosCatalogo").textContent =
                `${usuario.creditos} créditos`;
        }
    }


    // Adaptar el perfil según el rol
    if (pagina === "user_profile.html") {
        const esJugador = usuario.role === "jugador";

        // Navegación según el rol
        document.getElementById("navPerfilBiblioteca").hidden = !esJugador;
        document.getElementById("navPerfilAmigos").hidden = !esJugador;
        document.getElementById("navPerfilPanel").hidden = esJugador;

        // Información principal
        const nombre = usuario.nombre_usuario;

        document.getElementById("nombreBanner").textContent = nombre;
        document.getElementById("nombrePerfil").textContent = nombre;
        document.getElementById("avatarPerfil").textContent =
            nombre.substring(0, 2).toUpperCase();

        document.getElementById("rolPerfil").textContent = esJugador ? "Jugador" : "Desarrollador";

        document.getElementById("creditosPerfil").textContent = `${usuario.creditos} créditos`;

        // La compra de créditos es exclusiva de jugadores
        document.getElementById("tabCreditos").closest("li").hidden = !esJugador;
        document.getElementById("tabResenas").closest("li").hidden = !esJugador;
        document.getElementById("tabsPerfil").classList.toggle("sin-creditos", !esJugador);

        // Mostrar la información del usuario
        document.getElementById("infoNombreUsuario").textContent = usuario.nombre_usuario;
        document.getElementById("infoCorreoUsuario").textContent = usuario.correo;
        document.getElementById("infoRolUsuario").textContent = esJugador ? "Jugador" : "Desarrollador";

        // Preparar los campos de edición
        document.getElementById("inputNombre").value = usuario.nombre_usuario;
        document.getElementById("inputCorreo").value = usuario.correo;

        // Mostrar la información del perfil público
        document.getElementById("nombrePerfilPublico").textContent = usuario.nombre_usuario;
        document.getElementById("avatarPerfilPublico").textContent = usuario.nombre_usuario.substring(0, 2).toUpperCase();
        document.getElementById("rolPerfilPublico").textContent = esJugador ? "Jugador" : "Desarrollador";
    }


    // Actualizar el saldo de créditos desde el servidor. Los créditos pueden
    // cambiar sin que el usuario haga nada (por ejemplo, cuando un jugador compra
    // un videojuego de un desarrollador), así que el valor guardado al iniciar
    // sesión puede estar desactualizado.
    apiFetch("/api/auth/me", { credentials: "same-origin" })
        .then(response => response.ok ? response.json() : null)
        .then(datos => {
            if (!datos || !datos.user) return;

            // Comprobar que la sesión local coincida con el backend
            if (
                datos.user.id !== usuario.id ||
                datos.user.role !== usuario.role
            ) {
                invalidarSesion();
                return;
            }

            usuario.creditos = datos.user.creditos;
            sessionStorage.setItem("usuario", JSON.stringify(usuario));

            const saldoCatalogo = document.getElementById("saldoCreditosCatalogo");
            const saldoPerfil = document.getElementById("creditosPerfil");

            if (saldoCatalogo && usuario.role === "jugador") {
                saldoCatalogo.textContent = `${usuario.creditos} créditos`;
            }

            if (saldoPerfil) {
                saldoPerfil.textContent = `${usuario.creditos} créditos`;
            }
        })
        .catch(() => { /* Si falla, se conserva el saldo guardado */ });


    // Cerrar sesión
    const btnCerrarSesion = document.getElementById("btnCerrarSesion");

    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener("click", (event) => {
            event.preventDefault();
            invalidarSesion();
        });
    }
});
