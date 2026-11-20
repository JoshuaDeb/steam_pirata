# SteamPirata

Plataforma para descubrir, adquirir (con créditos virtuales), reseñar y publicar videojuegos.

- **FRONTEND/**: vistas HTML/CSS (Bootstrap) + `js/` con la lógica que consume la API.
- **BACKEND/**: servidor Node.js + Express, base de datos SQLite (módulo `node:sqlite` incluido en Node).

## Cómo correrlo

Requisitos: **Node.js 22.5 o superior** (no hace falta instalar ninguna base de datos).

```bash
cd BACKEND
npm install
npm start
```

Abre <http://localhost:3000>. La base de datos se crea sola en `BACKEND/data/steampirata.db` con datos de demostración.

| Comando            | Qué hace                                               |
|--------------------|--------------------------------------------------------|
| `npm start`        | Inicia el servidor en el puerto 3000 (`PORT` para cambiarlo) |
| `npm run dev`      | Igual, pero se reinicia al guardar cambios             |
| `npm run reset-db` | Borra la base y la vuelve a crear con los datos demo   |
| `npm test`         | Pruebas automáticas de la API (usa una base temporal)  |

### Cuentas demo (contraseña `demo1234`)

| Correo               | Tipo          |
|----------------------|---------------|
| `jugador@demo.com`   | Jugador (con biblioteca, favoritos y amigos) |
| `dev@demo.com`       | Desarrollador (PixelStudio)                  |

También puedes crear tu propia cuenta desde "Crear cuenta".

## Qué se guarda

- **Cuentas**: registro, inicio/cierre de sesión, editar nombre y correo, cambiar contraseña, eliminar cuenta.
  Las contraseñas se guardan con hash `scrypt` + sal; la sesión es una cookie `HttpOnly` que dura 7 días.
- **Jugador**: 100 créditos al registrarse, adquirir juegos, favoritos, reseñas (la primera reseña de cada juego da
  10 créditos, una sola vez), historial de créditos, compra simulada de créditos, amigos y solicitudes.
- **Desarrollador**: publicar juegos (con portada), editarlos, retirarlos/volver a publicarlos, DLC, responder reseñas.

## API

Todas las rutas responden JSON; los errores tienen la forma `{ "error": "mensaje", "campo": "nombreDelCampo" }`.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/registro` | `{ nombre, correo, password, tipo }` |
| POST | `/api/auth/login` | `{ correo, password }` |
| POST | `/api/auth/logout` | Cierra la sesión |
| GET / PATCH / DELETE | `/api/me` | Ver, editar (`nombre`, `correo`) o eliminar (`{ confirmacion: "ELIMINAR" }`) la cuenta |
| PUT | `/api/me/password` | `{ actual, nueva, confirmacion }` |
| GET | `/api/me/movimientos` | Historial de créditos |
| POST | `/api/me/creditos` | Compra simulada `{ paquete: 10\|20\|50\|100\|200, metodo }` |
| GET | `/api/me/biblioteca`, `/api/me/favoritos` | Juegos del jugador |
| GET | `/api/juegos` | Catálogo: `q, genero, clasificacion, precio_max, calificacion_min, orden, pagina` |
| GET | `/api/juegos/:id` | Detalle con DLC y reseñas |
| POST | `/api/juegos/:id/adquirir` | Compra con créditos |
| PUT / DELETE | `/api/juegos/:id/favorito` | Agregar / quitar favorito |
| POST | `/api/juegos/:id/resenas` | `{ estrellas, texto }` (crea o edita la propia) |
| GET | `/api/amigos`, `/api/amigos/buscar?q=`, `/api/amigos/usuarios/:id` | Amigos, búsqueda y perfil público |
| POST | `/api/amigos/solicitudes`, `/api/amigos/solicitudes/:id/aceptar` | Enviar / aceptar solicitud |
| DELETE | `/api/amigos/solicitudes/:id`, `/api/amigos/:usuarioId` | Rechazar o cancelar solicitud / eliminar amigo |
| GET / POST | `/api/dev/juegos` | Juegos del desarrollador / publicar uno |
| PUT | `/api/dev/juegos/:id` | Editar juego |
| POST | `/api/dev/juegos/:id/retirar`, `/publicar` | Retirar / volver a publicar |
| POST / PUT / DELETE | `/api/dev/juegos/:id/dlcs`, `/api/dev/dlcs/:id` | DLC |
| PUT | `/api/dev/resenas/:id/respuesta` | `{ texto }` responder una reseña |

> La compra de créditos es una **simulación**: el servidor no recibe datos de tarjeta ni hace cobros.
