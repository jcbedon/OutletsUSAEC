import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Camera, CheckCircle, AlertTriangle, Loader2, FileImage } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

export default function MobileSessionUpload() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState([]);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API}/api/upload-sessions/${token}/public-info`)
      .then((res) => {
        if (!cancelled) {
          setInfo(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Sesión no disponible");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const successful = [];
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        await axios.post(`${API}/api/upload-sessions/${token}/files`, fd, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        successful.push(file.name);
      } catch (err) {
        toast.error(`Error subiendo ${file.name}: ${err.response?.data?.detail || err.message}`);
      }
    }
    setUploaded((prev) => [...prev, ...successful]);
    setUploading(false);
    if (successful.length > 0) toast.success(`${successful.length} archivo(s) subido(s)`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full rounded-2xl">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-800 mb-2">Sesión no disponible</h1>
            <p className="text-sm text-slate-500">{error}</p>
            <p className="text-xs text-slate-400 mt-4">Pide al admin que genere un nuevo código QR.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 flex flex-col">
      <div className="max-w-md w-full mx-auto flex-1">
        <div className="text-center mb-6 pt-4">
          {info?.logo_url ? (
            <img src={info.logo_url.startsWith("http") ? info.logo_url : `${API}${info.logo_url}`}
                 alt="logo" className="h-14 mx-auto mb-3" />
          ) : null}
          <h1 className="text-2xl font-extrabold text-slate-800">Subir adjuntos</h1>
          {info?.business_name && (
            <p className="text-xs text-slate-500 mt-1">{info.business_name}</p>
          )}
          <p className="text-xs text-slate-400 mt-2">
            Los archivos se agregarán al envío que tu administrador está creando.
          </p>
        </div>

        <Card className="rounded-2xl shadow-lg mb-4">
          <CardContent className="p-6 space-y-3">
            <Button
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="w-full h-14 rounded-xl text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="mobile-session-camera-btn"
            >
              <Camera className="h-5 w-5 mr-2" />
              Tomar foto
            </Button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            />

            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              variant="outline"
              className="w-full h-14 rounded-xl text-base font-semibold border-2"
              data-testid="mobile-session-gallery-btn"
            >
              <Upload className="h-5 w-5 mr-2" />
              Elegir de la galería
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            />

            {uploading && (
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500 pt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Subiendo...
              </div>
            )}
          </CardContent>
        </Card>

        {uploaded.length > 0 && (
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Subidos ({uploaded.length})
              </p>
              <ul className="space-y-2">
                {uploaded.map((name, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg p-2">
                    <FileImage className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="truncate">{name}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-400 mt-3 text-center">
                Puedes cerrar esta página cuando termines.
              </p>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-slate-400 text-center mt-6">
          Esta sesión expira a las {info?.expires_at ? new Date(info.expires_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : ""}.
        </p>
      </div>
    </div>
  );
}
