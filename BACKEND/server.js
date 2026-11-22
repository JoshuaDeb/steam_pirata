const express = require("express");
const path = require("path");
const authRoutes = require("./routes/auth_routes");
const usersRoutes = require("./routes/users_routes");

const app = express();
const PORT = 3000;

// Permitir recibir datos en formato JSON
app.use(express.json());

// Rutas de autenticación
app.use("/api/auth", authRoutes);

// Rutas de usuarios
app.use("/api/users", usersRoutes);

app.use("/assets", express.static(path.join(__dirname, "../FRONTEND/assets")));
app.use("/controllers", express.static(path.join(__dirname, "../FRONTEND/controllers")))
app.use(express.static(path.join(__dirname, "../FRONTEND/views")));

app.get("/", (req, res) => {
    res.redirect("/login.html");
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
