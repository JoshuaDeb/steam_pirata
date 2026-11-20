// Perfil: datos de la cuenta, créditos (compra simulada), contraseña y eliminar cuenta.
(async function () {
    'use strict';
    const { api, esc, iniciales, fecha, toast, ocupado, aviso, errorCampo } = SP;

    let usuario = await SP.iniciarPagina();
    const esJugador = usuario.tipo === 'jugador';

    function pintarUsuario() {
        document.getElementById('bannerNombre').textContent = usuario.nombre;
        document.getElementById('avatarPerfil').textContent = iniciales(usuario.nombre);
        document.getElementById('nombrePerfil').textContent = usuario.nombre;
        const tipo = esJugador ? 'Jugador' : 'Desarrollador';
        document.getElementById('tipoPerfil').textContent = tipo;
        document.getElementById('valorTipo').textContent = tipo;
        document.getElementById('valorNombre').textContent = usuario.nombre;
        document.getElementById('valorCorreo').textContent = usuario.correo;
        document.getElementById('inputNombre').value = usuario.nombre;
        document.getElementById('inputCorreo').value = usuario.correo;
        document.querySelectorAll('.js-creditos').forEach((el) => { el.textContent = usuario.creditos; });
        document.getElementById('textoEliminar').textContent = esJugador
            ? `Perderás tu biblioteca, favoritos, reseñas, amistades y tus ${usuario.creditos} créditos.`
            : 'Se eliminarán tu cuenta y todos los videojuegos y DLC que publicaste.';
        document.getElementById('conceptoSpei').textContent = `SP-${usuario.nombre.toUpperCase()}-${String(usuario.id).padStart(4, '0')}`;
        const [local, dominio] = usuario.correo.split('@');
        document.getElementById('cuentaPaypal').textContent = `${local[0]}•••••@${dominio}`;
        document.querySelector('.usuario-nav span').textContent = usuario.nombre;
        document.querySelector('.usuario-nav .avatar').textContent = iniciales(usuario.nombre);
    }
    pintarUsuario();

    async function cargarMovimientos() {
        if (!esJugador) return;
        const { movimientos } = await api('/me/movimientos');
        document.getElementById('listaMovimientos').innerHTML = movimientos.length
            ? movimientos.map((m) => `
                <div class="list-group-item d-flex justify-content-between align-items-center gap-3">
                    <div class="d-flex flex-column"><span class="fila-valor">${esc(m.concepto)}</span>
                        <span class="fila-meta">${fecha(m.creado_en)}</span></div>
                    <span class="${m.cantidad >= 0 ? 'movimiento-mas' : 'movimiento-menos text-danger fw-bold'}">${m.cantidad >= 0 ? '+' : '−'}${Math.abs(m.cantidad)}</span>
                </div>`).join('')
            : '<div class="list-group-item fila-meta">Sin movimientos todavía.</div>';
    }
    cargarMovimientos().catch((e) => toast(e.message, 'danger'));

    if (location.hash === '#creditos' && esJugador) {
        bootstrap.Tab.getOrCreateInstance(document.getElementById('tabCreditos')).show();
    } else if (location.hash === '#seguridad') {
        bootstrap.Tab.getOrCreateInstance(document.getElementById('tabSeguridad')).show();
    }

    // ----- Editar nombre y correo -----
    function formEdicion(idForm, idInput, campo, idCollapse, validar) {
        const form = document.getElementById(idForm);
        const input = document.getElementById(idInput);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const valor = input.value.trim();
            const error = validar(valor);
            errorCampo(input, error);
            if (error) return;
            if (valor === usuario[campo]) {
                bootstrap.Collapse.getOrCreateInstance(document.getElementById(idCollapse)).hide();
                return;
            }
            const boton = form.querySelector('[type=submit]');
            ocupado(boton, true);
            try {
                ({ usuario } = await api('/me', { method: 'PATCH', body: { [campo]: valor } }));
                pintarUsuario();
                bootstrap.Collapse.getOrCreateInstance(document.getElementById(idCollapse)).hide();
                toast(campo === 'nombre' ? 'Nombre de usuario actualizado.' : 'Correo actualizado.');
            } catch (err) {
                errorCampo(input, err.message);
            } finally {
                ocupado(boton, false);
            }
        });
        // Al cancelar se restaura el valor guardado
        document.getElementById(idCollapse).addEventListener('hidden.bs.collapse', () => {
            input.value = usuario[campo];
            errorCampo(input, '');
        });
    }
    formEdicion('formNombre', 'inputNombre', 'nombre', 'editarNombre',
        (v) => (/^[A-Za-z0-9_]{3,20}$/.test(v) ? '' : 'De 3 a 20 caracteres: letras, números o guion bajo.'));
    formEdicion('formCorreo', 'inputCorreo', 'correo', 'editarCorreo',
        (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Ingresa un correo válido (ej. nombre@dominio.com).'));

    // ----- Contraseña -----
    const formPass = document.getElementById('formPassword');
    formPass.addEventListener('submit', async (e) => {
        e.preventDefault();
        const actual = document.getElementById('passActual');
        const nueva = document.getElementById('passNueva');
        const conf = document.getElementById('passConfirmar');
        [actual, nueva, conf].forEach((i) => errorCampo(i, ''));
        aviso(document.getElementById('avisoPassword'), '');
        let ok = true;
        if (!actual.value) { errorCampo(actual, 'Escribe tu contraseña actual.'); ok = false; }
        if (nueva.value.length < 8) { errorCampo(nueva, 'La nueva contraseña debe tener al menos 8 caracteres.'); ok = false; }
        if (conf.value !== nueva.value) { errorCampo(conf, 'Las contraseñas no coinciden.'); ok = false; }
        if (!ok) return;
        const boton = formPass.querySelector('[type=submit]');
        ocupado(boton, true, 'Actualizando…');
        try {
            await api('/me/password', { method: 'PUT', body: { actual: actual.value, nueva: nueva.value, confirmacion: conf.value } });
            formPass.reset();
            aviso(document.getElementById('avisoPassword'), 'Contraseña actualizada correctamente.', 'success');
        } catch (err) {
            const mapa = { actual, nueva, confirmacion: conf };
            if (mapa[err.campo]) errorCampo(mapa[err.campo], err.message);
            else aviso(document.getElementById('avisoPassword'), err.message);
        } finally {
            ocupado(boton, false);
        }
    });

    // ----- Eliminar cuenta -----
    document.getElementById('confirmarEliminar').addEventListener('click', async (e) => {
        const conf = document.getElementById('inputConfirmacion').value.trim();
        const zona = document.getElementById('avisoEliminar');
        if (conf !== 'ELIMINAR') return aviso(zona, 'Escribe ELIMINAR (en mayúsculas) para confirmar.');
        ocupado(e.currentTarget, true, 'Eliminando…');
        try {
            await api('/me', { method: 'DELETE', body: { confirmacion: conf } });
            location.replace('login.html');
        } catch (err) {
            ocupado(e.currentTarget, false);
            aviso(zona, err.message);
        }
    });

    // ----- Compra de créditos (simulada: no se envían datos de pago al servidor) -----
    document.getElementById('modalCompraExitosa').addEventListener('hidden.bs.modal', () => {
        document.querySelectorAll('input[name="paquete"], input[name="metodo"]').forEach((r) => { r.checked = false; });
    });
    document.querySelectorAll('[data-pagar]').forEach((boton) => {
        boton.addEventListener('click', async () => {
            const paquete = document.querySelector('input[name="paquete"]:checked')?.value;
            if (!paquete) return toast('Elige un paquete de créditos.', 'danger');
            ocupado(boton, true, 'Procesando…');
            try {
                ({ usuario } = await api('/me/creditos', { method: 'POST', body: { paquete: Number(paquete), metodo: boton.dataset.pagar } }));
                pintarUsuario();
                await cargarMovimientos();
                // Limpia los campos de tarjeta de la simulación
                ['numTarjeta', 'titular', 'vencimiento', 'cvv'].forEach((id) => { document.getElementById(id).value = ''; });
                const abierto = document.querySelector('.modal.show');
                if (abierto) bootstrap.Modal.getInstance(abierto)?.hide();
                bootstrap.Modal.getOrCreateInstance(document.getElementById('modalCompraExitosa')).show();
            } catch (err) {
                toast(err.message, 'danger');
            } finally {
                ocupado(boton, false);
            }
        });
    });
})();
