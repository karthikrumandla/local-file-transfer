import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import "./App.css";

function App() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [serverInfo, setServerInfo] = useState(null);
  const [tab, setTab] = useState("upload");
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchFiles();
    fetchQR();
    const socket = io();
    socket.on("file-uploaded", fetchFiles);
    socket.on("files-uploaded", fetchFiles);
    socket.on("file-deleted", fetchFiles);
    socket.on("connect_error", () => {});
    return () => socket.disconnect();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await axios.get("/files");
      setFiles(res.data);
    } catch {}
  };

  const fetchQR = async () => {
    try {
      const res = await axios.get("/qr");
      setServerInfo(res.data);
    } catch {}
  };

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await axios.post("/upload", formData, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded * 100) / e.total));
        }
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) uploadFile(dropped[0]);
  };

  const deleteFile = async (name) => {
    try {
      await axios.delete(`/files/${encodeURIComponent(name)}`);
    } catch {}
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  const formatDate = (d) => {
    const date = new Date(d);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="app">
      <header className="header">
        <h1>File Transfer</h1>
        {serverInfo && (
          <div className="server-url">
            <span className="url-label">Open on mobile:</span>
            <span className="url-value">{serverInfo.url}</span>
          </div>
        )}
      </header>

      <nav className="tabs">
        <button className={tab === "upload" ? "active" : ""} onClick={() => setTab("upload")}>Upload</button>
        <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>Files ({files.length})</button>
      </nav>

      <main className="main">
        {tab === "upload" && (
          <section className="upload-section">
            {serverInfo && (
              <div className="qr-container">
                <img src={serverInfo.qr} alt="QR Code" />
                <p className="qr-hint">Scan with mobile camera</p>
              </div>
            )}

            <div
              className={`drop-zone ${dragOver ? "drag-over" : ""} ${uploading ? "uploading" : ""}`}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              {uploading ? (
                <div className="progress-container">
                  <div className="progress-bar" style={{ width: `${progress}%` }} />
                  <span className="progress-text">{progress}%</span>
                </div>
              ) : (
                <>
                  <div className="drop-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p className="drop-text">Drag & drop a file here</p>
                  <p className="drop-subtext">or tap to browse</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={(e) => uploadFile(e.target.files[0])}
              />
            </div>
          </section>
        )}

        {tab === "files" && (
          <section className="files-section">
            {files.length === 0 ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <p>No files uploaded yet</p>
              </div>
            ) : (
              <ul className="file-list">
                {files.map((file) => (
                  <li key={file.name} className="file-item">
                    <a
                      href={`/downloads/${encodeURIComponent(file.name)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="file-link"
                    >
                      <div className="file-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      </div>
                      <div className="file-info">
                        <span className="file-name">{file.name}</span>
                        <span className="file-meta">{formatSize(file.size)} &middot; {formatDate(file.modified)}</span>
                      </div>
                    </a>
                    <button className="delete-btn" onClick={() => deleteFile(file.name)} title="Delete">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
