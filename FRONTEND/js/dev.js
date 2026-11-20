// Panel del desarrollador: publicar/editar/retirar juegos, DLC y respuestas a reseñas.
(async function () {
    'use strict';
    const { api, esc, iniciales, fecha, estrellas, toast, ocupado, aviso, errorCampo, leerImagen, CLASIF } = SP;

    const usuario = await SP.iniciarPagina({ tipo: 'desarrollador' });
    document.getElementById('bannerNombre').textContent = usuario.nombre;
    document.getElementById('avatarDev').textContent = iniciales(usuario.nombre);
    document.getElementById('nombreDev').textContent = usuario.nombre;

    const GENEROS = ['Acción', 'Aventura', 'Carreras', 'Deportes', 'Estrategia', 'RPG', 'Simulación', 'Terror'];
    const TIPOS_DLC = ['Expansión', 'Vehículos', 'Personajes', 'Cosméticos', 'Niveles'];
    const opciones = (lista, actual, etiquetas = {}) => lista.map((v) =>
        `<option value="${esc(v)}"${v === actual ? ' selected' : ''}>${esc(etiquetas[v] || v)}</option>`).join('');

    let juegos = [];
    let dlcJuegoActivo = null;
    let pendiente = null; // { tipo: 'retirar'|'dlc', id }

    const color = (id) => `portada-${((id - 1) % 4) + 1}`;
    const portada = (j, extra = '') => `
        <div class="portada ${color(j.id)} ${extra} position-relative overflow-hidden" aria-hidden="true">
            ${j.portada ? `<img src="${esc(j.portada)}" alt="" class="position-absolute top-0 start-0 w-100 h-100 object-fit-cover">` : esc(iniciales(j.titulo))}
        </div>`;
    const textoDlc = (n) => (n ? `${n} DLC` : 'Sin DLC');

    // ----- Publicados -----
    function filaJuego(j) {
        const retirado = j.estado === 'retirado';
        const acciones = retirado
            ? `<button class="btn btn-outline-secondary" type="button" data-ver="${j.id}">Ver</button>
               <button class="btn btn-outline-secondary" type="button" data-publicar="${j.id}">Volver a publicar</button>`
            : `<button class="btn btn-outline-secondary" type="button" data-ver="${j.id}">Ver</button>
               <button class="btn btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#editarJuego${j.id}"
                   aria-expanded="false" aria-controls="editarJuego${j.id}">Editar</button>`;
        return `
            <div class="list-group-item${retirado ? ' retirado' : ''}">
                <div class="d-flex flex-wrap flex-md-nowrap align-items-center gap-3">
                    ${portada(j)}
                    <div class="juego-info d-flex flex-column">
                        <span class="juego-titulo">${esc(j.titulo)}</span>
                        <span class="fila-meta">${esc(j.genero)} · ${j.clasificacion} · ${textoDlc(j.dlcs.length)} · ${j.jugadores} jugador${j.jugadores === 1 ? '' : 'es'}</span>
                    </div>
                    <span class="juego-precio">${j.precio} créditos</span>
                    <div class="d-flex gap-2 ms-auto ms-md-0">${acciones}</div>
                </div>
                ${retirado ? '' : formEdicion(j)}
            </div>`;
    }

    function formEdicion(j) {
        const dlcs = j.dlcs.length
            ? j.dlcs.map((d) => `<div class="mini-item"><span>${esc(d.nombre)}</span><span class="fila-meta">${esc(d.tipo)}</span></div>`).join('')
            : '<div class="mini-item"><span class="fila-meta">Sin DLC todavía</span></div>';
        return `
            <div class="collapse" id="editarJuego${j.id}">
                <form class="form-edicion d-flex flex-column gap-3" data-editar="${j.id}" novalidate>
                    <div class="d-flex align-items-center gap-3">
                        ${portada(j)}
                        <div class="juego-info d-flex flex-column">
                            <span class="fila-label">Editando</span><strong>${esc(j.titulo)}</strong>
                            <span class="fila-meta small" data-archivo></span>
                        </div>
                        <label class="btn btn-outline-secondary boton-archivo">Cambiar portada
                            <input class="visually-hidden" type="file" name="portada" accept="image/png, image/jpeg, image/webp">
                        </label>
                    </div>
                    <div class="row g-3">
                        <div class="col-12"><label class="form-label" for="titulo${j.id}">Título</label>
                            <input class="form-control" type="text" id="titulo${j.id}" name="titulo" value="${esc(j.titulo)}" maxlength="60" required></div>
                        <div class="col-md-6"><label class="form-label" for="genero${j.id}">Género</label>
                            <select class="form-select" id="genero${j.id}" name="genero">${opciones(GENEROS, j.genero)}</select></div>
                        <div class="col-md-6"><label class="form-label" for="clasificacion${j.id}">Clasificación de edad</label>
                            <select class="form-select" id="clasificacion${j.id}" name="clasificacion">${opciones(['E', 'T', 'M'], j.clasificacion, CLASIF)}</select></div>
                        <div class="col-md-6"><label class="form-label" for="precio${j.id}">Precio en créditos</label>
                            <input class="form-control" type="number" id="precio${j.id}" name="precio" value="${j.precio}" min="1" step="1"></div>
                        <div class="col-md-6"><label class="form-label" for="specs${j.id}">Especificaciones</label>
                            <input class="form-control" type="text" id="specs${j.id}" name="especificaciones" value="${esc(j.especificaciones)}" maxlength="300"></div>
                        <div class="col-12"><label class="form-label" for="descripcion${j.id}">Descripción</label>
                            <textarea class="form-control" id="descripcion${j.id}" name="descripcion" rows="2" maxlength="1000">${esc(j.descripcion)}</textarea></div>
                    </div>
                    <div class="d-flex flex-column gap-2">
                        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                            <span class="fila-label">DLC de este juego</span><span class="fila-meta">Se administran en la pestaña DLC</span>
                        </div>
                        ${dlcs}
                    </div>
                    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <button class="btn btn-link text-danger px-0" type="button" data-retirar="${j.id}">Retirar del catálogo</button>
                        <div class="d-flex gap-2">
                            <button class="btn btn-link" type="button" data-bs-toggle="collapse" data-bs-target="#editarJuego${j.id}">Cancelar</button>
                            <button class="btn btn-primary" type="submit">Guardar</button>
                        </div>
                    </div>
                </form>
            </div>`;
    }

    // ----- DLC -----
    function pintarDlc() {
        const publicados = juegos.filter((j) => j.estado === 'publicado');
        if (!publicados.some((j) => j.id === dlcJuegoActivo)) dlcJuegoActivo = publicados[0]?.id ?? null;
        document.getElementById('chipsDlc').innerHTML = publicados.map((j) => `
            <li class="nav-item">
                <button class="nav-link${j.id === dlcJuegoActivo ? ' active' : ''}" type="button" data-chip="${j.id}"
                    aria-pressed="${j.id === dlcJuegoActivo}">
                    <span class="portada ${color(j.id)}" aria-hidden="true">${esc(iniciales(j.titulo))}</span>${esc(j.titulo)} · ${j.dlcs.length}
                </button>
            </li>`).join('');
        const j = publicados.find((x) => x.id === dlcJuegoActivo);
        const zona = document.getElementById('listaDlc');
        if (!j) {
            zona.innerHTML = '<div class="list-group tarjeta"><div class="list-group-item vacio">Publica un videojuego para agregarle DLC.</div></div>';
            return;
        }
        const formDlc = (d, idForm) => `
            <form class="form-edicion ${d ? '' : 'mt-0 '}d-flex flex-column gap-3" ${d ? `data-editar-dlc="${d.id}"` : `data-nuevo-dlc="${j.id}"`} novalidate>
                <div class="row g-3">
                    <div class="col-md-6"><label class="form-label" for="nombre${idForm}">Nombre del DLC</label>
                        <input class="form-control" type="text" id="nombre${idForm}" name="nombre" value="${esc(d?.nombre)}" maxlength="60" required></div>
                    <div class="col-md-6"><label class="form-label" for="tipo${idForm}">Tipo de contenido</label>
                        <select class="form-select" id="tipo${idForm}" name="tipo">${opciones(TIPOS_DLC, d?.tipo || 'Expansión')}</select></div>
                    <div class="col-12"><label class="form-label" for="desc${idForm}">Descripción</label>
                        <textarea class="form-control" id="desc${idForm}" name="descripcion" rows="2" maxlength="300"
                            placeholder="Qué incluye este contenido">${esc(d?.descripcion)}</textarea></div>
                </div>
                <div class="d-flex justify-content-end gap-2">
                    <button class="btn btn-link" type="button" data-bs-toggle="collapse" data-bs-target="#${d ? `editarDlc${d.id}` : 'agregarDlc'}">Cancelar</button>
                    <button class="btn btn-primary" type="submit">${d ? 'Guardar' : 'Agregar'}</button>
                </div>
            </form>`;
        const items = j.dlcs.length ? j.dlcs.map((d) => `
            <div class="list-group-item">
                <div class="d-flex align-items-center justify-content-between gap-3">
                    <div class="d-flex flex-column">
                        <span class="fila-label">${esc(d.tipo)}</span>
                        <span class="fila-valor">${esc(d.nombre)}</span>
                        <span class="fila-meta">${esc(d.descripcion)}</span>
                    </div>
                    <div class="d-flex gap-1 flex-shrink-0">
                        <button class="btn btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#editarDlc${d.id}"
                            aria-expanded="false" aria-controls="editarDlc${d.id}">Editar</button>
                        <button class="btn btn-link text-danger" type="button" data-eliminar-dlc="${d.id}">Eliminar</button>
                    </div>
                </div>
                <div class="collapse" id="editarDlc${d.id}">${formDlc(d, `Dlc${d.id}`)}</div>
            </div>`).join('') : `<div class="list-group-item vacio">${esc(j.titulo)} todavía no tiene DLC.</div>`;
        zona.innerHTML = `
            <div class="list-group tarjeta">
                ${items}
                <div class="list-group-item p-0">
                    <button class="btn btn-link dlc-agregar" type="button" data-bs-toggle="collapse" data-bs-target="#agregarDlc"
                        aria-expanded="false" aria-controls="agregarDlc"><span class="mas" aria-hidden="true">+</span>Agregar DLC a ${esc(j.titulo)}</button>
                    <div class="collapse px-3 pb-3" id="agregarDlc">${formDlc(null, 'NuevoDlc')}</div>
                </div>
            </div>`;
    }

    function pintar() {
        const publicados = juegos.filter((j) => j.estado === 'publicado');
        const retirados = juegos.filter((j) => j.estado === 'retirado');
        const totalDlc = juegos.reduce((n, j) => n + j.dlcs.length, 0);
        document.getElementById('statsDev').textContent =
            `${publicados.length} publicado${publicados.length === 1 ? '' : 's'} · ${totalDlc} DLC`;
        document.getElementById('listaPublicados').innerHTML = publicados.length
            ? publicados.map(filaJuego).join('')
            : '<div class="list-group-item vacio">Aún no tienes videojuegos publicados. Usa “+ Publicar videojuego”.</div>';
        document.getElementById('listaRetirados').innerHTML = retirados.length
            ? retirados.map(filaJuego).join('')
            : '<div class="list-group-item vacio">No tienes videojuegos retirados.</div>';
        pintarDlc();
    }

    async function cargar() {
        ({ juegos } = await api('/dev/juegos'));
        pintar();
    }

    // Reemplaza un juego actualizado en la lista y repinta.
    function actualizar(juego) {
        const i = juegos.findIndex((j) => j.id === juego.id);
        if (i >= 0) juegos[i] = juego; else juegos.push(juego);
        pintar();
    }

    const avisoPanel = (m, t = 'success') => aviso(document.getElementById('avisoPanel'), m, t);

    // ----- Formularios (delegación) -----
    document.querySelector('main').addEventListener('submit', async (e) => {
        const form = e.target;
        e.preventDefault();
        const boton = form.querySelector('[type=submit]');
        form.querySelectorAll('.is-invalid').forEach((i) => errorCampo(i, ''));
        try {
            if (form.dataset.editar) {
                const id = Number(form.dataset.editar);
                const datos = Object.fromEntries(['titulo', 'genero', 'clasificacion', 'precio', 'especificaciones', 'descripcion']
                    .map((k) => [k, form[k].value]));
                datos.precio = Number(datos.precio);
                const archivo = form.portada.files[0];
                if (archivo) datos.portada = await leerImagen(archivo);
                ocupado(boton, true);
                const { juego } = await api(`/dev/juegos/${id}`, { method: 'PUT', body: datos });
                actualizar(juego);
                avisoPanel(`“${juego.titulo}” se actualizó correctamente.`);
            } else if (form.dataset.nuevoDlc || form.dataset.editarDlc) {
                const datos = { nombre: form.nombre.value, tipo: form.tipo.value, descripcion: form.descripcion.value };
                if (!datos.nombre.trim()) { errorCampo(form.nombre, 'El nombre del DLC es obligatorio.'); return; }
                ocupado(boton, true);
                const { juego } = form.dataset.nuevoDlc
                    ? await api(`/dev/juegos/${form.dataset.nuevoDlc}/dlcs`, { method: 'POST', body: datos })
                    : await api(`/dev/dlcs/${form.dataset.editarDlc}`, { method: 'PUT', body: datos });
                actualizar(juego);
                toast(form.dataset.nuevoDlc ? 'DLC agregado.' : 'DLC actualizado.');
            }
        } catch (err) {
            ocupado(boton, false);
            const input = err.campo && form[err.campo === 'especificaciones' ? 'especificaciones' : err.campo];
            if (input && input.classList) errorCampo(input, err.message);
            else toast(err.message, 'danger');
        }
    });

    // Muestra el nombre del archivo elegido como portada nueva
    document.querySelector('main').addEventListener('change', (e) => {
        if (e.target.name !== 'portada') return;
        const etiqueta = e.target.closest('form').querySelector('[data-archivo]');
        if (etiqueta) etiqueta.textContent = e.target.files[0] ? `Nueva portada: ${e.target.files[0].name}` : '';
    });

    document.querySelector('main').addEventListener('click', async (e) => {
        const t = e.target;
        const chip = t.closest('[data-chip]');
        if (chip) { dlcJuegoActivo = Number(chip.dataset.chip); pintarDlc(); return; }
        const ver = t.closest('[data-ver]');
        if (ver) { abrirDetalle(Number(ver.dataset.ver)); return; }
        const ret = t.closest('[data-retirar]');
        if (ret) { pedirRetiro(Number(ret.dataset.retirar)); return; }
        const pub = t.closest('[data-publicar]');
        if (pub) {
            try {
                const { juego } = await api(`/dev/juegos/${pub.dataset.publicar}/publicar`, { method: 'POST' });
                actualizar(juego);
                toast(`“${juego.titulo}” está de nuevo en el catálogo.`);
            } catch (err) { toast(err.message, 'danger'); }
            return;
        }
        const del = t.closest('[data-eliminar-dlc]');
        if (del) {
            pendiente = { tipo: 'dlc', id: Number(del.dataset.eliminarDlc) };
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalEliminarDlc')).show();
        }
    });

    function pedirRetiro(id) {
        pendiente = { tipo: 'retirar', id };
        const abierto = document.querySelector('.modal.show');
        if (abierto) bootstrap.Modal.getInstance(abierto)?.hide();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('modalRetirar')).show();
    }

    document.getElementById('confirmarRetirar').addEventListener('click', async () => {
        if (pendiente?.tipo !== 'retirar') return;
        const { id } = pendiente;
        pendiente = null;
        try {
            const { juego } = await api(`/dev/juegos/${id}/retirar`, { method: 'POST' });
            actualizar(juego);
            avisoPanel(`“${juego.titulo}” se retiró del catálogo. Sigue en las bibliotecas de quienes lo tienen.`);
        } catch (err) { toast(err.message, 'danger'); }
    });

    document.getElementById('confirmarEliminarDlc').addEventListener('click', async () => {
        if (pendiente?.tipo !== 'dlc') return;
        const { id } = pendiente;
        pendiente = null;
        try {
            const { juego } = await api(`/dev/dlcs/${id}`, { method: 'DELETE' });
            actualizar(juego);
            toast('DLC eliminado.');
        } catch (err) { toast(err.message, 'danger'); }
    });

    // ----- Detalle con reseñas y respuestas -----
    const modalDetalle = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalDetalle'));
    function abrirDetalle(id) {
        const j = juegos.find((x) => x.id === id);
        const retirado = j.estado === 'retirado';
        const resenas = j.resenas.length ? j.resenas.map((r) => `
            <div class="list-group-item d-flex flex-column gap-2">
                <div class="d-flex justify-content-between align-items-center gap-2">
                    <strong>${esc(r.usuario_nombre)}</strong>${estrellas(r.estrellas)}
                </div>
                <span class="fila-meta">${fecha(r.creado_en)}</span>
                <p class="mb-0">${esc(r.texto)}</p>
                <form class="d-flex flex-column gap-2" data-responder="${r.id}" novalidate>
                    <label class="fila-label" for="resp${r.id}">${r.respuesta ? 'Tu respuesta' : 'Responder'}</label>
                    <textarea class="form-control" id="resp${r.id}" name="texto" rows="2" maxlength="600"
                        placeholder="Escribe una respuesta pública">${esc(r.respuesta)}</textarea>
                    <div class="d-flex justify-content-end"><button class="btn btn-outline-secondary btn-sm" type="submit">
                        ${r.respuesta ? 'Actualizar respuesta' : 'Publicar respuesta'}</button></div>
                </form>
            </div>`).join('') : '<div class="list-group-item fila-meta">Sin reseñas todavía.</div>';
        document.getElementById('contenidoDetalle').innerHTML = `
            <div class="modal-header gap-3">
                ${portada(j, `portada-lg${retirado ? ' portada-retirada' : ''}`)}
                <div class="d-flex flex-column gap-1 me-auto">
                    <span class="${retirado ? 'estado-retirado' : 'estado-publicado'} small">${retirado ? 'Retirado' : 'Publicado'}</span>
                    <h2 class="modal-title" id="detalleTitulo">${esc(j.titulo)}</h2>
                    <span class="fila-meta">${esc(j.genero)} · ${j.precio} créditos</span>
                </div>
                <button type="button" class="btn-close align-self-start" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body d-flex flex-column gap-3">
                <div class="list-group tarjeta">
                    <div class="list-group-item d-flex flex-column"><span class="fila-label">Descripción</span><span class="fila-valor">${esc(j.descripcion) || 'Sin descripción'}</span></div>
                    <div class="list-group-item d-flex flex-column"><span class="fila-label">Clasificación de edad</span><span class="fila-valor">${CLASIF[j.clasificacion]}</span></div>
                    <div class="list-group-item d-flex flex-column"><span class="fila-label">Especificaciones</span><span class="fila-valor">${esc(j.especificaciones) || 'No especificadas'}</span></div>
                    <div class="list-group-item d-flex flex-column"><span class="fila-label">Contenido descargable</span><span class="fila-valor">${j.dlcs.length ? j.dlcs.map((d) => esc(d.nombre)).join(' · ') : 'Sin DLC'}</span></div>
                    <div class="list-group-item d-flex flex-column"><span class="fila-label">Calificación promedio</span><span class="fila-valor">${j.num_resenas ? `${j.calificacion} de 5 · ${j.num_resenas} reseña${j.num_resenas === 1 ? '' : 's'}` : 'Sin reseñas todavía'}</span></div>
                    <div class="list-group-item d-flex flex-column"><span class="fila-label">Jugadores</span><span class="fila-valor">${retirado ? 'Ya no se puede adquirir; sigue' : 'Está'} en la biblioteca de ${j.jugadores} jugador${j.jugadores === 1 ? '' : 'es'}.</span></div>
                </div>
                <h3 class="h6 mb-0 mt-2">Reseñas</h3>
                <div class="list-group tarjeta" id="resenasDetalle">${resenas}</div>
            </div>
            <div class="modal-footer ${retirado ? '' : 'justify-content-between'}">
                ${retirado ? '' : `<button type="button" class="btn btn-link text-danger px-0" data-retirar-modal="${j.id}">Retirar del catálogo</button>`}
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            </div>`;
        modalDetalle.show();
    }

    const contenidoDetalle = document.getElementById('contenidoDetalle');
    contenidoDetalle.addEventListener('click', (e) => {
        const b = e.target.closest('[data-retirar-modal]');
        if (b) pedirRetiro(Number(b.dataset.retirarModal));
    });
    contenidoDetalle.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target.closest('[data-responder]');
        if (!form) return;
        const boton = form.querySelector('[type=submit]');
        ocupado(boton, true);
        try {
            const { juego } = await api(`/dev/resenas/${form.dataset.responder}/respuesta`, { method: 'PUT', body: { texto: form.texto.value } });
            actualizar(juego);
            toast(form.texto.value.trim() ? 'Respuesta publicada.' : 'Respuesta eliminada.');
            abrirDetalle(juego.id);
        } catch (err) {
            ocupado(boton, false);
            toast(err.message, 'danger');
        }
    });

    // ----- Publicar videojuego -----
    const formPub = document.getElementById('formPublicar');
    const modalPub = document.getElementById('modalPublicar');
    const preview = document.getElementById('previewPortada');
    document.getElementById('nuevoPortada').addEventListener('change', async (e) => {
        try {
            const url = await leerImagen(e.target.files[0]);
            preview.style.backgroundImage = url ? `url("${url}")` : '';
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
            preview.textContent = url ? '' : '+ Portada';
        } catch (err) {
            e.target.value = '';
            toast(err.message, 'danger');
        }
    });
    modalPub.addEventListener('hidden.bs.modal', () => {
        formPub.reset();
        preview.style.backgroundImage = '';
        preview.textContent = '+ Portada';
        formPub.querySelectorAll('.is-invalid').forEach((i) => errorCampo(i, ''));
        document.getElementById('errorPrecio').hidden = true;
    });
    formPub.addEventListener('submit', async (e) => {
        e.preventDefault();
        const titulo = document.getElementById('nuevoTitulo');
        const precio = document.getElementById('nuevoPrecio');
        const errPrecio = document.getElementById('errorPrecio');
        errorCampo(titulo, '');
        precio.classList.remove('is-invalid');
        errPrecio.hidden = true;
        let ok = true;
        if (!titulo.value.trim()) { errorCampo(titulo, 'El título es obligatorio.'); ok = false; }
        const p = Number(precio.value);
        if (!Number.isInteger(p) || p < 1) {
            precio.classList.add('is-invalid');
            errPrecio.textContent = 'El precio debe ser un número entero mayor a 0.';
            errPrecio.hidden = false;
            ok = false;
        }
        if (!ok) return;
        const boton = formPub.querySelector('[type=submit]');
        ocupado(boton, true, 'Publicando…');
        try {
            const datos = {
                titulo: titulo.value,
                descripcion: document.getElementById('nuevoDescripcion').value,
                genero: document.getElementById('nuevoGenero').value,
                clasificacion: document.getElementById('nuevoClasificacion').value,
                precio: p,
                especificaciones: document.getElementById('nuevoSpecs').value,
                portada: await leerImagen(document.getElementById('nuevoPortada').files[0]),
            };
            const { juego } = await api('/dev/juegos', { method: 'POST', body: datos });
            actualizar(juego);
            bootstrap.Modal.getInstance(modalPub).hide();
            bootstrap.Tab.getOrCreateInstance(document.getElementById('tabPublicados')).show();
            avisoPanel(`“${juego.titulo}” se publicó y ya aparece en el catálogo.`);
        } catch (err) {
            toast(err.message, 'danger');
        } finally {
            ocupado(boton, false);
        }
    });

    try {
        await cargar();
    } catch (err) {
        toast(err.message, 'danger');
    }
})();
