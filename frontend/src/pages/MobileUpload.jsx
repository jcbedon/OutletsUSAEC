import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Upload, CheckCircle, XCircle, Loader2 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function MobileUpload() {
  const { token } = useParams();
  const [status, setStatus] = useState("ready"); // ready, uploading, success, error
  const [errorMessage, setErrorMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files[0];
    if (!file) {
      setErrorMessage("Selecciona una imagen primero");
      return;
    }

    setStatus("uploading");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API}/api/lives/mobile-upload/${token}`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Error al subir la imagen");
      }

      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error.message || "Error al subir la imagen");
    }
  };

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2a4f7f 100%)" }}>
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-green-600 mb-2">¡Imagen Subida!</h1>
            <p className="text-gray-600">
              La foto de la factura se ha subido correctamente. Puedes cerrar esta ventana y volver a tu computadora.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2a4f7f 100%)" }}>
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Camera className="h-8 w-8 text-blue-600" />
            </div>
            <h1 className="text-xl font-bold" style={{ color: "#1E3A5F" }}>
              Subir Factura de Tienda
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Toma una foto o selecciona la imagen de la factura
            </p>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Preview */}
          {preview && (
            <div className="mb-4 rounded-xl overflow-hidden border-2 border-dashed border-gray-200">
              <img src={preview} alt="Preview" className="w-full h-48 object-cover" />
            </div>
          )}

          {/* Error message */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <span className="text-sm text-red-700">{errorMessage}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="space-y-3">
            <Button
              onClick={handleCapture}
              variant="outline"
              className="w-full h-14 text-lg rounded-xl"
              disabled={status === "uploading"}
            >
              <Camera className="h-6 w-6 mr-2" />
              {preview ? "Cambiar Foto" : "Tomar Foto / Seleccionar"}
            </Button>

            {preview && (
              <Button
                onClick={handleUpload}
                className="w-full h-14 text-lg rounded-xl"
                style={{ background: "#2ECC71" }}
                disabled={status === "uploading"}
              >
                {status === "uploading" ? (
                  <>
                    <Loader2 className="h-6 w-6 mr-2 animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 mr-2" />
                    Subir Imagen
                  </>
                )}
              </Button>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center mt-4">
            El enlace expira en 10 minutos
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
