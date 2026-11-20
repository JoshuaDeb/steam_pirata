// Biblioteca y favoritos del jugador.
(async function () {
    'use strict';
    const { api, esc, iniciales, fecha, toast, ocupado, aviso, paginar, CLASIF } = SP;

    const usuario = await SP.iniciarPagina({ tipo: 'jugador' });
    document.getElementById('eyebrowColeccion').textContent = `Colección de ${usuario.nombre}`;
    document.getElementById('totalCreditos').textContent = usuario.creditos;

    const ARTES = ['arte-nebula', 'arte-hollow', 'arte-pixel', 'arte-aurora', 'arte-cinder', 'arte-orbit'];
    const arte = (id) => ARTES[(id - 1) % ARTES.length];
    const POR_PAGINA = 6;

    let biblioteca = [];
    let favoritos = [];
    const estado = { bib: 1, fav: 1 };

    const cubierta = (j) => `
        <div class="cubierta ${arte(j.id)}">
            ${j.portada
                ? `<img class="position-absolute top-0 start-0 w-100 h-100 object-fit-cover" src="${esc(j.portada)}" alt="${esc(j.titulo)}">`
                : `<span class="letra" aria-hidden="true">${esc(iniciales(j.titulo))}</span><strong>${esc(j.titulo)}</strong>`}
        </div>`;

    const corazon = (j, sufijo) => `
        <input aria-label="Guardar ${esc(j.titulo)} en favoritos" autocomplete="off" ${j.favorito ? 'checked' : ''}
            class="btn-check check-favorito" id="favorito-${j.id}-${sufijo}" type="checkbox" data-juego="${j.id}" />
        <label class="btn btn-outline-secondary boton-corazon" for="favorito-${j.id}-${sufijo}" title="Agregar o quitar favorito">
            <span aria-hidden="true" class="corazon-vacio"><i class="fa-regular fa-heart"></i></span>
            <span aria-hidden="true" class="corazon-lleno"><i class="fa-solid fa-heart"></i></span>
        </label>`;

    const textoDlc = (n) => (n ? `${n} DLC` : 'Sin DLC');

    function tarjetaBiblioteca(j) {
        const retirado = j.estado === 'retirado';
        return `
            <div class="col"><div class="juego-card h-100">
                ${cubierta(j)}
                <div class="tarjeta-cuerpo">
                    <span class="tipo-etiqueta">${esc(j.genero)}</span>
                    <h2 class="juego-nombre">${esc(j.titulo)}</h2>
                    <p class="metadatos mb-2">Adquirido el ${fecha(j.adquirido_en)} - ${textoDlc(j.num_dlcs)}</p>
                    ${retirado ? '<span class="chip chip-retiro">Retirado del catálogo</span>' : '<span class="chip">En mi biblioteca</span>'}
                    <div class="tarjeta-acciones">
                        <button class="btn btn-primary flex-grow-1 btn-detalle" data-detalle="${j.id}" type="button">Ver detalles</button>
                        <button class="btn btn-outline-secondary btn-resena" data-resena="${j.id}" type="button">${j.resenado ? 'Editar reseña' : 'Reseñar'}</button>
                        ${corazon(j, 'b')}
                    </div>
                </div>
            </div></div>`;
    }

    function tarjetaFavorito(j) {
        const chip = j.adquirido ? '<span class="chip">Ya adquirido</span>'
            : j.estado === 'retirado' ? '<span class="chip chip-retiro">Retirado del catálogo</span>'
                : '<span class="chip">Por adquirir</span>';
        return `
            <div class="col"><div class="juego-card h-100">
                ${cubierta(j)}
                <div class="tarjeta-cuerpo">
                    <span class="tipo-etiqueta">${esc(j.genero)}</span>
                    <h2 class="juego-nombre">${esc(j.titulo)}</h2>
                    <p class="metadatos mb-2">${esc(j.desarrollador.nombre)} - ${j.precio} créditos</p>
                    ${chip}
                    <div class="tarjeta-acciones">
                        <button class="btn btn-primary flex-grow-1 btn-detalle" data-detalle="${j.id}" type="button">Ver detalles</button>
                        ${corazon(j, 'f')}
                    </div>
                </div>
            </div></div>`;
    }

    function filtrarBiblioteca() {
        const q = document.getElementById('buscarBiblioteca').value.trim().toLowerCase();
        const filtro = document.getElementById('filtrarBiblioteca').value;
        const orden = document.getElementById('ordenBiblioteca').value;
        let l = biblioteca.filter((j) => j.titulo.toLowerCase().includes(q));
        if (filtro === 'disponible') l = l.filter((j) => j.estado === 'publicado');
        if (filtro === 'retirado') l = l.filter((j) => j.estado === 'retirado');
        const porFecha = (a, b) => a.adquirido_en.localeCompare(b.adquirido_en);
        if (orden === 'nombre') l.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
        else if (orden === 'antiguo') l.sort(porFecha);
        else l.sort((a, b) => porFecha(b, a));
        return l;
    }

    function filtrarFavoritos() {
        const q = document.getElementById('buscarFavoritos').value.trim().toLowerCase();
        const filtro = document.getElementById('filtrarFavoritos').value;
        const orden = document.getElementById('ordenFavoritos').value;
        let l = favoritos.filter((j) => j.titulo.toLowerCase().includes(q));
        if (filtro === 'adquirido') l = l.filter((j) => j.adquirido);
        if (filtro === 'pendiente') l = l.filter((j) => !j.adquirido);
        if (orden === 'nombre') l.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
        else l.sort((a, b) => b.favorito_en.localeCompare(a.favorito_en));
        return l;
    }

    function pintarSeccion(clave, filtrada, total, cont, vacio, info, ant, sig, tarjeta, textoConteo) {
        const { items, pagina, paginas } = paginar(filtrada, estado[clave], POR_PAGINA);
        estado[clave] = pagina;
        document.getElementById(cont).innerHTML = items.map(tarjeta).join('');
        document.getElementById(vacio).hidden = filtrada.length > 0;
        document.getElementById(info).textContent = `Página ${pagina} de ${paginas}`;
        document.getElementById(ant).disabled = pagina <= 1;
        document.getElementById(sig).disabled = pagina >= paginas;
        return textoConteo(filtrada.length, total);
    }

    function pintar() {
        document.getElementById('resultadosBiblioteca').textContent = pintarSeccion('bib', filtrarBiblioteca(), biblioteca.length,
            'listaBiblioteca', 'sinBiblioteca', 'paginaInfoBiblioteca', 'anteriorBiblioteca', 'siguienteBiblioteca',
            tarjetaBiblioteca, (n, t) => `Mostrando ${n} de ${t} videojuego${t === 1 ? '' : 's'}`);
        document.getElementById('resultadosFavoritos').textContent = pintarSeccion('fav', filtrarFavoritos(), favoritos.length,
            'listaFavoritos', 'sinFavoritos', 'paginaInfoFavoritos', 'anteriorFavoritos', 'siguienteFavoritos',
            tarjetaFavorito, (n, t) => (n === t ? `${t} videojuego${t === 1 ? '' : 's'} en favoritos` : `Mostrando ${n} de ${t} favoritos`));
        for (const [id, n] of [['totalAdquiridos', biblioteca.length], ['contadorBiblioteca', biblioteca.length],
            ['totalFavoritos', favoritos.length], ['contadorFavoritos', favoritos.length]]) {
            document.getElementById(id).textContent = n;
        }
    }

    async function cargar() {
        const [b, f] = await Promise.all([api('/me/biblioteca'), api('/me/favoritos')]);
        biblioteca = b.juegos;
        favoritos = f.juegos;
        pintar();
    }

    // Controles de búsqueda/filtros/orden y paginación
    for (const [ids, clave] of [[['buscarBiblioteca', 'filtrarBiblioteca', 'ordenBiblioteca'], 'bib'],
        [['buscarFavoritos', 'filtrarFavoritos', 'ordenFavoritos'], 'fav']]) {
        ids.forEach((id) => document.getElementById(id).addEventListener('input', () => { estado[clave] = 1; pintar(); }));
    }
    document.getElementById('anteriorBiblioteca').addEventListener('click', () => { estado.bib--; pintar(); });
    document.getElementById('siguienteBiblioteca').addEventListener('click', () => { estado.bib++; pintar(); });
    document.getElementById('anteriorFavoritos').addEventListener('click', () => { estado.fav--; pintar(); });
    document.getElementById('siguienteFavoritos').addEventListener('click', () => { estado.fav++; pintar(); });

    // Favoritos
    document.querySelector('main').addEventListener('change', async (e) => {
        const chk = e.target.closest('.check-favorito');
        if (!chk) return;
        const id = Number(chk.dataset.juego);
        try {
            await api(`/juegos/${id}/favorito`, { method: chk.checked ? 'PUT' : 'DELETE' });
            const { juegos } = await api('/me/favoritos');
            favoritos = juegos;
            biblioteca.forEach((j) => { j.favorito = favoritos.some((f) => f.id === j.id); });
            pintar();
            toast(chk.checked ? 'Guardado en favoritos.' : 'Quitado de favoritos.');
        } catch (err) {
            chk.checked = !chk.checked;
            toast(err.message, 'danger');
        }
    });

    // ----- Detalle -----
    const modalDetalle = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalDetalle'));
    async function abrirDetalle(id) {
        const cuerpo = document.getElementById('cuerpoDetalle');
        cuerpo.innerHTML = '<div class="text-center py-4"><span class="spinner-border" aria-hidden="true"></span></div>';
        modalDetalle.show();
        try {
            const { juego: j } = await api(`/juegos/${id}`);
            document.getElementById('tituloDetalle').textContent = j.titulo;
            const estadoTxt = j.adquirido
                ? `Adquirido - ${j.estado === 'publicado' ? 'Disponible en el catálogo' : 'Retirado del catálogo; permanece en tu biblioteca'}`
                : j.estado === 'publicado' ? `Pendiente de adquirir - ${j.precio} créditos` : 'Retirado del catálogo';
            cuerpo.innerHTML = `
                <p class="info-modal mb-0">${esc(j.descripcion) || 'Sin descripción.'}</p>
                <div><span class="fila-label">Desarrollador</span><div class="fila-valor">${esc(j.desarrollador.nombre)}</div></div>
                <div><span class="fila-label">Categoría y clasificación</span><div class="fila-valor">${esc(j.genero)} - ${CLASIF[j.clasificacion]}</div></div>
                <div><span class="fila-label">Especificaciones</span><div class="fila-valor">${esc(j.especificaciones) || 'No especificadas'}</div></div>
                <div><span class="fila-label">Contenido adicional</span><div class="fila-valor">${j.dlcs.length ? j.dlcs.map((d) => `${esc(d.nombre)} <span class="fila-meta">(${esc(d.tipo)})</span>`).join(' · ') : 'Sin DLC'}</div></div>
                <div><span class="fila-label">Calificación</span><div class="fila-valor">${j.num_resenas ? `${j.calificacion} de 5 · ${j.num_resenas} reseña${j.num_resenas === 1 ? '' : 's'}` : 'Sin reseñas todavía'}</div></div>
                <p class="fila-meta mb-0">${estadoTxt}</p>`;
            const ir = document.getElementById('irCatalogoDetalle');
            ir.href = j.estado === 'publicado' ? `store.html?juego=${j.id}` : 'store.html';
            ir.textContent = j.estado === 'publicado' ? (j.adquirido ? 'Ver en el catálogo' : 'Adquirir en el catálogo') : 'Ir al catálogo';
        } catch (err) {
            cuerpo.innerHTML = `<p class="mb-0">${esc(err.message)}</p>`;
        }
    }

    // ----- Reseña -----
    const modalResenaEl = document.getElementById('modalResena');
    const modalResena = bootstrap.Modal.getOrCreateInstance(modalResenaEl);
    const formResena = document.getElementById('formResena');
    let juegoResena = null;

    async function abrirResena(id) {
        const j = biblioteca.find((x) => x.id === id);
        juegoResena = j;
        formResena.reset();
        aviso(document.getElementById('avisoResena'), '');
        SP.errorCampo(document.getElementById('comentarioResena'), '');
        document.getElementById('nombreJuegoResena').textContent = `Comparte tu experiencia con ${j.titulo}.`;
        modalResena.show();
        if (j.resenado) {
            try {
                const { juego } = await api(`/juegos/${id}`);
                if (juego.mi_resena) {
                    const r = juego.mi_resena;
                    const radio = document.getElementById(`estrella${r.estrellas}`);
                    if (radio) radio.checked = true;
                    document.getElementById('comentarioResena').value = r.texto;
                    document.getElementById('tituloResena').textContent = 'Editar reseña';
                }
            } catch { /* se puede escribir de nuevo */ }
        } else {
            document.getElementById('tituloResena').textContent = 'Escribir reseña';
        }
    }

    formResena.addEventListener('submit', async (e) => {
        e.preventDefault();
        const estrellas = Number(formResena.calificacion.value);
        const texto = document.getElementById('comentarioResena').value.trim();
        const zona = document.getElementById('avisoResena');
        aviso(zona, '');
        if (!estrellas) return aviso(zona, 'Elige una calificación de 1 a 5 estrellas.');
        if (texto.length < 10) return SP.errorCampo(document.getElementById('comentarioResena'), 'Escribe al menos 10 caracteres.');
        SP.errorCampo(document.getElementById('comentarioResena'), '');
        const boton = formResena.querySelector('[type=submit]');
        ocupado(boton, true, 'Publicando…');
        try {
            const r = await api(`/juegos/${juegoResena.id}/resenas`, { method: 'POST', body: { estrellas, texto } });
            juegoResena.resenado = true;
            document.getElementById('totalCreditos').textContent = r.creditos;
            modalResena.hide();
            toast(r.recompensa ? `¡Reseña publicada! Ganaste ${r.recompensa} créditos.` : r.editada ? 'Reseña actualizada.' : 'Reseña publicada.');
            pintar();
        } catch (err) {
            aviso(zona, err.message);
        } finally {
            ocupado(boton, false);
        }
    });

    document.querySelector('main').addEventListener('click', (e) => {
        const d = e.target.closest('[data-detalle]');
        if (d) return abrirDetalle(Number(d.dataset.detalle));
        const r = e.target.closest('[data-resena]');
        if (r) abrirResena(Number(r.dataset.resena));
    });

    try {
        await cargar();
    } catch (err) {
        toast(err.message, 'danger');
    }
})();
