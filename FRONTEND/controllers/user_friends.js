
document.addEventListener("DOMContentLoaded", () => {

    // Elementos de la búsqueda
    const inputBuscar = document.getElementById("buscarJugadores");
    const ordenJugadores = document.getElementById("ordenJugadores");
    const listaJugadores = document.getElementById("listaJugadores");
    const cargandoJugadores = document.getElementById("cargandoJugadores");
    const errorJugadores = document.getElementById("errorJugadores");
    const vacioJugadores = document.getElementById("vacioJugadores");

    // Elementos para la paginación
    const paginacionJugadores = document.getElementById("paginacionJugadores");
    const resumenPaginacion = document.getElementById("resumenPaginacionJugadores");
    const textoPagina = document.getElementById("textoPaginaJugadores");
    const btnAnterior = document.getElementById("btnPaginaAnterior");
    const btnSiguiente = document.getElementById("btnPaginaSiguiente");

    // Elementos de solicitudes recibidas
    const listaRecibidas = document.getElementById("listaRecibidas");
    const cargandoRecibidas = document.getElementById("cargandoRecibidas");
    const errorRecibidas = document.getElementById("errorRecibidas");
    const vacioRecibidas = document.getElementById("vacioRecibidas");

    // Elementos de solicitudes enviadas
    const listaEnviadas = document.getElementById("listaEnviadas");
    const cargandoEnviadas = document.getElementById("cargandoEnviadas");
    const errorEnviadas = document.getElementById("errorEnviadas");
    const vacioEnviadas = document.getElementById("vacioEnviadas");

    // Contadores de solicitudes
    const totalRecibidas = document.getElementById("totalRecibidas");
    const totalEnviadas = document.getElementById("totalEnviadas");
    const cuentaRecibidas = document.getElementById("cuentaRecibidas");
    const cuentaEnviadas = document.getElementById("cuentaEnviadas");

    const modalRechazar = document.getElementById("modalRechazar");
    const modalCancelar = document.getElementById("modalCancelar");

    const confirmarRechazar = document.getElementById("confirmarRechazar");
    const confirmarCancelar = document.getElementById("confirmarCancelar");

    let solicitudRechazar = null;
    let solicitudCancelar = null;

    // No cerrar automáticamente los modales antes de recibir respuesta
    confirmarRechazar.removeAttribute("data-bs-dismiss");
    confirmarCancelar.removeAttribute("data-bs-dismiss");

    // Elementos de Mis amigos
    const listaAmigos = document.getElementById("listaAmigos");
    const buscarAmigos = document.getElementById("buscarAmigos");
    const ordenAmigos = document.getElementById("ordenAmigos");
    const cargandoAmigos = document.getElementById("cargandoAmigos");
    const errorAmigos = document.getElementById("errorAmigos");
    const vacioAmigos = document.getElementById("vacioAmigos");

    const totalAmigos = document.getElementById("totalAmigos");
    const cuentaAmigos = document.getElementById("cuentaAmigos");

    const paginacionAmigos = document.getElementById("paginacionAmigos");
    const paginaInfoAmigos = document.getElementById("paginaInfoAmigos");
    const anteriorAmigos = document.getElementById("anteriorAmigos");
    const siguienteAmigos = document.getElementById("siguienteAmigos");

    const modalEliminarAmigo = document.getElementById("modalEliminarAmigo");
    const confirmarEliminarAmigo =
        document.getElementById("confirmarEliminarAmigo");

    confirmarEliminarAmigo.removeAttribute("data-bs-dismiss");

    let paginaAmigos = 1;
    let totalPaginasAmigos = 1;
    let ultimaConsultaAmigos = 0;
    let amistadAEliminar = null;

    const usuario = JSON.parse(sessionStorage.getItem("usuario"));

    if (!usuario || usuario.role !== "jugador") {
        return;
    }

    let ultimaConsulta = 0;
    let paginaActual = 1;
    let totalPaginas = 1;

    // Mostrar el perfil público de un jugador
    function mostrarPerfilJugador(jugador) {
        document.getElementById("tituloPerfilJugador").textContent = `Perfil de ${jugador.nombre_usuario}`;
        document.getElementById("nombreJugadorPublico").textContent = jugador.nombre_usuario;
        document.getElementById("avatarJugadorPublico").textContent = jugador.nombre_usuario.slice(0, 2).toUpperCase();
        document.getElementById("descripcionJugadorPublico").textContent = jugador.descripcion_publica || "Este jugador todavía no ha agregado una descripción pública.";
        const modal = document.getElementById("modalPerfilJugador");

        bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    // Crear una tarjeta para cada jugador
    function crearTarjetaJugador(jugador) {
        const tarjeta = document.createElement("div");
        tarjeta.className = "persona-card";

        // Avatar
        const avatar = document.createElement("div");
        avatar.className = "avatar-persona avatar-violeta";
        avatar.setAttribute("aria-hidden", "true");

        avatar.textContent = jugador.nombre_usuario.slice(0, 2).toUpperCase();

        // Datos del jugador
        const datos = document.createElement("div");
        datos.className = "persona-datos";

        const nombre = document.createElement("h3");
        nombre.className = "persona-nombre";
        nombre.textContent = jugador.nombre_usuario;

        const descripcion = document.createElement("p");
        descripcion.className = "persona-info";
        descripcion.textContent = jugador.descripcion_publica ? `Jugador - ${jugador.descripcion_publica}` : "Jugador - Sin descripción pública";

        datos.append(nombre, descripcion);

        // Acciones que conectaremos después
        const acciones = document.createElement("div");
        acciones.className = "persona-acciones";

        const btnPerfil = document.createElement("button");
        btnPerfil.type = "button";
        btnPerfil.className =
            "btn btn-outline-secondary btn-ver-perfil";
        btnPerfil.textContent = "Ver perfil";
        btnPerfil.addEventListener("click", () => {
            mostrarPerfilJugador(jugador);
        });

        const btnSolicitud = document.createElement("button");
        btnSolicitud.type = "button";
        btnSolicitud.className = "btn btn-primary btn-enviar";

        // Mostrar la acción según el estado real de la relación
        if (jugador.estado_relacion === "ninguna") {
            btnSolicitud.textContent = "+ Enviar solicitud";

            btnSolicitud.addEventListener("click", () => {
                enviarSolicitudAmistad(jugador, btnSolicitud);
            });

        } else if (jugador.estado_relacion === "pendiente_enviada") {
            btnSolicitud.textContent = "Solicitud enviada";
            btnSolicitud.disabled = true;

        } else if (jugador.estado_relacion === "pendiente_recibida") {
            btnSolicitud.textContent = "Solicitud recibida";
            btnSolicitud.disabled = true;

        } else if (jugador.estado_relacion === "amigos") {
            btnSolicitud.textContent = "Ya son amigos";
            btnSolicitud.disabled = true;

        } else {
            btnSolicitud.textContent = "No disponible";
            btnSolicitud.disabled = true;
        }

        acciones.append(btnPerfil, btnSolicitud);

        tarjeta.append(avatar, datos, acciones);

        return tarjeta;
    }

    // Enviar solicitud de amistad
    function enviarSolicitudAmistad(jugador, boton) {
        errorJugadores.classList.add("d-none");

        // Mostrar indicador de carga
        boton.disabled = true;
        boton.textContent = "Enviando...";

        let solicitudEnviada = false;

        fetch("/api/friends/request", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                solicitante_id: usuario.id,
                receptor_id: jugador.id
            })
        })
            .then(response => {
                return response.json().then(datos => {
                    if (!response.ok) {
                        throw new Error(
                            datos.message || "Error al enviar la solicitud"
                        );
                    }

                    return datos;
                });
            })
            .then(datos => {
                solicitudEnviada = true;

                // Actualizar el botón sin recargar
                boton.textContent = "Solicitud enviada";
                boton.disabled = true;

                // Actualizar las solicitudes enviadas y sus contadores
                cargarSolicitudes();
            })
            .catch(error => {
                errorJugadores.textContent = error.message;
                errorJugadores.classList.remove("d-none");

                // Permitir volver a intentar
                boton.textContent = "+ Enviar solicitud";
            })
            .finally(() => {
                if (!solicitudEnviada) {
                    boton.disabled = false;
                }
            });
    }

    // Crear tarjeta de solicitud recibida o enviada
    function crearTarjetaSolicitud(solicitud, tipo) {
        const jugador = solicitud.jugador;

        const tarjeta = document.createElement("div");
        tarjeta.className = "persona-card";

        // Avatar
        const avatar = document.createElement("div");
        avatar.className = "avatar-persona avatar-violeta";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = jugador.nombre_usuario
            .slice(0, 2)
            .toUpperCase();

        // Información del jugador
        const datos = document.createElement("div");
        datos.className = "persona-datos";

        const nombre = document.createElement("h3");
        nombre.className = "persona-nombre";
        nombre.textContent = jugador.nombre_usuario;

        const fecha = new Date(solicitud.fecha_creacion);
        const fechaTexto = Number.isNaN(fecha.getTime())
            ? "Fecha no disponible"
            : fecha.toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
                year: "numeric"
            });

        const informacion = document.createElement("p");
        informacion.className = "persona-info";

        informacion.textContent = tipo === "recibida"
            ? `Solicitud recibida el ${fechaTexto}`
            : `Solicitud enviada el ${fechaTexto}`;

        datos.append(nombre, informacion);

        // Acciones de la solicitud
        const acciones = document.createElement("div");
        acciones.className = "persona-acciones";

        const btnPerfil = document.createElement("button");
        btnPerfil.type = "button";
        btnPerfil.className =
            "btn btn-outline-secondary btn-ver-perfil";
        btnPerfil.textContent = "Ver perfil";
        btnPerfil.addEventListener("click", () => {
            mostrarPerfilJugador(jugador);
        });
        acciones.appendChild(btnPerfil);

        if (tipo === "recibida") {
            const btnAceptar = document.createElement("button");
            btnAceptar.type = "button";
            btnAceptar.className = "btn btn-primary btn-aceptar";
            btnAceptar.textContent = "Aceptar";
            btnAceptar.addEventListener("click", () => {
                aceptarSolicitudAmistad(solicitud, btnAceptar);
            });

            const btnRechazar = document.createElement("button");
            btnRechazar.type = "button";
            btnRechazar.className =
                "btn btn-link text-danger btn-rechazar";
            btnRechazar.textContent = "Rechazar";
            btnRechazar.addEventListener("click", () => {
                solicitudRechazar = solicitud;

                bootstrap.Modal.getOrCreateInstance(modalRechazar).show();
            });

            acciones.append(btnAceptar, btnRechazar);

        } else {
            const btnCancelar = document.createElement("button");
            btnCancelar.type = "button";
            btnCancelar.className =
                "btn btn-link text-danger btn-cancelar";
            btnCancelar.textContent = "Cancelar solicitud";
            btnCancelar.addEventListener("click", () => {
                solicitudCancelar = solicitud;

                bootstrap.Modal.getOrCreateInstance(modalCancelar).show();
            });

            const etiqueta = document.createElement("span");
            etiqueta.className = "etiqueta etiqueta-espera";
            etiqueta.textContent = "Pendiente";

            tarjeta.appendChild(etiqueta);
            acciones.appendChild(btnCancelar);
        }

        tarjeta.append(avatar, datos, acciones);

        return tarjeta;
    }


    // Crear tarjeta de un amigo
    function crearTarjetaAmigo(amistad) {
        const jugador = amistad.jugador;

        const tarjeta = document.createElement("div");
        tarjeta.className = "persona-card";

        const avatar = document.createElement("div");
        avatar.className = "avatar-persona avatar-violeta";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = jugador.nombre_usuario.slice(0, 2).toUpperCase();

        const datos = document.createElement("div");
        datos.className = "persona-datos";

        const nombre = document.createElement("h3");
        nombre.className = "persona-nombre";
        nombre.textContent = jugador.nombre_usuario;

        const fecha = new Date(amistad.fecha_aceptacion);
        const fechaTexto = Number.isNaN(fecha.getTime())
            ? "Fecha no disponible"
            : fecha.toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
                year: "numeric"
            });

        const info = document.createElement("p");
        info.className = "persona-info";
        info.textContent = `Amigos desde ${fechaTexto}`;

        datos.append(nombre, info);

        const acciones = document.createElement("div");
        acciones.className = "persona-acciones";

        const btnPerfil = document.createElement("button");
        btnPerfil.type = "button";
        btnPerfil.className = "btn btn-outline-secondary btn-ver-perfil";
        btnPerfil.textContent = "Ver perfil";
        btnPerfil.addEventListener("click", () => {
            mostrarPerfilJugador(jugador);
        });
        
        const btnEliminar = document.createElement("button");
        btnEliminar.type = "button";
        btnEliminar.className = "btn btn-link text-danger btn-eliminar-amigo";
        btnEliminar.textContent = "Eliminar amigo";

        btnEliminar.addEventListener("click", () => {
            amistadAEliminar = amistad;

            document.getElementById("tituloEliminarAmigo").textContent =
                `¿Eliminar amistad con ${jugador.nombre_usuario}?`;

            bootstrap.Modal.getOrCreateInstance(modalEliminarAmigo).show();
        });

        acciones.append(btnPerfil, btnEliminar);
        tarjeta.append(avatar, datos, acciones);

        return tarjeta;
    }


    // Consultar amistades aceptadas
    function cargarAmigos() {
        const numeroConsulta = ++ultimaConsultaAmigos;

        const parametros = new URLSearchParams({
            usuario_id: usuario.id,
            busqueda: buscarAmigos.value.trim(),
            orden: ordenAmigos.value,
            pagina: paginaAmigos
        });

        cargandoAmigos.classList.remove("d-none");
        errorAmigos.classList.add("d-none");
        vacioAmigos.hidden = true;
        paginacionAmigos.classList.add("d-none");

        anteriorAmigos.disabled = true;
        siguienteAmigos.disabled = true;
        listaAmigos.replaceChildren();

        fetch(`/api/friends/friends?${parametros.toString()}`)
            .then(response => response.json().then(datos => {
                if (!response.ok) {
                    throw new Error(datos.message || "Error al consultar amigos");
                }
                return datos;
            }))
            .then(datos => {
                if (numeroConsulta !== ultimaConsultaAmigos) return;

                if (!Array.isArray(datos.amigos) || !datos.paginacion) {
                    throw new Error("Respuesta de amistades inválida");
                }

                const paginacion = datos.paginacion;

                if (paginaAmigos > paginacion.totalPaginas) {
                    paginaAmigos = paginacion.totalPaginas;
                    cargarAmigos();
                    return;
                }

                paginaAmigos = paginacion.paginaActual;
                totalPaginasAmigos = paginacion.totalPaginas;

                datos.amigos.forEach(amistad => {
                    listaAmigos.appendChild(crearTarjetaAmigo(amistad));
                });

                totalAmigos.textContent = datos.totalAmigos;
                cuentaAmigos.textContent = datos.totalAmigos;

                vacioAmigos.hidden = datos.amigos.length > 0;

                paginaInfoAmigos.textContent =
                    `Página ${paginaAmigos} de ${totalPaginasAmigos}`;

                anteriorAmigos.disabled = paginaAmigos <= 1;
                siguienteAmigos.disabled = paginaAmigos >= totalPaginasAmigos;

                paginacionAmigos.classList.toggle(
                    "d-none",
                    paginacion.totalResultados === 0
                );
            })
            .catch(error => {
                if (numeroConsulta !== ultimaConsultaAmigos) return;

                errorAmigos.textContent = error.message;
                errorAmigos.classList.remove("d-none");
            })
            .finally(() => {
                if (numeroConsulta === ultimaConsultaAmigos) {
                    cargandoAmigos.classList.add("d-none");
                }
            });
    }


    // Eliminar amistad aceptada
    function confirmarEliminacionAmistad() {
        if (!amistadAEliminar || confirmarEliminarAmigo.disabled) return;

        confirmarEliminarAmigo.disabled = true;
        confirmarEliminarAmigo.textContent = "Eliminando...";
        errorAmigos.classList.add("d-none");

        fetch(`/api/friends/friend/${amistadAEliminar.id}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario_id: usuario.id
            })
        })
            .then(response => response.json().then(datos => {
                if (!response.ok) {
                    throw new Error(datos.message || "Error al eliminar amistad");
                }
                return datos;
            }))
            .then(() => {
                bootstrap.Modal.getOrCreateInstance(modalEliminarAmigo).hide();
                amistadAEliminar = null;

                cargarAmigos();
                cargarJugadores();
            })
            .catch(error => {
                bootstrap.Modal.getOrCreateInstance(modalEliminarAmigo).hide();

                errorAmigos.textContent = error.message;
                errorAmigos.classList.remove("d-none");
            })
            .finally(() => {
                confirmarEliminarAmigo.disabled = false;
                confirmarEliminarAmigo.textContent = "Eliminar amistad";
            });
    }

    // Aceptar una solicitud de amistad
    function aceptarSolicitudAmistad(solicitud, boton) {
        errorRecibidas.classList.add("d-none");

        boton.disabled = true;
        boton.textContent = "Aceptando...";

        let aceptada = false;

        fetch(`/api/friends/request/${solicitud.id}/accept`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                receptor_id: usuario.id
            })
        })
            .then(response => {
                return response.json().then(datos => {
                    if (!response.ok) {
                        throw new Error(
                            datos.message || "Error al aceptar la solicitud"
                        );
                    }

                    return datos;
                });
            })
            .then(datos => {
                aceptada = true;
                cargarSolicitudes();
                cargarJugadores();
                cargarAmigos();
            })
            .catch(error => {
                errorRecibidas.textContent = error.message;
                errorRecibidas.classList.remove("d-none");
            })
            .finally(() => {
                if (!aceptada) {
                    boton.disabled = false;
                    boton.textContent = "Aceptar";
                }
            });
    }

    // Rechazar o cancelar una solicitud pendiente
    function eliminarSolicitudAmistad(solicitud, tipo, boton, elementoModal) {
        const esRechazo = tipo === "rechazar";
        const mensajeError = esRechazo ? errorRecibidas : errorEnviadas;
        const textoOriginal = boton.textContent;

        mensajeError.classList.add("d-none");

        boton.disabled = true;
        boton.textContent = "Procesando...";

        fetch(`/api/friends/request/${solicitud.id}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario_id: usuario.id
            })
        })
            .then(response => {
                return response.json().then(datos => {
                    if (!response.ok) {
                        throw new Error(
                            datos.message || "Error al eliminar la solicitud"
                        );
                    }

                    return datos;
                });
            })
            .then(() => {
                // Cerrar el modal después de confirmar la eliminación
                bootstrap.Modal.getOrCreateInstance(elementoModal).hide();

                // Actualizar solicitudes, contadores y estados de búsqueda
                cargarSolicitudes();
                cargarJugadores();
            })
            .catch(error => {
                bootstrap.Modal.getOrCreateInstance(elementoModal).hide();

                mensajeError.textContent = error.message;
                mensajeError.classList.remove("d-none");
            })
            .finally(() => {
                boton.disabled = false;
                boton.textContent = textoOriginal;
            });
    }

    // Consultar solicitudes recibidas y enviadas
    function cargarSolicitudes() {
        // Mostrar indicadores de carga
        cargandoRecibidas.classList.remove("d-none");
        cargandoEnviadas.classList.remove("d-none");

        errorRecibidas.classList.add("d-none");
        errorEnviadas.classList.add("d-none");

        vacioRecibidas.hidden = true;
        vacioEnviadas.hidden = true;

        // Limpiar las listas anteriores
        listaRecibidas.replaceChildren();
        listaEnviadas.replaceChildren();

        fetch(`/api/friends/requests?usuario_id=${usuario.id}`)
            .then(response => {
                return response.json().then(datos => {
                    if (!response.ok) {
                        throw new Error(
                            datos.message || "Error al consultar solicitudes"
                        );
                    }

                    return datos;
                });
            })
            .then(datos => {
                if (
                    !Array.isArray(datos.recibidas) ||
                    !Array.isArray(datos.enviadas)
                ) {
                    throw new Error("Respuesta de solicitudes inválida");
                }

                // Mostrar solicitudes recibidas
                datos.recibidas.forEach(solicitud => {
                    listaRecibidas.appendChild(
                        crearTarjetaSolicitud(solicitud, "recibida")
                    );
                });

                // Mostrar solicitudes enviadas
                datos.enviadas.forEach(solicitud => {
                    listaEnviadas.appendChild(
                        crearTarjetaSolicitud(solicitud, "enviada")
                    );
                });

                // Mostrar estados vacíos
                vacioRecibidas.hidden = datos.recibidas.length > 0;
                vacioEnviadas.hidden = datos.enviadas.length > 0;

                // Actualizar contadores
                totalRecibidas.textContent = datos.recibidas.length;
                cuentaRecibidas.textContent = datos.recibidas.length;

                totalEnviadas.textContent = datos.enviadas.length;
                cuentaEnviadas.textContent = datos.enviadas.length;
            })
            .catch(error => {
                errorRecibidas.textContent = error.message;
                errorEnviadas.textContent = error.message;

                errorRecibidas.classList.remove("d-none");
                errorEnviadas.classList.remove("d-none");
            })
            .finally(() => {
                cargandoRecibidas.classList.add("d-none");
                cargandoEnviadas.classList.add("d-none");
            });
    }

    // Consultar jugadores con búsqueda, ordenamiento y paginación
    function cargarJugadores() {
        const numeroConsulta = ++ultimaConsulta;
        const busqueda = inputBuscar.value.trim();

        // Preparar parámetros para el backend
        const parametros = new URLSearchParams({
            usuario_id: usuario.id,
            busqueda: busqueda,
            pagina: paginaActual,
            orden: ordenJugadores.value === "reciente" ? "reciente" : "az"
        });

        // Mostrar indicador de carga
        cargandoJugadores.classList.remove("d-none");
        errorJugadores.classList.add("d-none");
        vacioJugadores.hidden = true;
        paginacionJugadores.classList.add("d-none");

        // Ocultar los resultados anteriores mientras se buscan nuevos
        listaJugadores.replaceChildren();

        btnAnterior.disabled = true;
        btnSiguiente.disabled = true;

        fetch(`/api/friends/search?${parametros.toString()}`)
            .then(response => {
                return response.json().then(datos => {
                    if (!response.ok) {
                        throw new Error(
                            datos.message || "Error al buscar jugadores"
                        );
                    }

                    return datos;
                });
            })
            .then(datos => {
                // Ignorar respuestas de consultas anteriores
                if (numeroConsulta !== ultimaConsulta) {
                    return;
                }

                if (
                    !Array.isArray(datos.jugadores) ||
                    !datos.paginacion
                ) {
                    throw new Error("Respuesta de jugadores inválida");
                }

                const jugadores = datos.jugadores;
                const paginacion = datos.paginacion;

                // Si la página dejó de existir, consultar la última
                if (paginaActual > paginacion.totalPaginas) {
                    paginaActual = paginacion.totalPaginas;
                    cargarJugadores();
                    return;
                }

                // Actualizar información de paginación
                paginaActual = paginacion.paginaActual;
                totalPaginas = paginacion.totalPaginas;

                // Limpiar resultados anteriores
                listaJugadores.replaceChildren();

                // Mostrar solamente los jugadores recibidos
                jugadores.forEach(jugador => {
                    listaJugadores.appendChild(
                        crearTarjetaJugador(jugador)
                    );
                });

                // Mostrar estado vacío si no hay resultados
                vacioJugadores.hidden = jugadores.length > 0;

                // Actualizar los controles de paginación
                if (paginacion.totalResultados > 0) {
                    const inicio =
                        (paginaActual - 1) * paginacion.porPagina + 1;

                    const fin = inicio + jugadores.length - 1;

                    resumenPaginacion.textContent = `Mostrando ${inicio}-${fin} de ` + `${paginacion.totalResultados} jugadores`;

                    textoPagina.textContent = `Página ${paginaActual} de ${totalPaginas}`;

                    btnAnterior.disabled = paginaActual <= 1;
                    btnSiguiente.disabled = paginaActual >= totalPaginas;

                    paginacionJugadores.classList.remove("d-none");
                }
            })
            .catch(error => {
                if (numeroConsulta !== ultimaConsulta) {
                    return;
                }

                listaJugadores.replaceChildren();
                vacioJugadores.hidden = true;
                paginacionJugadores.classList.add("d-none");

                errorJugadores.textContent = error.message;
                errorJugadores.classList.remove("d-none");
            })
            .finally(() => {
                if (numeroConsulta === ultimaConsulta) {
                    cargandoJugadores.classList.add("d-none");
                }
            });
    }

    // Buscar desde la primera página
    inputBuscar.addEventListener("input", () => {
        paginaActual = 1;
        cargarJugadores();
    });

    // Cambiar ordenamiento desde la primera página
    ordenJugadores.addEventListener("change", () => {
        paginaActual = 1;
        cargarJugadores();
    });

    // Regresar a la página anterior
    btnAnterior.addEventListener("click", () => {
        if (paginaActual > 1) {
            paginaActual--;
            cargarJugadores();
        }
    });

    // Avanzar a la siguiente página
    btnSiguiente.addEventListener("click", () => {
        if (paginaActual < totalPaginas) {
            paginaActual++;
            cargarJugadores();
        }
    });

    // Confirmar rechazo
    confirmarRechazar.addEventListener("click", () => {
        if (solicitudRechazar && !confirmarRechazar.disabled) {
            eliminarSolicitudAmistad(
                solicitudRechazar,
                "rechazar",
                confirmarRechazar,
                modalRechazar
            );
        }
    });

    // Confirmar cancelación
    confirmarCancelar.addEventListener("click", () => {
        if (solicitudCancelar && !confirmarCancelar.disabled) {
            eliminarSolicitudAmistad(
                solicitudCancelar,
                "cancelar",
                confirmarCancelar,
                modalCancelar
            );
        }
    });

    // Buscar amigos
    buscarAmigos.addEventListener("input", () => {
        paginaAmigos = 1;
        cargarAmigos();
    });

    // Ordenar amigos
    ordenAmigos.addEventListener("change", () => {
        paginaAmigos = 1;
        cargarAmigos();
    });

    // Paginar amigos
    anteriorAmigos.addEventListener("click", () => {
        if (paginaAmigos > 1) {
            paginaAmigos--;
            cargarAmigos();
        }
    });

    siguienteAmigos.addEventListener("click", () => {
        if (paginaAmigos < totalPaginasAmigos) {
            paginaAmigos++;
            cargarAmigos();
        }
    });

    confirmarEliminarAmigo.addEventListener(
        "click",
        confirmarEliminacionAmistad
    );

    // Cargar jugadores y solicitudes al abrir la pantalla
    cargarJugadores();
    cargarAmigos();
    cargarSolicitudes();
});