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
const accesoPermitido = usuario &&
    usuario.id != null &&
    permisos[pagina]?.includes(usuario.role);

if (!accesoPermitido) {
    let destino = "login.html";

    if (usuario?.id != null && usuario.role === "jugador") {
        destino = "user_library.html";
    } else if (usuario?.id != null && usuario.role === "desarrollador") {
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
        document.getElementById("tabsPerfil").classList.toggle("sin-creditos", !esJugador);
    }


    // Cerrar sesión
    const btnCerrarSesion = document.getElementById("btnCerrarSesion");

    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener("click", (event) => {
            event.preventDefault();

            sessionStorage.removeItem("usuario");

            window.location.replace("login.html");
        });
    }
});
