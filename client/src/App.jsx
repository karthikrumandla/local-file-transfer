import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { saveEntry, loadEntries, removeEntry, clearEntries } from "./db";
import "./App.css";

function App() {
  const [files, setFiles] = useState([]);
  const [fileQueue, setFileQueue] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [serverInfo, setServerInfo] = useState(null);
  const [tab, setTab] = useState("upload");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);
  const abortControllers = useRef({});

  useEffect(() => {
    fetchFiles();
    fetchQR();
    loadEntries().then((entries) => {
      if (entries.length) {
        setFileQueue(
          entries.map((e) => ({
            ...e,
            status: e.status === "uploading" ? "pending" : e.status,
            progress: e.status === "completed" ? 100 : e.progress,
          }))
        );
      }
    });
    const socket = io();
    socketRef.current = socket;
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

  const addFilesToQueue = (selectedFiles) => {
    const newFiles = Array.from(selectedFiles).map((file) => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: "pending",
    }));
    setFileQueue((prev) => [...prev, ...newFiles]);
    newFiles.forEach((f) => saveEntry(f).catch(() => {}));
  };

  const uploadSingle = async (item) => {
    const controller = new AbortController();
    abortControllers.current[item.id] = controller;

    setFileQueue((prev) =>
      prev.map((f) => (f.id === item.id ? { ...f, status: "uploading", progress: 0 } : f))
    );

    const formData = new FormData();
    formData.append("file", item.file);

    try {
      await axios.post("/upload", formData, {
        signal: controller.signal,
        onUploadProgress: (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded * 100) / e.total);
            setFileQueue((prev) =>
              prev.map((f) => (f.id === item.id ? { ...f, progress: pct } : f))
            );
          }
        },
      });
      setFileQueue((prev) => {
        const updated = prev.map((f) =>
          f.id === item.id ? { ...f, status: "completed", progress: 100 } : f
        );
        const done = updated.find((f) => f.id === item.id);
        if (done) saveEntry(done).catch(() => {});
        return updated;
      });
    } catch (err) {
      if (axios.isCancel(err)) {
        setFileQueue((prev) => {
          const updated = prev.map((f) =>
            f.id === item.id ? { ...f, status: "pending", progress: 0 } : f
          );
          const paused = updated.find((f) => f.id === item.id);
          if (paused) saveEntry(paused).catch(() => {});
          return updated;
        });
      } else {
        setFileQueue((prev) => {
          const updated = prev.map((f) =>
            f.id === item.id ? { ...f, status: "error" } : f
          );
          const failed = updated.find((f) => f.id === item.id);
          if (failed) saveEntry(failed).catch(() => {});
          return updated;
        });
      }
    } finally {
      delete abortControllers.current[item.id];
    }
  };

  const uploadAll = async () => {
    setUploading(true);
    const toUpload = fileQueue.filter((f) => f.status !== "completed");
    for (const item of toUpload) {
      await uploadSingle(item);
    }
    setUploading(false);
  };

  const pauseItem = (id) => {
    if (abortControllers.current[id]) {
      abortControllers.current[id].abort();
    }
  };

  const pauseAll = () => {
    Object.values(abortControllers.current).forEach((c) => c.abort());
    setUploading(false);
  };

  const retryItem = async (id) => {
    const item = fileQueue.find((f) => f.id === id);
    if (item) {
      setUploading(true);
      await uploadSingle(item);
      setUploading(false);
    }
  };

  const retryAll = () => {
    setFileQueue((prev) =>
      prev.map((f) => (f.status === "error" ? { ...f, status: "pending", progress: 0 } : f))
    );
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFilesToQueue(e.dataTransfer.files);
  };

  const handleFileSelect = (e) => {
    addFilesToQueue(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFromQueue = (id) => {
    setFileQueue((prev) => prev.filter((item) => item.id !== id));
    removeEntry(id).catch(() => {});
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

  const getFileIcon = (name) => {
    const ext = name.split(".").pop().toLowerCase();
    const map = {
      pdf: "pdf", zip: "archive", rar: "archive", "7z": "archive",
      gz: "archive", doc: "document", docx: "document",
      xls: "spreadsheet", xlsx: "spreadsheet",
      jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image",
      mp4: "video", mov: "video", avi: "video",
      mp3: "audio", wav: "audio", flac: "audio",
    };
    return map[ext] || "generic";
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>File Transfer</h1>
          <p className="header-sub">Share files across devices</p>
        </div>
        {serverInfo && (
          <div className="server-info">
            <span className="url-label">Open on mobile</span>
            <span className="url-value">{serverInfo.url}</span>
          </div>
        )}
      </header>

      <nav className="tabs">
        <button className={tab === "upload" ? "active" : ""} onClick={() => setTab("upload")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload
        </button>
        <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          Files ({files.length})
        </button>
      </nav>

      <main className="main">
        {tab === "upload" && (
          <section className="upload-section">
            {serverInfo && (
              <div className="qr-container">
                <div className="qr-card">
                  <img src={serverInfo.qr} alt="QR Code" />
                  <p className="qr-hint">Scan with mobile camera</p>
                </div>
              </div>
            )}

            <div
              className={`drop-zone ${dragOver ? "drag-over" : ""}`}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="drop-icon">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="drop-text">Drop files anywhere</p>
              <p className="drop-subtext">or tap to browse</p>
            </div>

            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} />

            {fileQueue.length > 0 && (
              <div className="queue-section">
                <div className="queue-header">
                  <h3>
                    {fileQueue.filter((f) => f.status === "completed").length} of {fileQueue.length}
                    {fileQueue.some((f) => f.status === "error") && (
                      <span className="failed-count"> &middot; {fileQueue.filter((f) => f.status === "error").length} failed</span>
                    )}
                  </h3>
                  <div className="queue-actions">
                    {uploading && (
                      <button className="btn-pause" onClick={pauseAll}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                        Pause
                      </button>
                    )}
                    {fileQueue.some((f) => f.status === "pending") && !uploading && (
                      <button className="btn-primary" onClick={uploadAll}>Upload All</button>
                    )}
                    {fileQueue.some((f) => f.status === "error") && !uploading && (
                      <button className="btn-danger" onClick={retryAll}>Retry All</button>
                    )}
                    {!uploading && (
                      <button className="btn-ghost" onClick={() => { setFileQueue([]); clearEntries().catch(() => {}); }}>Clear</button>
                    )}
                  </div>
                </div>
                <div className="queue-list">
                  {fileQueue.map((item) => (
                    <div key={item.id} className={`queue-item ${item.status}`}>
                      <div className={`file-type-icon ${getFileIcon(item.name)}`} />
                      <div className="queue-item-body">
                        <div className="queue-item-top">
                          <span className="queue-item-name">{item.name}</span>
                          <span className="queue-item-size">{formatSize(item.size)}</span>
                        </div>
                        <div className="queue-item-bottom">
                          <div className="progress-track">
                            <div
                              className={`progress-fill ${item.status}`}
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <span className={`status-badge ${item.status}`}>
                            {item.status === "uploading"
                              ? `${item.progress}%`
                              : item.status === "completed"
                              ? "Done"
                              : item.status === "error"
                              ? "Failed"
                              : "Pending"}
                          </span>
                        </div>
                      </div>
                      {item.status === "uploading" && (
                        <button className="queue-pause" onClick={() => pauseItem(item.id)} title="Pause">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                        </button>
                      )}
                      {item.status === "pending" && (
                        <button className="queue-remove" onClick={() => removeFromQueue(item.id)} title="Remove">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                      {item.status === "error" && (
                        <button className="queue-retry" onClick={() => retryItem(item.id)} title="Retry">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "files" && (
          <section className="files-section">
            {files.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <p className="empty-title">No files yet</p>
                <p className="empty-hint">Upload from the Upload tab or scan the QR code</p>
              </div>
            ) : (
              <div className="file-list">
                {files.map((file) => (
                  <div key={file.name} className="file-card">
                    <div className={`file-type-icon ${getFileIcon(file.name)}`} />
                    <div className="file-card-body">
                      <a
                        href={`/downloads/${encodeURIComponent(file.name)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="file-card-name"
                      >
                        {file.name}
                      </a>
                      <span className="file-card-meta">{formatSize(file.size)}</span>
                    </div>
                    <button className="file-card-delete" onClick={() => deleteFile(file.name)} title="Delete">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
