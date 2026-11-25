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