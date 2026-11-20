// Utilidades compartidas por todas las vistas: llamadas a la API, sesión, barra superior y formato.
(function () {
    'use strict';

    async function api(url, { method = 'GET', body } = {}) {
        const res = await fetch(`/api${url}`, {
            method,
            credentials: 'same-origin',
            headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        let data = {};
        try { data = await res.json(); } catch { /* respuesta vacía */ }
        if (!res.ok) {
            const err = new Error(data.error || 'No se pudo completar la acción.');
            err.status = res.status;
            err.campo = data.campo;
            throw err;
        }
        return data;
    }

    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

    const iniciales = (nombre) => {
        const partes = String(nombre || '').replace(/_/g, ' ').match(/[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/g) || [nombre || '?'];
        const ini = partes.length > 1 ? partes[0][0] + partes[1][0] : String(nombre).slice(0, 2);
        return ini.toUpperCase();
    };

    // Las fechas de SQLite vienen en UTC como "AAAA-MM-DD HH:MM:SS".
    const fecha = (s) => {
        if (!s) return '';
        const d = new Date(s.replace(' ', 'T') + 'Z');
        return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
    };

    const CLASIF = { E: 'E · Todos', T: 'T · +13', M: 'M · +17' };
    const CLASIF_TITULO = { E: 'Apto para todo público', T: 'Mayores de 13 años', M: 'Mayores de 17 años' };

    const estrellas = (n) => {
        let html = '';
        for (let i = 1; i <= 5; i++) {
            html += i <= Math.round(n) ? '<i class="fa-solid fa-star"></i>'
                : '<span class="vacia"><i class="fa-solid fa-star"></i></span>';
        }
        return `<span class="estrellas" role="img" aria-label="${n} de 5 estrellas">${html}</span>`;
    };

    // Color estable de portada a partir del id del juego (clases portada-1..N del CSS).
    const colorPortada = (id, total = 12) => `portada-${((Number(id) - 1) % total) + 1}`;

    // Imagen de portada o, si no tiene, las iniciales del título sobre color.
    const portadaHtml = (juego, clasesImg = 'position-absolute top-0 start-0 w-100 h-100 object-fit-cover') => juego.portada
        ? `<img class="${clasesImg}" src="${esc(juego.portada)}" alt="${esc(juego.titulo)}">`
        : `<span class="juego-marca" aria-hidden="true">${esc(iniciales(juego.titulo))}</span>`;

    // Muestra un mensaje dentro de un contenedor (usa alertas de Bootstrap).
    function aviso(contenedor, mensaje, tipo = 'danger') {
        if (!contenedor) return;
        contenedor.innerHTML = mensaje
            ? `<div class="alert alert-${tipo} alert-dismissible fade show mb-0" role="alert">${esc(mensaje)}
                 <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button></div>`
            : '';
    }

    // Aviso flotante breve en la esquina inferior.
    function toast(mensaje, tipo = 'success') {
        let zona = document.getElementById('zonaToasts');
        if (!zona) {
            zona = document.createElement('div');
            zona.id = 'zonaToasts';
            zona.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            zona.style.zIndex = 2000;
            document.body.appendChild(zona);
        }
        const el = document.createElement('div');
        el.className = `toast align-items-center text-bg-${tipo} border-0`;
        el.setAttribute('role', 'status');
        el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(mensaje)}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button></div>`;
        zona.appendChild(el);
        const t = bootstrap.Toast.getOrCreateInstance(el, { delay: 3500 });
        el.addEventListener('hidden.bs.toast', () => el.remove());
        t.show();
    }

    // Marca un campo como inválido con su mensaje (o lo limpia si mensaje es vacío).
    function errorCampo(input, mensaje) {
        if (!input) return;
        let fb = input.parentElement.querySelector('.invalid-feedback');
        if (mensaje && !fb) {
            fb = document.createElement('div');
            fb.className = 'invalid-feedback';
            input.insertAdjacentElement('afterend', fb);
        }
        input.classList.toggle('is-invalid', !!mensaje);
        if (fb) fb.textContent = mensaje || '';
    }

    function ocupado(boton, si, texto) {
        if (!boton) return;
        if (si) {
            boton.dataset.textoOriginal = boton.innerHTML;
            boton.disabled = true;
            boton.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${esc(texto || 'Guardando…')}`;
        } else {
            boton.disabled = false;
            if (boton.dataset.textoOriginal) boton.innerHTML = boton.dataset.textoOriginal;
        }
    }

    // Barra superior según el tipo de cuenta.
    function pintarBarra(usuario) {
        const nav = document.querySelector('.topbar');
        if (!nav) return;
        const usuarioNav = nav.querySelector('.usuario-nav');
        if (usuarioNav) {
            const spans = usuarioNav.querySelectorAll('span');
            spans[0].textContent = usuario.nombre;
            spans[1].textContent = iniciales(usuario.nombre);
        }
        const actual = location.pathname.split('/').pop();
        const links = usuario.tipo === 'desarrollador'
            ? [['store.html', 'Catálogo'], ['dev_profile.html', 'Panel'], ['user_profile.html', 'Perfil']]
            : [['store.html', 'Catálogo'], ['user_library.html', 'Biblioteca'], ['user_friends.html', 'Amigos'], ['user_profile.html', 'Perfil']];
        const ul = nav.querySelector('.navbar-nav');
        if (ul) {
            ul.innerHTML = links.map(([href, texto]) => `<li class="nav-item"><a class="nav-link${href === actual ? ' active" aria-current="page' : ''}" href="${href}">${texto}</a></li>`).join('');
        }
        nav.querySelectorAll('a[href="login.html"]').forEach((a) => {
            a.addEventListener('click', async (e) => {
                e.preventDefault();
                try { await api('/auth/logout', { method: 'POST' }); } catch { /* igual salimos */ }
                location.href = 'login.html';
            });
        });
    }

    // Carga la sesión; si no hay, manda al login. `tipo` restringe la vista a un tipo de cuenta.
    async function iniciarPagina({ tipo } = {}) {
        try {
            const { usuario } = await api('/me');
            if (tipo && usuario.tipo !== tipo) {
                location.replace(usuario.tipo === 'desarrollador' ? 'dev_profile.html' : 'store.html');
                return new Promise(() => {});
            }
            pintarBarra(usuario);
            document.documentElement.dataset.tipoCuenta = usuario.tipo;
            return usuario;
        } catch (e) {
            if (e.status === 401) {
                location.replace('login.html');
                return new Promise(() => {});
            }
            throw e;
        }
    }

    // Paginación simple en cliente para listas ya cargadas.
    function paginar(lista, pagina, porPagina) {
        const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
        const p = Math.min(Math.max(1, pagina), paginas);
        return { items: lista.slice((p - 1) * porPagina, p * porPagina), pagina: p, paginas };
    }

    // Lee una imagen elegida en un <input type=file> como data URL (máx. 2 MB).
    function leerImagen(file) {
        return new Promise((resolve, reject) => {
            if (!file) return resolve(null);
            if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('La portada debe ser PNG, JPG o WEBP.'));
            if (file.size > 2 * 1024 * 1024) return reject(new Error('La portada no puede pesar más de 2 MB.'));
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(new Error('No se pudo leer la imagen.'));
            fr.readAsDataURL(file);
        });
    }

    window.SP = {
        api, esc, iniciales, fecha, estrellas, colorPortada, portadaHtml, aviso, toast, errorCampo, ocupado,
        iniciarPagina, paginar, leerImagen, CLASIF, CLASIF_TITULO,
    };
})();
