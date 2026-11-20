// Inicio de sesión y registro.
(function () {
    'use strict';
    const { api, aviso, errorCampo, ocupado } = SP;

    const destino = (u) => (u.tipo === 'desarrollador' ? 'dev_profile.html' : 'store.html');

    // Si ya hay sesión, no tiene caso mostrar el login.
    api('/me').then(({ usuario }) => location.replace(destino(usuario))).catch(() => {});

    // Abre la pestaña de registro si la URL termina en #registro
    if (location.hash === '#registro') {
        bootstrap.Tab.getOrCreateInstance(document.getElementById('tabRegistro')).show();
    }

    function limpiar(form) {
        form.querySelectorAll('.is-invalid').forEach((i) => errorCampo(i, ''));
    }

    const formEntrar = document.getElementById('formEntrar');
    formEntrar.addEventListener('submit', async (e) => {
        e.preventDefault();
        limpiar(formEntrar);
        aviso(document.getElementById('avisoEntrar'), '');
        const correo = formEntrar.correo.value.trim();
        const password = formEntrar.password.value;
        let valido = true;
        if (!formEntrar.correo.checkValidity() || !correo) { errorCampo(formEntrar.correo, 'Escribe un correo válido.'); valido = false; }
        if (!password) { errorCampo(formEntrar.password, 'Escribe tu contraseña.'); valido = false; }
        if (!valido) return;

        const boton = formEntrar.querySelector('[type=submit]');
        ocupado(boton, true, 'Entrando…');
        try {
            const { usuario } = await api('/auth/login', { method: 'POST', body: { correo, password } });
            location.href = destino(usuario);
        } catch (err) {
            ocupado(boton, false);
            aviso(document.getElementById('avisoEntrar'), err.message);
            formEntrar.password.value = '';
            formEntrar.password.focus();
        }
    });

    const formRegistro = document.getElementById('formRegistro');
    const campos = { nombre: 'nombre', correo: 'correo', password: 'password' };
    formRegistro.addEventListener('submit', async (e) => {
        e.preventDefault();
        limpiar(formRegistro);
        aviso(document.getElementById('avisoRegistro'), '');
        const datos = {
            nombre: formRegistro.nombre.value.trim(),
            correo: formRegistro.correo.value.trim(),
            password: formRegistro.password.value,
            tipo: formRegistro.tipoCuenta.value,
        };
        let valido = true;
        if (!/^[A-Za-z0-9_]{3,20}$/.test(datos.nombre)) {
            errorCampo(formRegistro.nombre, 'De 3 a 20 caracteres: letras, números o guion bajo.'); valido = false;
        }
        if (!formRegistro.correo.checkValidity() || !datos.correo) {
            errorCampo(formRegistro.correo, 'Ingresa un correo válido (ej. nombre@dominio.com).'); valido = false;
        }
        if (datos.password.length < 8) {
            errorCampo(formRegistro.password, 'La contraseña debe tener al menos 8 caracteres.'); valido = false;
        }
        if (!valido) return;

        const boton = formRegistro.querySelector('[type=submit]');
        ocupado(boton, true, 'Creando cuenta…');
        try {
            const { usuario } = await api('/auth/registro', { method: 'POST', body: datos });
            location.href = destino(usuario);
        } catch (err) {
            ocupado(boton, false);
            const input = err.campo && formRegistro[campos[err.campo]];
            if (input) { errorCampo(input, err.message); input.focus(); }
            else aviso(document.getElementById('avisoRegistro'), err.message);
        }
    });
})();
