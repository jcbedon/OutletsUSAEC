import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Upload, CheckCircle, XCircle, Loader2, DollarSign } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function MobileRechargeUpload() {
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

      const response = await fetch(`${API}/api/wallet/mobile-upload/${token}`, {
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
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }}>
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-green-600 mb-2">¡Comprobante Subido!</h1>
            <p className="text-gray-600">
              El comprobante de pago se ha subido correctamente. Puedes cerrar esta ventana.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }}>
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-green-700">
              Subir Comprobante de Pago
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Toma una foto o selecciona el comprobante de tu transferencia
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
            <div className="mb-4 rounded-xl overflow-hidden border-2 border-dashed border-green-200">
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
              className="w-full h-14 text-lg rounded-xl border-green-300"
              disabled={status === "uploading"}
            >
              <Camera className="h-6 w-6 mr-2" />
              {preview ? "Cambiar Foto" : "Tomar Foto / Seleccionar"}
            </Button>

            {preview && (
              <Button
                onClick={handleUpload}
                className="w-full h-14 text-lg rounded-xl bg-green-600 hover:bg-green-700"
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
                    Subir Comprobante
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
