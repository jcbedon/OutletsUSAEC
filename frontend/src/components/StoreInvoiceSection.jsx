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

export default function StoreInvoiceSection({ live, onUpdate, compact = false }) {
  const [invoiceAmount, setInvoiceAmount] = useState(live?.store_invoice_amount || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [showExpandedDialog, setShowExpandedDialog] = useState(false);
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

  // Compact inline version for header
  if (compact) {
    return (
      <>
        <div 
          className="flex items-center gap-3 bg-white/10 rounded-xl px-3 py-2 cursor-pointer hover:bg-white/20 transition-colors"
          onClick={() => setShowExpandedDialog(true)}
        >
          <Receipt className="h-4 w-4 text-white/70" />
          <div className="text-left">
            <p className="text-xs text-white/60">Factura Tienda</p>
            {hasAmount ? (
              <p className="text-sm font-bold text-white">${storeAmount.toFixed(2)}</p>
            ) : (
              <p className="text-xs text-white/50">Sin registrar</p>
            )}
          </div>
          {hasAmount && (
            <div className={`text-right ${profit >= 0 ? "text-green-300" : "text-red-300"}`}>
              <p className="text-xs opacity-70">Ganancia</p>
              <p className="text-sm font-bold">{profit >= 0 ? "+" : ""}${profit.toFixed(2)}</p>
            </div>
          )}
          {hasImage && <CheckCircle className="h-4 w-4 text-green-300" />}
        </div>

        {/* Expanded Dialog */}
        <Dialog open={showExpandedDialog} onOpenChange={setShowExpandedDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2" style={{ color: "#1E3A5F" }}>
                <Receipt className="h-5 w-5" />
                Factura de la Tienda
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Amount Input */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Monto de la Factura
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
                      onWheel={(e) => e.target.blur()}
                      className="pl-10 h-12 text-xl font-bold"
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

              {/* Profit */}
              {hasAmount && (
                <div className={`p-3 rounded-xl flex items-center justify-between ${profit >= 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                  <div>
                    <p className="text-sm text-gray-600">Ganancia</p>
                    <p className="text-xs text-gray-500">(Ventas ${totalSales.toFixed(2)} - Factura ${storeAmount.toFixed(2)})</p>
                  </div>
                  <span className={`text-2xl font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                    ${profit.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Image Upload */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Foto de la Factura
                </label>
                {hasImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-green-300">
                    <img 
                      src={`${process.env.REACT_APP_BACKEND_URL}${live.store_invoice_image.replace('/api', '')}`} 
                      alt="Factura" 
                      className="w-full h-32 object-cover"
                    />
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute bottom-2 right-2 bg-black/50 text-white hover:bg-black/70"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera className="h-4 w-4 mr-1" /> Cambiar
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    <Button
                      variant="outline"
                      className="flex-1 h-12"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Upload className="h-5 w-5 mr-2" /> Subir Foto</>}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12 px-4 border-blue-300 text-blue-600"
                      onClick={handleGenerateQR}
                    >
                      <QrCode className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* QR Dialog */}
        <Dialog open={showQRDialog} onOpenChange={handleCloseQR}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2" style={{ color: "#1E3A5F" }}>
                <QrCode className="h-5 w-5" />
                Escanea con tu Teléfono
              </DialogTitle>
            </DialogHeader>
            <div className="text-center py-4">
              {qrCodeUrl && <img src={qrCodeUrl} alt="QR Code" className="mx-auto rounded-xl shadow-lg" />}
              <p className="text-sm text-gray-600 mt-4">Escanea para subir la foto desde tu teléfono</p>
              {polling && (
                <div className="flex items-center justify-center gap-2 mt-4 text-blue-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Esperando imagen...</span>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Full version (not used anymore but kept for compatibility)
  return (
    <>
      <Card className="border border-orange-200 bg-orange-50/30 mt-3">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium text-gray-700">Factura de Tienda</span>
              {hasAmount && (
                <Badge className="bg-blue-100 text-blue-700 text-xs py-0">
                  ${storeAmount.toFixed(2)}
                </Badge>
              )}
              {hasAmount && (
                <span className={`text-sm font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {profit >= 0 ? "+" : ""}{profit.toFixed(2)} ganancia
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowExpandedDialog(true)}
              className="text-orange-600 hover:text-orange-700 hover:bg-orange-100 h-7 px-2"
            >
              {hasAmount && hasImage ? "Ver" : "Ingresar"}
            </Button>
          </div>
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
