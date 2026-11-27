require("dotenv").config({ quiet: true });
const express = require("express");
const path = require("path");
const authRoutes = require("./routes/auth_routes");
const usersRoutes = require("./routes/users_routes");
const friendsRoutes = require("./routes/friends_routes");
const videojuegosRoutes = require("./routes/videojuegos_routes");
const dlcsRoutes = require("./routes/dlcs_routes");
const resenasRoutes = require("./routes/resenas_routes");
const comprasRoutes = require("./routes/compras_routes");
const desarrolladoresRoutes = require("./routes/desarrolladores_routes");
const conectarDB = require("./config/db");
const { webhookStripe } = require("./controllers/compras_controller");


const app = express();
const PORT = process.env.PORT || 3000;
if (!process.env.JWT_SECRET) {
    throw new Error("La variable JWT_SECRET no está configurada");
}
// Webhook de Stripe: necesita el cuerpo sin procesar, por eso va antes de express.json
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), webhookStripe);

// Permitir recibir datos en formato JSON (las portadas llegan en base64, hasta 2 MB)
app.use(express.json({ limit: "4mb" }));

// Rutas de autenticación
app.use("/api/auth", authRoutes);

// Rutas de usuarios
app.use("/api/users", usersRoutes);

// Rutas de amistades
app.use("/api/friends", friendsRoutes);

// Rutas de videojuegos y DLC
app.use("/api/videojuegos", videojuegosRoutes);
app.use("/api/dlcs", dlcsRoutes);
app.use("/api/resenas", resenasRoutes);
app.use("/api/compras", comprasRoutes);
app.use("/api/desarrolladores", desarrolladoresRoutes);

app.use("/assets", express.static(path.join(__dirname, "../FRONTEND/assets")));
app.use("/controllers", express.static(path.join(__dirname, "../FRONTEND/controllers")))
app.use(express.static(path.join(__dirname, "../FRONTEND/views")));

app.get("/", (req, res) => {
    res.redirect("/login.html");
});

// Middleware de errores al leer el cuerpo de la petición (JSON inválido, imagen demasiado grande)
app.use((error, req, res, next) => {
    if (error.type === "entity.too.large") {
        return res.status(413).json({
            message: "La imagen es demasiado grande (máximo 2 MB)"
        });
    }

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({
            message: "La petición no es un JSON válido"
        });
    }

    console.error("Error no controlado:", error);

    res.status(500).json({ message: "Error interno del servidor" });
});

// Conectar a MongoDB y después iniciar el servidor
conectarDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error("No se pudo conectar a MongoDB:", error.message);
        process.exit(1);
    });
