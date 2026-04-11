import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Receipt, 
  Camera, 
  QrCode, 
  Upload, 
  CheckCircle, 
  DollarSign,
  TrendingUp,
  TrendingDown,
  Loader2,
  Image,
  Smartphone
} from "lucide-react";
import { updateStoreInvoice, uploadStoreInvoiceImage, generateUploadQR, checkUploadStatus } from "@/lib/api";
import QRCode from "qrcode";

export default function StoreInvoiceSection({ live, onUpdate }) {
  const [invoiceAmount, setInvoiceAmount] = useState(live?.store_invoice_amount || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [uploadToken, setUploadToken] = useState("");
  const [polling, setPolling] = useState(false);
  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);

  const APP_URL = process.env.REACT_APP_BACKEND_URL?.replace('/api', '') || window.location.origin;

  useEffect(() => {
    if (live?.store_invoice_amount !== undefined && live?.store_invoice_amount !== null) {
      setInvoiceAmount(live.store_invoice_amount);
    }
  }, [live?.store_invoice_amount]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const handleSaveAmount = async () => {
    if (!invoiceAmount || isNaN(parseFloat(invoiceAmount))) {
      toast.error("Ingresa un monto válido");
      return;
    }

    try {
      setSaving(true);
      const res = await updateStoreInvoice(live.id, parseFloat(invoiceAmount));
      toast.success("Monto de factura guardado");
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      await uploadStoreInvoiceImage(live.id, formData);
      toast.success("Imagen de factura subida");
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al subir imagen");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateQR = async () => {
    try {
      const res = await generateUploadQR(live.id);
      const token = res.data.upload_token;
      setUploadToken(token);
      
      // Generate QR code
      const uploadUrl = `${APP_URL}/upload/${token}`;
      const qr = await QRCode.toDataURL(uploadUrl, {
        width: 300,
        margin: 2,
        color: { dark: "#1E3A5F", light: "#ffffff" }
      });
      setQrCodeUrl(qr);
      setShowQRDialog(true);
      
      // Start polling to check if image was uploaded
      setPolling(true);
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await checkUploadStatus(token);
          if (statusRes.data.used && statusRes.data.image_url) {
            clearInterval(pollingRef.current);
            setPolling(false);
            setShowQRDialog(false);
            toast.success("¡Imagen recibida desde el teléfono!");
            if (onUpdate) onUpdate();
          }
        } catch (err) {
          // Token might be expired
          clearInterval(pollingRef.current);
          setPolling(false);
        }
      }, 3000); // Poll every 3 seconds
      
    } catch (error) {
      toast.error("Error al generar código QR");
    }
  };

  const handleCloseQR = () => {
    setShowQRDialog(false);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    setPolling(false);
  };

  // Calculate profit
  const totalSales = live?.total_sales || 0;
  const storeAmount = parseFloat(invoiceAmount) || 0;
  const profit = totalSales - storeAmount;
  const hasImage = !!live?.store_invoice_image;
  const hasAmount = live?.store_invoice_amount !== null && live?.store_invoice_amount !== undefined;

  return (
    <>
      <Card className="border-2 border-orange-200 bg-orange-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg" style={{ color: "#1E3A5F" }}>
            <Receipt className="h-5 w-5" />
            Factura de la Tienda
            {hasAmount && hasImage ? (
              <Badge className="bg-green-100 text-green-700 ml-auto">
                <CheckCircle className="h-3 w-3 mr-1" /> Completo
              </Badge>
            ) : (
              <Badge className="bg-orange-100 text-orange-700 ml-auto">
                Pendiente
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Amount Input */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Monto Total de la Factura de Tienda *
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="pl-10 h-12 text-xl font-bold"
                  data-testid="store-invoice-amount"
                />
              </div>
              <Button
                onClick={handleSaveAmount}
                disabled={saving}
                className="h-12 px-6"
                style={{ background: "#1E3A5F" }}
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Guardar"}
              </Button>
            </div>
          </div>

          {/* Profit Calculation */}
          {hasAmount && (
            <div className={`p-4 rounded-xl ${profit >= 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Ganancia Calculada</p>
                  <p className="text-xs text-gray-500 mt-1">
                    (Ventas ${totalSales.toFixed(2)} - Factura ${storeAmount.toFixed(2)})
                  </p>
                </div>
                <div className={`flex items-center gap-2 ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {profit >= 0 ? (
                    <TrendingUp className="h-6 w-6" />
                  ) : (
                    <TrendingDown className="h-6 w-6" />
                  )}
                  <span className="text-3xl font-extrabold">${profit.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Image Upload Section */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Foto de la Factura * (obligatorio para finalizar)
            </label>
            
            {hasImage ? (
              <div className="relative rounded-xl overflow-hidden border-2 border-green-300 bg-green-50">
                <img 
                  src={`${process.env.REACT_APP_BACKEND_URL}${live.store_invoice_image}`} 
                  alt="Factura de tienda" 
                  className="w-full h-40 object-cover"
                />
                <div className="absolute top-2 right-2">
                  <Badge className="bg-green-500 text-white">
                    <CheckCircle className="h-3 w-3 mr-1" /> Subida
                  </Badge>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/20"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Camera className="h-4 w-4 mr-1" />
                    Cambiar imagen
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {/* Direct Upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2 border-2 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-gray-400" />
                      <span className="text-sm text-gray-600">Subir desde PC</span>
                    </>
                  )}
                </Button>

                {/* QR Code for Mobile */}
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2 border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100"
                  onClick={handleGenerateQR}
                >
                  <Smartphone className="h-8 w-8 text-blue-500" />
                  <span className="text-sm text-blue-600">Escanear con teléfono</span>
                </Button>
              </div>
            )}
          </div>

          {/* Optional note */}
          {(!hasAmount || !hasImage) && (
            <p className="text-xs text-gray-400 text-center">
              Opcional: Ingresa el monto y foto de la factura para calcular tu ganancia
            </p>
          )}
        </CardContent>
      </Card>

      {/* QR Code Dialog */}
      <Dialog open={showQRDialog} onOpenChange={handleCloseQR}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: "#1E3A5F" }}>
              <QrCode className="h-5 w-5" />
              Escanea con tu Teléfono
            </DialogTitle>
          </DialogHeader>
          
          <div className="text-center py-4">
            {qrCodeUrl && (
              <img src={qrCodeUrl} alt="QR Code" className="mx-auto rounded-xl shadow-lg" />
            )}
            
            <p className="text-sm text-gray-600 mt-4">
              Escanea este código QR con la cámara de tu teléfono para abrir la página de carga
            </p>
            
            {polling && (
              <div className="flex items-center justify-center gap-2 mt-4 text-blue-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Esperando imagen...</span>
              </div>
            )}
            
            <p className="text-xs text-gray-400 mt-4">
              El código expira en 10 minutos
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
