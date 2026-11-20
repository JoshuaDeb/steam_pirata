// Amigos: lista, solicitudes recibidas/enviadas, búsqueda de jugadores y perfil público.
(async function () {
    'use strict';
    const { api, esc, iniciales, fecha, toast, paginar } = SP;

    await SP.iniciarPagina({ tipo: 'jugador' });

    const COLORES = ['avatar-violeta', 'avatar-azul', 'avatar-verde', 'avatar-rosa', 'avatar-dorado', 'avatar-celeste'];
    const color = (id) => COLORES[(id - 1) % COLORES.length];
    const POR_PAGINA = 5;

    let datos = { amigos: [], recibidas: [], enviadas: [] };
    let paginaAmigos = 1;
    let pendiente = null; // acción a confirmar en el modal abierto

    const botonPerfil = (p) => `<button class="btn btn-outline-secondary btn-ver-perfil" data-perfil="${p.id}" type="button">Ver perfil</button>`;
    const persona = (p, info, acciones, extra = '') => `
        <div class="persona-card">
            <div aria-hidden="true" class="avatar-persona ${color(p.id)}">${esc(iniciales(p.nombre))}</div>
            <div class="persona-datos">
                <h3 class="persona-nombre">${esc(p.nombre)}</h3>
                <p class="persona-info">${info}</p>
            </div>
            ${extra}
            <div class="persona-acciones">${botonPerfil(p)}${acciones}</div>
        </div>`;

    function pintarAmigos() {
        const q = document.getElementById('buscarAmigos').value.trim().toLowerCase();
        const orden = document.getElementById('ordenAmigos').value;
        const lista = datos.amigos.filter((a) => a.nombre.toLowerCase().includes(q));
        if (orden === 'reciente') lista.sort((a, b) => b.aceptada_en.localeCompare(a.aceptada_en));
        else lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        const { items, pagina, paginas } = paginar(lista, paginaAmigos, POR_PAGINA);
        paginaAmigos = pagina;
        document.getElementById('listaAmigos').innerHTML = items.map((a) => persona(a,
            `${a.juegos_en_comun} juego${a.juegos_en_comun === 1 ? '' : 's'} en común - Amigos desde ${fecha(a.aceptada_en)}`,
            `<button class="btn btn-link text-danger btn-eliminar-amigo" data-eliminar="${a.id}" data-nombre="${esc(a.nombre)}" type="button">Eliminar amigo</button>`)).join('');
        document.getElementById('vacioAmigos').hidden = lista.length > 0;
        document.getElementById('paginaInfoAmigos').textContent = `Página ${pagina} de ${paginas}`;
        document.getElementById('anteriorAmigos').disabled = pagina <= 1;
        document.getElementById('siguienteAmigos').disabled = pagina >= paginas;
    }

    function pintarSolicitudes() {
        document.getElementById('listaRecibidas').innerHTML = datos.recibidas.map((s) => persona(s,
            `Solicitud recibida el ${fecha(s.creado_en)}`,
            `<button class="btn btn-primary btn-aceptar" data-aceptar="${s.solicitud_id}" data-nombre="${esc(s.nombre)}" type="button">Aceptar</button>
             <button class="btn btn-link text-danger btn-rechazar" data-rechazar="${s.solicitud_id}" data-nombre="${esc(s.nombre)}" type="button">Rechazar</button>`)).join('');
        document.getElementById('vacioRecibidas').hidden = datos.recibidas.length > 0;
        document.getElementById('listaEnviadas').innerHTML = datos.enviadas.map((s) => persona(s,
            `Solicitud enviada el ${fecha(s.creado_en)}`,
            `<button class="btn btn-link text-danger btn-cancelar" data-cancelar="${s.solicitud_id}" data-nombre="${esc(s.nombre)}" type="button">Cancelar solicitud</button>`,
            '<span class="etiqueta etiqueta-espera">Pendiente</span>')).join('');
        document.getElementById('vacioEnviadas').hidden = datos.enviadas.length > 0;
    }

    function pintarConteos() {
        for (const [ids, n] of [[['totalAmigos', 'cuentaAmigos'], datos.amigos.length],
            [['totalRecibidas', 'cuentaRecibidas'], datos.recibidas.length],
            [['totalEnviadas', 'cuentaEnviadas'], datos.enviadas.length]]) {
            ids.forEach((id) => { document.getElementById(id).textContent = n; });
        }
    }

    async function cargar() {
        datos = await api('/amigos');
        pintarAmigos();
        pintarSolicitudes();
        pintarConteos();
    }

    let jugadores = [];
    let temporizador;
    async function buscarJugadores() {
        const q = document.getElementById('buscarJugadores').value.trim();
        ({ jugadores } = await api(`/amigos/buscar?q=${encodeURIComponent(q)}`));
        pintarJugadores();
    }
    function pintarJugadores() {
        const orden = document.getElementById('ordenJugadores').value;
        const lista = [...jugadores];
        if (orden === 'reciente') lista.sort((a, b) => b.creado_en.localeCompare(a.creado_en));
        document.getElementById('listaJugadores').innerHTML = lista.map((j) => persona(j,
            `Jugador - ${j.juegos} juego${j.juegos === 1 ? '' : 's'} en su biblioteca`,
            `<button class="btn btn-primary btn-enviar" data-enviar="${j.id}" data-nombre="${esc(j.nombre)}" type="button">+ Enviar solicitud</button>`)).join('');
        document.getElementById('vacioJugadores').hidden = lista.length > 0;
    }

    // Controles
    document.getElementById('buscarAmigos').addEventListener('input', () => { paginaAmigos = 1; pintarAmigos(); });
    document.getElementById('ordenAmigos').addEventListener('change', pintarAmigos);
    document.getElementById('anteriorAmigos').addEventListener('click', () => { paginaAmigos--; pintarAmigos(); });
    document.getElementById('siguienteAmigos').addEventListener('click', () => { paginaAmigos++; pintarAmigos(); });
    document.getElementById('buscarJugadores').addEventListener('input', () => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => buscarJugadores().catch((e) => toast(e.message, 'danger')), 250);
    });
    document.getElementById('ordenJugadores').addEventListener('change', pintarJugadores);

    // ----- Acciones con confirmación -----
    const acciones = {
        eliminar: { modal: 'modalEliminarAmigo', titulo: 'tituloEliminarAmigo', texto: (n) => `¿Eliminar a ${n} de tus amigos?`,
            hacer: (id) => api(`/amigos/${id}`, { method: 'DELETE' }), ok: (n) => `${n} ya no está en tus amigos.` },
        rechazar: { modal: 'modalRechazar', titulo: 'tituloRechazar', texto: (n) => `¿Rechazar la solicitud de ${n}?`,
            hacer: (id) => api(`/amigos/solicitudes/${id}`, { method: 'DELETE' }), ok: () => 'Solicitud rechazada.' },
        cancelar: { modal: 'modalCancelar', titulo: 'tituloCancelar', texto: (n) => `¿Cancelar la solicitud a ${n}?`,
            hacer: (id) => api(`/amigos/solicitudes/${id}`, { method: 'DELETE' }), ok: () => 'Solicitud cancelada.' },
        aceptar: { modal: 'modalAceptar', titulo: 'modalAceptarTitle', texto: (n) => `Aceptar a ${n}`,
            hacer: (id) => api(`/amigos/solicitudes/${id}/aceptar`, { method: 'POST' }), ok: (n) => `¡${n} y tú ahora son amigos!` },
        enviar: { modal: 'modalEnviar', titulo: 'modalEnviarTitle', texto: (n) => `Enviar solicitud a ${n}`,
            hacer: (id) => api('/amigos/solicitudes', { method: 'POST', body: { para_id: Number(id) } }),
            ok: (n, r) => (r.aceptada ? `${n} ya te había enviado una solicitud: ¡ahora son amigos!` : `Solicitud enviada a ${n}.`) },
    };

    document.querySelector('main').addEventListener('click', (e) => {
        const perfil = e.target.closest('[data-perfil]');
        if (perfil) return abrirPerfil(perfil.dataset.perfil);
        for (const [tipo, cfg] of Object.entries(acciones)) {
            const b = e.target.closest(`[data-${tipo}]`);
            if (!b) continue;
            pendiente = { tipo, id: b.dataset[tipo], nombre: b.dataset.nombre };
            document.getElementById(cfg.titulo).textContent = cfg.texto(b.dataset.nombre);
            bootstrap.Modal.getOrCreateInstance(document.getElementById(cfg.modal)).show();
            return;
        }
    });

    for (const [boton, tipo] of [['confirmarEliminarAmigo', 'eliminar'], ['confirmarRechazar', 'rechazar'],
        ['confirmarCancelar', 'cancelar'], ['confirmarAceptar', 'aceptar'], ['confirmarEnviar', 'enviar']]) {
        document.getElementById(boton).addEventListener('click', async () => {
            if (!pendiente || pendiente.tipo !== tipo) return;
            const { id, nombre } = pendiente;
            pendiente = null;
            try {
                const r = await acciones[tipo].hacer(id);
                toast(acciones[tipo].ok(nombre, r));
                await cargar();
                if (tipo === 'enviar') await buscarJugadores();
            } catch (err) {
                toast(err.message, 'danger');
            }
        });
    }

    // ----- Perfil público -----
    async function abrirPerfil(id) {
        const info = document.getElementById('infoPerfilPublico');
        info.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('modalPerfilPublico')).show();
        try {
            const { usuario: u } = await api(`/amigos/usuarios/${id}`);
            const av = document.getElementById('avatarPerfilPublico');
            av.className = `avatar-persona ${color(u.id)}`;
            av.textContent = iniciales(u.nombre);
            document.getElementById('nombrePerfilPublico').textContent = u.nombre;
            const rel = { amigos: 'Es tu amigo', enviada: 'Solicitud enviada', recibida: 'Te envió una solicitud', ninguna: '' }[u.relacion];
            document.getElementById('metaPerfilPublico').textContent =
                `${u.tipo === 'jugador' ? 'Cuenta de jugador' : 'Desarrollador'} · Miembro desde ${fecha(u.creado_en)}${rel ? ` · ${rel}` : ''}`;
            const comunes = u.juegos_en_comun.length
                ? `<ul class="mb-0 mt-1 ps-3">${u.juegos_en_comun.map((j) => `<li>${esc(j.titulo)}</li>`).join('')}</ul>`
                : '<p class="mb-0 mt-1 fila-meta">No tienen juegos en común todavía.</p>';
            info.innerHTML = `
                <p class="mb-2">${u.juegos} juego${u.juegos === 1 ? '' : 's'} en su biblioteca · ${u.resenas} reseña${u.resenas === 1 ? '' : 's'} publicada${u.resenas === 1 ? '' : 's'}</p>
                <span class="fila-label">Juegos en común</span>${comunes}`;
        } catch (err) {
            info.textContent = err.message;
        }
    }

    try {
        await Promise.all([cargar(), buscarJugadores()]);
    } catch (err) {
        toast(err.message, 'danger');
    }
})();
