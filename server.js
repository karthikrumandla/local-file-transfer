const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: "No file" });
  io.emit("file-uploaded", req.file.filename);
  res.json({ success: true, file: req.file.filename });
});

app.post("/upload-multiple", upload.array("files", 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: "No files" });
  }
  const names = req.files.map(f => f.filename);
  io.emit("files-uploaded", names);
  res.json({ success: true, files: names });
});

app.get("/files", (req, res) => {
  const files = fs.readdirSync(uploadDir).map(name => {
    const stat = fs.statSync(path.join(uploadDir, name));
    return { name, size: stat.size, modified: stat.mtime };
  }).sort((a, b) => b.modified - a.modified);
  res.json(files);
});

app.delete("/files/:name", (req, res) => {
  const filePath = path.join(uploadDir, req.params.name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    io.emit("file-deleted", req.params.name);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: "Not found" });
  }
});

app.get("/qr", async (req, res) => {
  const networkInterfaces = os.networkInterfaces();
  let ip = "localhost";
  for (const iface of Object.values(networkInterfaces)) {
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        ip = addr.address;
        break;
      }
    }
    if (ip !== "localhost") break;
  }
  const url = `http://${ip}:${PORT}`;
  const qr = await QRCode.toDataURL(url);
  res.json({ url, qr });
});

app.use("/downloads", express.static(uploadDir));

const clientDist = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Find your IP with: ipconfig`);
});
