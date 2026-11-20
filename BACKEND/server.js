// Servidor de SteamPirata: API REST en /api y archivos del FRONTEND como sitio estático.
const path = require('node:path');
const express = require('express');
const { abrir } = require('./db');
const { cargarUsuario } = require('./sesion');
const { HttpError } = require('./util');

function crearApp(db = abrir()) {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '4mb' })); // portadas en base64 de hasta 2 MB
    app.use(cargarUsuario(db));

    // Protección CSRF básica: las peticiones que modifican datos deben venir de este mismo sitio.
    app.use('/api', (req, _res, next) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
        const origen = req.headers.origin;
        if (origen && origen !== `${req.protocol}://${req.headers.host}`) {
            return next(new HttpError(403, 'Origen no permitido.'));
        }
        if (!req.is('application/json') && req.headers['content-length'] !== '0' && req.headers['content-length']) {
            return next(new HttpError(415, 'Envía los datos como JSON.'));
        }
        next();
    });

    app.use('/api/auth', require('./routes/auth')(db));
    app.use('/api/me', require('./routes/me')(db));
    app.use('/api/juegos', require('./routes/juegos')(db));
    app.use('/api/amigos', require('./routes/amigos')(db));
    app.use('/api/dev', require('./routes/dev')(db));
    app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta de API no encontrada.')));

    // Sitio web
    const FRONTEND = path.join(__dirname, '..', 'FRONTEND');
    app.get('/', (req, res) => {
        if (!req.usuario) return res.redirect('/views/login.html');
        res.redirect(req.usuario.tipo === 'desarrollador' ? '/views/dev_profile.html' : '/views/store.html');
    });
    app.use(express.static(FRONTEND, { extensions: ['html'] }));

    // Manejo de errores: siempre responde JSON con { error, campo }.
    app.use((err, _req, res, _next) => {
        if (err.type === 'entity.parse.failed') err = new HttpError(400, 'El cuerpo de la petición no es JSON válido.');
        if (err.type === 'entity.too.large') err = new HttpError(413, 'Los datos enviados son demasiado grandes.');
        const status = err.status || 500;
        if (status === 500) console.error(err);
        res.status(status).json({ error: status === 500 ? 'Ocurrió un error en el servidor.' : err.message, campo: err.campo });
    });

    return app;
}

module.exports = { crearApp };

if (require.main === module) {
    const PORT = Number(process.env.PORT) || 3000;
    crearApp().listen(PORT, () => {
        console.log(`SteamPirata listo en http://localhost:${PORT}`);
    });
}
