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
  const [expanded, setExpanded] = useState(false);
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

  // Compact view when not expanded
  if (!expanded) {
    return (
      <Card className="border border-orange-200 bg-orange-50/30 mt-3">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium text-gray-700">Factura de Tienda</span>
              {hasAmount && hasImage ? (
                <Badge className="bg-green-100 text-green-700 text-xs py-0">
                  <CheckCircle className="h-3 w-3 mr-1" /> ${storeAmount.toFixed(2)}
                </Badge>
              ) : hasAmount ? (
                <Badge className="bg-blue-100 text-blue-700 text-xs py-0">
                  ${storeAmount.toFixed(2)}
                </Badge>
              ) : null}
              {hasAmount && (
                <span className={`text-sm font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {profit >= 0 ? "+" : ""}{profit.toFixed(2)} ganancia
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(true)}
              className="text-orange-600 hover:text-orange-700 hover:bg-orange-100 h-7 px-2"
            >
              {hasAmount && hasImage ? "Ver" : "Ingresar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border border-orange-200 bg-orange-50/50 mt-3">
        <CardHeader className="py-2 px-4">
          <CardTitle className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2" style={{ color: "#1E3A5F" }}>
              <Receipt className="h-4 w-4" />
              Factura de la Tienda
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(false)}
              className="h-6 px-2 text-xs text-gray-500"
            >
              Minimizar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-4 space-y-3">
          {/* Amount Input - Compact */}
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <DollarSign className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                onWheel={(e) => e.target.blur()}
                className="pl-7 h-9 text-base font-bold"
                data-testid="store-invoice-amount"
              />
            </div>
            <Button
              onClick={handleSaveAmount}
              disabled={saving}
              size="sm"
              className="h-9 px-3"
              style={{ background: "#1E3A5F" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
            </Button>
          </div>

          {/* Profit - Compact */}
          {hasAmount && (
            <div className={`p-2 rounded-lg flex items-center justify-between ${profit >= 0 ? "bg-green-50" : "bg-red-50"}`}>
              <span className="text-xs text-gray-600">Ganancia:</span>
              <span className={`font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {profit >= 0 ? <TrendingUp className="h-4 w-4 inline mr-1" /> : <TrendingDown className="h-4 w-4 inline mr-1" />}
                ${profit.toFixed(2)}
              </span>
            </div>
          )}

          {/* Image Upload - Compact */}
          <div>
            {hasImage ? (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-xs text-green-700 flex-1">Foto subida</span>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => fileInputRef.current?.click()}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                  Subir foto
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 border-blue-300 text-blue-600"
                  onClick={handleGenerateQR}
                >
                  <QrCode className="h-3 w-3" />
                </Button>
              </div>
            )}
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
