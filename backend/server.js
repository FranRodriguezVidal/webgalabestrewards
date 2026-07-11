import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";

const app = express();
app.use(cors());

// Carpeta donde se guardarán las imágenes
const uploadFolder = "public/uploads";

// Configurar Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadFolder);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// Ruta para subir imágenes
app.post("/upload", upload.single("file"), (req, res) => {
  const fileName = req.file.filename;
  res.json({ fileName });
});

// Servir imágenes estáticas
app.use("/uploads", express.static(path.join(process.cwd(), "public/uploads")));

app.listen(3001, () => {
  console.log("Servidor backend funcionando en http://localhost:3001");
});
