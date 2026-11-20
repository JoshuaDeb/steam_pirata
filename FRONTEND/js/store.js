// Catálogo: filtros, tarjetas, favoritos, detalle con reseñas y adquisición.
(async function () {
    'use strict';
    const { api, esc, iniciales, fecha, estrellas, colorPortada, portadaHtml, toast, ocupado, CLASIF, CLASIF_TITULO } = SP;

    let usuario = await SP.iniciarPagina();
    const esJugador = usuario.tipo === 'jugador';
    const params = new URLSearchParams(location.search);

    // ----- Formulario de filtros: refleja la URL actual -----
    const form = document.querySelector('form[role="search"]');
    form.q.value = params.get('q') || '';
    const genero = params.get('genero') || '';
    const radio = form.querySelector(`input[name="genero"][value="${CSS.escape(genero)}"]`);
    if (radio) radio.checked = true;
    form.clasificacion.value = params.get('clasificacion') || '';
    form.precio_max.value = params.get('precio_max') || '';
    form.calificacion_min.value = params.get('calificacion_min') || '';
    form.orden.value = params.get('orden') || 'nombre';
    // Al elegir un género se aplica de inmediato
    form.querySelectorAll('input[name="genero"]').forEach((r) => r.addEventListener('change', () => form.requestSubmit()));
    window.addEventListener('pageshow', () => form.querySelectorAll(':disabled').forEach((el) => { el.disabled = false; }));
    // Evita mandar parámetros vacíos en la URL
    form.addEventListener('submit', () => {
        form.querySelectorAll('input, select').forEach((el) => {
            if (el.name && !el.value && !(el.type === 'radio' && !el.checked)) el.disabled = true;
        });
    });

    const pintarBanner = () => {
        document.getElementById('bannerTexto').innerHTML = esJugador
            ? `Explora los juegos publicados y adquiérelos con tus <strong>${usuario.creditos} créditos</strong> virtuales.`
            : 'Explora los juegos publicados en SteamPirata.';
    };
    pintarBanner();

    // ----- Listado -----
    const lista = document.getElementById('listaJuegos');
    let juegosPagina = [];

    function tarjeta(j) {
        const calif = j.num_resenas
            ? `<span class="juego-calif"><span aria-hidden="true"><i class="fa-solid fa-star"></i></span> ${j.calificacion} <span class="fila-meta">(${j.num_resenas})</span></span>`
            : '<span class="juego-calif fila-meta">Sin reseñas</span>';
        const corazon = esJugador ? `
            <input aria-label="Guardar ${esc(j.titulo)} en favoritos" autocomplete="off" ${j.favorito ? 'checked' : ''}
                class="btn-check check-favorito" id="favorito-${j.id}" type="checkbox" data-juego="${j.id}" />
            <label class="btn btn-outline-secondary boton-corazon" for="favorito-${j.id}" title="Agregar o quitar favorito">
                <span aria-hidden="true" class="corazon-vacio"><i class="fa-regular fa-heart"></i></span>
                <span aria-hidden="true" class="corazon-lleno"><i class="fa-solid fa-heart"></i></span>
            </label>` : '';
        return `
            <li class="col">
                <article class="juego position-relative">
                    <div class="juego-portada ${colorPortada(j.id)}">
                        ${portadaHtml(j)}
                        <span class="juego-edad" title="${CLASIF_TITULO[j.clasificacion]}">${CLASIF[j.clasificacion]}</span>
                        ${corazon}
                    </div>
                    <div class="juego-cuerpo">
                        <h3 class="juego-titulo"><a class="stretched-link" href="#" data-abrir="${j.id}">${esc(j.titulo)}</a></h3>
                        <p class="juego-genero">${esc(j.genero)}${j.adquirido ? ' · <span class="text-success">En tu biblioteca</span>' : ''}</p>
                        <div class="juego-pie">
                            ${calif}
                            <span class="juego-precio">${j.precio} créditos</span>
                        </div>
                    </div>
                </article>
            </li>`;
    }

    async function cargar() {
        try {
            const datos = await api(`/juegos?${params.toString()}`);
            juegosPagina = datos.juegos;
            lista.innerHTML = datos.juegos.map(tarjeta).join('');
            document.getElementById('sinJuegos').hidden = datos.juegos.length > 0;
            const filtrando = ['q', 'genero', 'clasificacion', 'precio_max', 'calificacion_min'].some((k) => params.get(k));
            document.getElementById('tituloResultados').textContent = params.get('q')
                ? `Resultados para “${params.get('q')}”` : filtrando ? 'Resultados filtrados' : 'Todos los videojuegos';
            const desde = datos.total ? (datos.pagina - 1) * datos.por_pagina + 1 : 0;
            const hasta = (datos.pagina - 1) * datos.por_pagina + datos.juegos.length;
            document.getElementById('conteoResultados').textContent =
                `Mostrando ${desde}-${hasta} de ${datos.total} videojuego${datos.total === 1 ? '' : 's'}`;
            pintarPaginacion(datos.pagina, datos.paginas);
        } catch (e) {
            document.getElementById('conteoResultados').textContent = e.message;
        }
    }

    function pintarPaginacion(actual, total) {
        const ul = document.getElementById('paginacion');
        let html = '';
        for (let p = 1; p <= total; p++) {
            const q = new URLSearchParams(params);
            q.set('pagina', p);
            html += p === actual
                ? `<li class="page-item active" aria-current="page"><span class="page-link">${p}</span></li>`
                : `<li class="page-item"><a class="page-link" href="?${q}">${p}</a></li>`;
        }
        ul.innerHTML = html;
    }

    // Favoritos (delegación de eventos)
    lista.addEventListener('change', async (e) => {
        const chk = e.target.closest('.check-favorito');
        if (!chk) return;
        const id = chk.dataset.juego;
        try {
            await api(`/juegos/${id}/favorito`, { method: chk.checked ? 'PUT' : 'DELETE' });
            const j = juegosPagina.find((x) => String(x.id) === id);
            if (j) j.favorito = chk.checked;
            toast(chk.checked ? 'Guardado en favoritos.' : 'Quitado de favoritos.');
        } catch (err) {
            chk.checked = !chk.checked;
            toast(err.message, 'danger');
        }
    });

    lista.addEventListener('click', (e) => {
        const a = e.target.closest('[data-abrir]');
        if (!a) return;
        e.preventDefault();
        abrirDetalle(a.dataset.abrir);
    });

    // ----- Modal de detalle -----
    const modalEl = document.getElementById('modalJuego');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const cuerpo = document.getElementById('modalJuegoCuerpo');
    const pie = document.getElementById('modalJuegoPie');
    const RESENAS_POR_PAGINA = 3;

    function resenaHtml(r, dev) {
        const respuesta = r.respuesta ? `
            <div class="respuesta">
                <div class="respuesta-cab"><strong>Respuesta de ${esc(dev)}</strong><span class="etiqueta-dev">Desarrollador</span></div>
                <p>${esc(r.respuesta)}</p>
            </div>` : '';
        return `
            <li class="resena"><article>
                <header class="resena-cabecera">
                    <span class="avatar avatar-sm" aria-hidden="true">${esc(iniciales(r.usuario_nombre))}</span>
                    <div class="d-flex flex-column">
                        <strong>${esc(r.usuario_nombre)}${r.usuario_id === usuario.id ? ' <span class="fila-meta">(tú)</span>' : ''}</strong>
                        <span class="fila-meta">${fecha(r.creado_en)}</span>
                    </div>
                    ${estrellas(r.estrellas)}
                </header>
                <p class="resena-texto">${esc(r.texto)}</p>
                ${respuesta}
            </article></li>`;
    }

    function pintarResenas(j, pagina) {
        const zona = cuerpo.querySelector('#zonaResenas');
        if (!j.resenas.length) {
            zona.innerHTML = '<p class="fila-meta mb-0 mt-2">Este videojuego aún no tiene reseñas.</p>';
            return;
        }
        const { items, pagina: p, paginas } = SP.paginar(j.resenas, pagina, RESENAS_POR_PAGINA);
        let nav = '';
        if (paginas > 1) {
            nav = '<nav class="mt-3" aria-label="Páginas de reseñas"><ul class="pagination justify-content-center mb-0">';
            for (let i = 1; i <= paginas; i++) {
                nav += `<li><button class="page-link${i === p ? ' active' : ''}" type="button" data-pag-resena="${i}"
                         aria-label="Página ${i} de reseñas">${i}</button></li>`;
            }
            nav += '</ul></nav>';
        }
        zona.innerHTML = `<ul class="resenas">${items.map((r) => resenaHtml(r, j.desarrollador.nombre)).join('')}</ul>${nav}`;
    }

    async function abrirDetalle(id) {
        cuerpo.innerHTML = '<div class="text-center py-5"><span class="spinner-border" aria-hidden="true"></span></div>';
        pie.innerHTML = '';
        modal.show();
        let j;
        try {
            ({ juego: j } = await api(`/juegos/${id}`));
        } catch (e) {
            cuerpo.innerHTML = `<p class="mb-0">${esc(e.message)}</p>`;
            return;
        }
        const dlcs = j.dlcs.length ? j.dlcs.map((d) => esc(d.nombre)).join(' · ') : 'Sin DLC';
        const calif = j.num_resenas
            ? `${estrellas(j.calificacion)} ${j.calificacion} <span class="fila-meta">· ${j.num_resenas} reseña${j.num_resenas === 1 ? '' : 's'}</span>`
            : '<span class="fila-meta">Sin reseñas todavía</span>';
        cuerpo.innerHTML = `
            <div class="d-flex align-items-start gap-3 pe-5">
                <div class="portada-modal ${colorPortada(j.id)} position-relative overflow-hidden" aria-hidden="true">${portadaHtml(j)}</div>
                <div class="d-flex flex-column gap-1">
                    <span class="fila-meta">${esc(j.genero)} · ${CLASIF[j.clasificacion]}</span>
                    <h2 class="modal-title" id="juegoTitulo">${esc(j.titulo)}</h2>
                    <p class="calif-modal mb-0">${calif}</p>
                </div>
            </div>
            <p class="mb-0">${esc(j.descripcion) || '<span class="fila-meta">Sin descripción.</span>'}</p>
            <dl class="ficha">
                <div class="ficha-fila"><dt>Desarrollador</dt><dd>${esc(j.desarrollador.nombre)}</dd></div>
                <div class="ficha-fila"><dt>Especificaciones</dt><dd>${esc(j.especificaciones) || 'No especificadas'}</dd></div>
                <div class="ficha-fila"><dt>DLC incluidos</dt><dd>${dlcs}</dd></div>
            </dl>
            <section aria-labelledby="resenasTitulo">
                <div class="d-flex flex-wrap justify-content-between align-items-baseline gap-2">
                    <h3 class="resenas-titulo" id="resenasTitulo">Reseñas</h3>
                    ${j.num_resenas ? `<span class="fila-meta">${j.num_resenas} reseña${j.num_resenas === 1 ? '' : 's'} · promedio ${j.calificacion} de 5</span>` : ''}
                </div>
                <div id="zonaResenas"></div>
            </section>
            <div id="avisoCompra" aria-live="polite"></div>`;
        pintarResenas(j, 1);
        cuerpo.querySelector('#zonaResenas').addEventListener('click', (e) => {
            const b = e.target.closest('[data-pag-resena]');
            if (b) pintarResenas(j, Number(b.dataset.pagResena));
        });
        pintarPie(j);
    }

    function pintarPie(j) {
        let accion;
        if (!esJugador) {
            accion = j.desarrollador.id === usuario.id
                ? '<a class="btn btn-primary btn-grande" href="dev_profile.html">Administrar en mi panel</a>' : '';
        } else if (j.adquirido) {
            accion = '<a class="btn btn-primary btn-grande" href="user_library.html">Ver en mi biblioteca</a>';
        } else if (j.estado !== 'publicado') {
            accion = '<button class="btn btn-primary btn-grande" type="button" disabled>No disponible</button>';
        } else if (usuario.creditos < j.precio) {
            accion = `<a class="btn btn-primary btn-grande" href="user_profile.html#creditos">Te faltan ${j.precio - usuario.creditos} créditos</a>`;
        } else {
            accion = '<button class="btn btn-primary btn-grande" type="button" id="btnAdquirir">Adquirir</button>';
        }
        pie.innerHTML = `
            <div class="d-flex flex-column">
                <span class="precio-modal">${j.precio} créditos</span>
                ${esJugador ? `<span class="fila-meta">Tu saldo: ${usuario.creditos} créditos</span>` : ''}
            </div>
            <div class="d-flex gap-2">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
                ${accion}
            </div>`;

        const btn = pie.querySelector('#btnAdquirir');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            // Primer clic: pide confirmación. Segundo clic: compra.
            if (!btn.dataset.confirmar) {
                btn.dataset.confirmar = '1';
                btn.textContent = `Confirmar (−${j.precio} créditos)`;
                return;
            }
            ocupado(btn, true, 'Adquiriendo…');
            try {
                const r = await api(`/juegos/${j.id}/adquirir`, { method: 'POST' });
                usuario = { ...usuario, creditos: r.creditos };
                j.adquirido = true;
                const enLista = juegosPagina.find((x) => x.id === j.id);
                if (enLista) enLista.adquirido = true;
                lista.innerHTML = juegosPagina.map(tarjeta).join('');
                pintarBanner();
                pintarPie(j);
                SP.aviso(cuerpo.querySelector('#avisoCompra'), `¡Listo! “${j.titulo}” ya está en tu biblioteca.`, 'success');
            } catch (e) {
                ocupado(btn, false);
                SP.aviso(cuerpo.querySelector('#avisoCompra'), e.message);
            }
        });
    }

    await cargar();
    // Permite abrir un juego directo con store.html?juego=ID
    if (params.get('juego')) abrirDetalle(params.get('juego'));
})();
