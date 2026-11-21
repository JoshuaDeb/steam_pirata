const express = require("express");
const path = require("path");
const authRoutes = require("./routes/auth_routes");

const app = express();
const PORT = 3000;

// Permitir recibir datos en formato JSON
app.use(express.json());

// Rutas de autenticación
app.use("/api/auth", authRoutes);

app.use("/assets", express.static(path.join(__dirname, "../FRONTEND/assets")));

app.use(express.static(path.join(__dirname, "../FRONTEND/views")));

app.get("/", (req, res) => {
    res.redirect("/login.html");
});

// Ruta para comprobar que el servidor funciona
app.get("/api/health", (req, res) => {
    res.json({
        message: "Servidor de Steam Pirata funcionando correctamente"
    });
});


// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
