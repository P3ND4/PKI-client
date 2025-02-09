const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const forge = require("node-forge")
const {execSync} = require("child_process");
const path = require("path");
const fs = require("fs");
const { name } = require("ejs");
const app = express();
const PORT = 4001;





// Configuración para leer datos del formulario
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configuración de EJS como motor de plantillas
app.set("view engine", "ejs");
app.set("views", __dirname+"/views");

// Ruta para servir el formulario
app.get("/", (req, res) => {
  res.render("forms.ejs"); // Renderiza la vista form.ejs
});

// Ruta para manejar el envío del formulario
app.post("/submit", async (req, res) => {
  var { nombre, organizacion, ou } = req.body;
  nombre = nombre.trim();
  organizacion = organizacion.trim();
  console.log(nombre)
  try {
    // Cambia la URL por la de tu API
    const {Pu, csr } = generateECDSACSR(nombre, organizacion, ou);
    const response = await axios.post("http://localhost:2000/sign-csr", {
      nombre,
      csr
    });
    const ca_root = await axios.get("http://localhost:2000/root-ca");
    fs.writeFileSync(path.join(__dirname,`${nombre}.${organizacion}acme.com-cert.pem`), response.data.cert, 'utf8')
    fs.writeFileSync(path.join(__dirname,`ca.org1.acme.com-cert.pem`), ca_root.data.cert, 'utf8')
    res.send(`Datos enviados correctamente: ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.error("Error al enviar datos:", error);
    res.status(500).send("Error al enviar datos a la API");
  }
});

// Inicia el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});


