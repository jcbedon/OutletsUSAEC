import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { getPendingPurchases, createInvoice, getInvoiceDetail, approveInvoice, getClientInvoices, removeItemFromInvoice, reopenInvoice } from "@/lib/api";
import { toast } from "sonner";
import { FileText, Download, CheckCircle, Clock, AlertCircle, History, Trash2, Edit, RefreshCw, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Helper function to load image as base64
const loadImageAsBase64 = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        const dataURL = canvas.toDataURL("image/png");
        resolve(dataURL);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
};

export default function InvoiceDialog({ open, onOpenChange, client, tenantInfo }) {
  const [loading, setLoading] = useState(false);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [viewMode, setViewMode] = useState("create"); // create, view, history
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const invoiceRef = useRef(null);

  useEffect(() => {
    if (open && client) {
      loadPendingPurchases();
      loadInvoices();
    }
  }, [open, client]);

  const loadPendingPurchases = async () => {
    try {
      setLoading(true);
      const res = await getPendingPurchases(client.customer_id);
      setPendingPurchases(res.data);
      setSelectedPurchases(res.data.map(p => p.id));
    } catch (error) {
      toast.error("Error al cargar compras pendientes");
    } finally {
      setLoading(false);
    }
  };

  const loadInvoices = async () => {
    try {
      const res = await getClientInvoices(client.customer_id);
      setInvoices(res.data);
    } catch (error) {
      console.error("Error loading invoices:", error);
    }
  };

  const handleCreateInvoice = async () => {
    if (selectedPurchases.length === 0) {
      toast.error("Selecciona al menos una compra");
      return;
    }
    
    try {
      setLoading(true);
      const res = await createInvoice({
        customer_id: client.customer_id,
        purchase_ids: selectedPurchases
      });
      toast.success(`Factura ${res.data.invoice_number} creada`);
      
      // Load the created invoice
      const invoiceRes = await getInvoiceDetail(res.data.invoice_id);
      setCurrentInvoice(invoiceRes.data);
      setViewMode("view");
      loadPendingPurchases();
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear factura");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveInvoice = async () => {
    if (!currentInvoice) return;
    
    try {
      setLoading(true);
      await approveInvoice(currentInvoice.id);
      toast.success("Factura aprobada - Compras movidas al historial");
      
      // Reload invoice
      const invoiceRes = await getInvoiceDetail(currentInvoice.id);
      setCurrentInvoice(invoiceRes.data);
      loadPendingPurchases();
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al aprobar factura");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (purchaseId) => {
    if (!currentInvoice) return;
    
    if (currentInvoice.purchases?.length <= 1) {
      toast.error("No puedes quitar el último artículo");
      return;
    }
    
    try {
      setLoading(true);
      await removeItemFromInvoice(currentInvoice.id, purchaseId);
      toast.success("Artículo removido de la factura");
      
      // Reload invoice
      const invoiceRes = await getInvoiceDetail(currentInvoice.id);
      setCurrentInvoice(invoiceRes.data);
      loadPendingPurchases();
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al remover artículo");
    } finally {
      setLoading(false);
    }
  };

  const handleReopenInvoice = async () => {
    if (!currentInvoice) return;
    
    try {
      setLoading(true);
      await reopenInvoice(currentInvoice.id);
      toast.success("Factura reabierta para modificaciones");
      
      // Reload invoice
      const invoiceRes = await getInvoiceDetail(currentInvoice.id);
      setCurrentInvoice(invoiceRes.data);
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al reabrir factura");
    } finally {
      setLoading(false);
    }
  };

  const handleViewInvoice = async (invoice) => {
    try {
      setLoading(true);
      const res = await getInvoiceDetail(invoice.id);
      setCurrentInvoice(res.data);
      setViewMode("view");
    } catch (error) {
      toast.error("Error al cargar factura");
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!currentInvoice) return;
    
    setGeneratingPDF(true);
    
    try {
      const doc = new jsPDF();
      const tenant = currentInvoice.tenant || tenantInfo;
      const inv = currentInvoice;
      const cli = currentInvoice.client || client;
      const shipment = inv.shipment;
      
      // Modern color palette
      const primary = [30, 58, 95];      // Deep blue #1E3A5F
      const accent = [46, 204, 113];     // Green #2ECC71
      const purple = [142, 68, 173];     // Purple #8E44AD
      const darkGray = [52, 73, 94];     // #34495E
      const lightGray = [236, 240, 241]; // #ECF0F1
      
      // ========== HEADER WITH GRADIENT EFFECT ==========
      // Main header bar
      doc.setFillColor(...primary);
      doc.rect(0, 0, 210, 55, "F");
      
      // Accent stripe
      doc.setFillColor(...accent);
      doc.rect(0, 55, 210, 3, "F");
      
      // Try to load and add logo - ensure absolute URL
      let logoUrl = tenant?.logo_url || tenantInfo?.logo_url;
      let logoAdded = false;
      
      if (logoUrl) {
        // Convert relative URL to absolute URL
        if (logoUrl.startsWith('/')) {
          const baseUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
          logoUrl = baseUrl + logoUrl;
        }
        
        try {
          const logoBase64 = await loadImageAsBase64(logoUrl);
          doc.addImage(logoBase64, 'PNG', 12, 10, 35, 35);
          logoAdded = true;
        } catch (e) {
          console.log("Could not load logo:", e);
        }
      }
      
      // If no logo, show initials in a circle
      if (!logoAdded) {
        doc.setFillColor(255, 255, 255);
        doc.circle(30, 27, 15, "F");
        doc.setFillColor(...accent);
        doc.circle(30, 27, 13, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(tenant?.business_name?.substring(0, 2)?.toUpperCase() || "PS", 30, 31, { align: "center" });
      }
      
      // Company name and info
      const textStartX = logoAdded ? 52 : 52;
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text(tenant?.business_name || "Personal Shopper", textStartX, 20);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(200, 220, 255);
      doc.text(tenant?.email || "", textStartX, 28);
      doc.text(tenant?.owner_name || "", textStartX, 35);
      
      // Invoice number box (right side)
      doc.setFillColor(255, 255, 255, 0.2);
      doc.roundedRect(140, 8, 60, 40, 4, 4, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("FACTURA", 170, 18, { align: "center" });
      
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(inv.invoice_number, 170, 30, { align: "center" });
      
      // Status badge
      if (inv.status === "approved") {
        doc.setFillColor(...accent);
      } else {
        doc.setFillColor(241, 196, 15);
      }
      doc.roundedRect(150, 35, 40, 10, 3, 3, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(inv.status === "approved" ? "PAGADA" : "PENDIENTE", 170, 42, { align: "center" });
      
      // ========== CLIENT & INVOICE INFO ==========
      let currentY = 65;
      
      // Client card
      doc.setFillColor(...lightGray);
      doc.roundedRect(12, currentY, 90, 38, 4, 4, "F");
      
      doc.setFillColor(...primary);
      doc.roundedRect(12, currentY, 90, 8, 4, 0, "F");
      doc.rect(12, currentY + 4, 90, 4, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("CLIENTE", 57, currentY + 6, { align: "center" });
      
      doc.setTextColor(...darkGray);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(cli?.name || "", 17, currentY + 18);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`ID: ${cli?.customer_id || ""}`, 17, currentY + 26);
      doc.text(`WhatsApp: ${cli?.whatsapp || ""}`, 17, currentY + 33);
      
      // Invoice details card
      doc.setFillColor(...lightGray);
      doc.roundedRect(108, currentY, 90, 38, 4, 4, "F");
      
      doc.setFillColor(...primary);
      doc.roundedRect(108, currentY, 90, 8, 4, 0, "F");
      doc.rect(108, currentY + 4, 90, 4, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("DETALLES", 153, currentY + 6, { align: "center" });
      
      doc.setTextColor(...darkGray);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Fecha: ${new Date(inv.created_at).toLocaleDateString("es-ES")}`, 113, currentY + 18);
      doc.text(`Items: ${inv.purchase_ids?.length || 0} productos`, 113, currentY + 26);
      if (inv.approved_at) {
        doc.setTextColor(...accent);
        doc.text(`Aprobada: ${new Date(inv.approved_at).toLocaleDateString("es-ES")}`, 113, currentY + 33);
      }
      
      currentY += 45;
      
      // ========== SHIPMENT INFO (if available) ==========
      if (shipment && (shipment.tracking_number || shipment.shipping_cost)) {
        doc.setFillColor(...purple);
        doc.roundedRect(12, currentY, 186, 22, 4, 4, "F");
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("INFORMACIÓN DE ENVÍO", 20, currentY + 7);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const shipY = currentY + 16;
        doc.text(`Costo: $${(shipment.shipping_cost || 0).toFixed(2)}`, 20, shipY);
        doc.text(`Peso: ${shipment.weight_pounds || 0} lbs`, 80, shipY);
        doc.text(`Tracking: ${shipment.tracking_number || "N/A"}`, 130, shipY);
        
        currentY += 28;
      }
      
      // ========== PRODUCTS TABLE ==========
      const tableData = (inv.purchases || []).map((p, idx) => [
        idx + 1,
        p.item_name,
        p.store,
        `$${p.price.toFixed(2)}`,
        `$${(p.tax || 0).toFixed(2)}`,
        `$${(p.commission || 0).toFixed(2)}`,
        `$${p.total.toFixed(2)}`
      ]);
      
      autoTable(doc, {
        startY: currentY,
        head: [["#", "Producto", "Tienda", "Precio", "Tax", "Com.", "Total"]],
        body: tableData,
        theme: "striped",
        headStyles: {
          fillColor: primary,
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 9,
          halign: "center"
        },
        bodyStyles: {
          fontSize: 8,
          textColor: darkGray
        },
        alternateRowStyles: {
          fillColor: [248, 249, 250]
        },
        columnStyles: {
          0: { cellWidth: 12, halign: "center" },
          1: { cellWidth: 55 },
          2: { cellWidth: 30 },
          3: { cellWidth: 22, halign: "right" },
          4: { cellWidth: 20, halign: "right" },
          5: { cellWidth: 20, halign: "right" },
          6: { cellWidth: 25, halign: "right", fontStyle: "bold" }
        },
        margin: { left: 12, right: 12 },
        styles: {
          cellPadding: 3,
          lineColor: [220, 220, 220],
          lineWidth: 0.1
        }
      });
      
      // ========== TOTALS SECTION ==========
      const finalY = doc.lastAutoTable.finalY + 8;
      const hasShipping = shipment && shipment.shipping_cost > 0;
      
      // Pending warning (left side)
      if (inv.status !== "approved") {
        doc.setFillColor(255, 235, 200);
        doc.roundedRect(12, finalY, 85, 28, 4, 4, "F");
        doc.setFillColor(241, 196, 15);
        doc.roundedRect(12, finalY, 85, 6, 4, 0, "F");
        doc.rect(12, finalY + 3, 85, 3, "F");
        
        doc.setTextColor(180, 120, 0);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("PENDIENTE DE PAGO", 54, finalY + 16, { align: "center" });
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text("Aprobar para confirmar", 54, finalY + 23, { align: "center" });
      }
      
      // Totals box (right side)
      const totalsX = 110;
      const totalsWidth = 88;
      const totalsHeight = hasShipping ? 52 : 44;
      
      doc.setFillColor(...lightGray);
      doc.roundedRect(totalsX, finalY, totalsWidth, totalsHeight, 4, 4, "F");
      
      doc.setTextColor(...darkGray);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      let totY = finalY + 10;
      doc.text("Subtotal:", totalsX + 5, totY);
      doc.text(`$${inv.subtotal.toFixed(2)}`, totalsX + totalsWidth - 5, totY, { align: "right" });
      
      totY += 8;
      doc.text("Impuestos:", totalsX + 5, totY);
      doc.text(`$${inv.total_tax.toFixed(2)}`, totalsX + totalsWidth - 5, totY, { align: "right" });
      
      totY += 8;
      doc.text("Comisiones:", totalsX + 5, totY);
      doc.text(`$${inv.total_commission.toFixed(2)}`, totalsX + totalsWidth - 5, totY, { align: "right" });
      
      if (hasShipping) {
        totY += 8;
        doc.setTextColor(...purple);
        doc.text("Envío:", totalsX + 5, totY);
        doc.text(`$${shipment.shipping_cost.toFixed(2)}`, totalsX + totalsWidth - 5, totY, { align: "right" });
      }
      
      // Total line
      totY += 4;
      doc.setDrawColor(...primary);
      doc.setLineWidth(0.5);
      doc.line(totalsX + 5, totY, totalsX + totalsWidth - 5, totY);
      
      // Grand total
      const grandTotal = inv.total + (hasShipping ? shipment.shipping_cost : 0);
      totY += 10;
      doc.setFillColor(...primary);
      doc.roundedRect(totalsX, totY - 6, totalsWidth, 14, 0, 4, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL:", totalsX + 8, totY + 3);
      doc.setFontSize(14);
      doc.text(`$${grandTotal.toFixed(2)}`, totalsX + totalsWidth - 8, totY + 3, { align: "right" });
      
      // ========== FOOTER ==========
      // Tracking URL
      if (shipment?.tracking_number && tenant?.tracking_url_template) {
        const trackingUrl = tenant.tracking_url_template.replace('{tracking}', shipment.tracking_number);
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(`Seguimiento: ${trackingUrl}`, 12, 275);
      }
      
      // Footer bar
      doc.setFillColor(...primary);
      doc.rect(0, 282, 210, 15, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Gracias por su preferencia", 105, 289, { align: "center" });
      doc.setFontSize(7);
      doc.text(`Generado: ${new Date().toLocaleString("es-ES")}`, 105, 294, { align: "center" });
      
      // Save PDF
      doc.save(`Factura_${inv.invoice_number}_${cli?.customer_id || ""}.pdf`);
      toast.success("PDF descargado exitosamente");
      
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Error al generar PDF");
    } finally {
      setGeneratingPDF(false);
    }
  };

  const togglePurchase = (purchaseId) => {
    setSelectedPurchases(prev => 
      prev.includes(purchaseId) 
        ? prev.filter(id => id !== purchaseId)
        : [...prev, purchaseId]
    );
  };

  const selectAll = () => {
    setSelectedPurchases(pendingPurchases.map(p => p.id));
  };

  const deselectAll = () => {
    setSelectedPurchases([]);
  };

  // Calculate totals for selected purchases
  const selectedTotals = pendingPurchases
    .filter(p => selectedPurchases.includes(p.id))
    .reduce((acc, p) => ({
      subtotal: acc.subtotal + p.price,
      tax: acc.tax + (p.tax || 0),
      commission: acc.commission + (p.commission || 0),
      total: acc.total + p.total
    }), { subtotal: 0, tax: 0, commission: 0, total: 0 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(30,58,95,0.1)' }}>
              <FileText className="h-5 w-5" style={{ color: '#1E3A5F' }} />
            </div>
            Facturación - {client?.name}
            <Badge className="ml-2 bg-blue-100 text-blue-800">#{client?.customer_id}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Tab buttons */}
        <div className="flex gap-2 border-b pb-3">
          <Button
            variant={viewMode === "create" ? "default" : "outline"}
            size="sm"
            onClick={() => { setViewMode("create"); setCurrentInvoice(null); }}
            className="rounded-lg"
            style={viewMode === "create" ? { background: '#1E3A5F' } : {}}
          >
            <FileText className="h-4 w-4 mr-2" />
            Nueva Factura
            {pendingPurchases.length > 0 && (
              <Badge className="ml-2 bg-red-500 text-white">{pendingPurchases.length}</Badge>
            )}
          </Button>
          <Button
            variant={viewMode === "history" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("history")}
            className="rounded-lg"
            style={viewMode === "history" ? { background: '#1E3A5F' } : {}}
          >
            <History className="h-4 w-4 mr-2" />
            Historial ({invoices.length})
          </Button>
        </div>

        <ScrollArea className="h-[60vh] pr-4">
          {/* CREATE MODE */}
          {viewMode === "create" && (
            <div className="space-y-4">
              {pendingPurchases.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-16 w-16 text-green-300 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-600">No hay compras pendientes</p>
                  <p className="text-sm text-gray-400 mt-2">Todas las compras han sido facturadas</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">{selectedPurchases.length} de {pendingPurchases.length} compras seleccionadas</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={selectAll} className="rounded-lg text-xs">
                        Seleccionar todo
                      </Button>
                      <Button variant="outline" size="sm" onClick={deselectAll} className="rounded-lg text-xs">
                        Deseleccionar
                      </Button>
                    </div>
                  </div>

                  {/* Purchases list */}
                  <div className="space-y-2">
                    {pendingPurchases.map((purchase) => (
                      <div
                        key={purchase.id}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          selectedPurchases.includes(purchase.id)
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                        onClick={() => togglePurchase(purchase.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedPurchases.includes(purchase.id)}
                            onCheckedChange={() => togglePurchase(purchase.id)}
                            className="data-[state=checked]:bg-blue-600"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-gray-800">{purchase.item_name}</p>
                              <p className="font-bold text-lg" style={{ color: '#1E3A5F' }}>${purchase.total.toFixed(2)}</p>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                              <span>{purchase.store}</span>
                              <span>Precio: ${purchase.price.toFixed(2)}</span>
                              {purchase.tax > 0 && <span>Tax: ${purchase.tax.toFixed(2)}</span>}
                              {purchase.commission > 0 && <span>Com: ${purchase.commission.toFixed(2)}</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(purchase.created_at).toLocaleDateString("es-ES")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals and Create button */}
                  {selectedPurchases.length > 0 && (
                    <div className="sticky bottom-0 bg-white pt-4 border-t">
                      <div className="p-4 rounded-xl" style={{ background: 'rgba(30,58,95,0.05)' }}>
                        <div className="grid grid-cols-4 gap-4 mb-4">
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Subtotal</p>
                            <p className="font-bold text-lg">${selectedTotals.subtotal.toFixed(2)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Impuestos</p>
                            <p className="font-bold text-lg">${selectedTotals.tax.toFixed(2)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Comisiones</p>
                            <p className="font-bold text-lg">${selectedTotals.commission.toFixed(2)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Total</p>
                            <p className="font-extrabold text-2xl" style={{ color: '#1E3A5F' }}>${selectedTotals.total.toFixed(2)}</p>
                          </div>
                        </div>
                        <Button
                          onClick={handleCreateInvoice}
                          disabled={loading}
                          className="w-full h-12 text-lg font-bold rounded-xl"
                          style={{ background: '#2ECC71' }}
                        >
                          {loading ? "Creando..." : `Crear Factura (${selectedPurchases.length} items)`}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* VIEW MODE - Invoice detail */}
          {viewMode === "view" && currentInvoice && (
            <div className="space-y-4" ref={invoiceRef}>
              {/* Invoice Header */}
              <div className="p-6 rounded-2xl text-white" style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2c5282 100%)' }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#2ECC71' }}>
                      <span className="text-2xl font-bold text-white">
                        {currentInvoice.tenant?.business_name?.substring(0, 2)?.toUpperCase() || "PS"}
                      </span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">{currentInvoice.tenant?.business_name || "Personal Shopper"}</h2>
                      <p className="text-blue-200 text-sm">{currentInvoice.tenant?.email}</p>
                      <p className="text-blue-200 text-sm">{currentInvoice.tenant?.owner_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold">{currentInvoice.invoice_number}</p>
                    <Badge className={currentInvoice.status === "approved" ? "bg-green-500 mt-2" : "bg-yellow-500 mt-2"}>
                      {currentInvoice.status === "approved" ? "PAGADA" : "PENDIENTE"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Client Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 mb-2">DATOS DEL CLIENTE</p>
                  <p className="font-bold text-lg" style={{ color: '#1E3A5F' }}>{currentInvoice.client?.name}</p>
                  <p className="text-sm text-gray-600">ID: {currentInvoice.client?.customer_id}</p>
                  <p className="text-sm text-gray-600">WhatsApp: {currentInvoice.client?.whatsapp}</p>
                  <p className="text-sm text-gray-600">País: {currentInvoice.client?.country}</p>
                </div>
                <div className="p-4 rounded-xl bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 mb-2">DETALLES DE FACTURA</p>
                  <p className="text-sm text-gray-600">Fecha: {new Date(currentInvoice.created_at).toLocaleDateString("es-ES")}</p>
                  <p className="text-sm text-gray-600">Items: {currentInvoice.purchases?.length || 0}</p>
                  {currentInvoice.approved_at && (
                    <p className="text-sm text-green-600 font-medium">
                      Aprobada: {new Date(currentInvoice.approved_at).toLocaleDateString("es-ES")}
                    </p>
                  )}
                </div>
              </div>

              {/* Shipment Info */}
              {currentInvoice.shipment && (
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
                  <p className="text-xs font-semibold text-purple-800 mb-2 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs">📦</span>
                    INFORMACIÓN DE ENVÍO
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-purple-600">Costo de Envío</p>
                      <p className="font-bold text-lg text-purple-800">${(currentInvoice.shipment.shipping_cost || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-purple-600">Peso</p>
                      <p className="font-bold text-lg text-purple-800">{currentInvoice.shipment.weight_pounds || 0} lbs</p>
                    </div>
                    <div>
                      <p className="text-xs text-purple-600">Tracking</p>
                      <p className="font-bold text-lg text-purple-800">{currentInvoice.shipment.tracking_number || "N/A"}</p>
                    </div>
                  </div>
                  {currentInvoice.shipment.tracking_number && currentInvoice.tenant?.tracking_url_template && (
                    <a
                      href={currentInvoice.tenant.tracking_url_template.replace('{tracking}', currentInvoice.shipment.tracking_number)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                    >
                      🔗 Verificar Tracking
                    </a>
                  )}
                </div>
              )}

              {/* Purchases table */}
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: '#1E3A5F' }}>
                      <th className="text-left p-3 text-white text-sm font-semibold">#</th>
                      <th className="text-left p-3 text-white text-sm font-semibold">Producto</th>
                      <th className="text-left p-3 text-white text-sm font-semibold">Tienda</th>
                      <th className="text-right p-3 text-white text-sm font-semibold">Precio</th>
                      <th className="text-right p-3 text-white text-sm font-semibold">Tax</th>
                      <th className="text-right p-3 text-white text-sm font-semibold">Comisión</th>
                      <th className="text-right p-3 text-white text-sm font-semibold">Total</th>
                      <th className="text-center p-3 text-white text-sm font-semibold w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentInvoice.purchases?.map((p, idx) => (
                      <tr key={p.id} className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} group hover:bg-red-50 transition-colors`}>
                        <td className="p-3 text-sm text-gray-600">{idx + 1}</td>
                        <td className="p-3 text-sm font-medium">{p.item_name}</td>
                        <td className="p-3 text-sm text-gray-600">{p.store}</td>
                        <td className="p-3 text-sm text-right">${p.price.toFixed(2)}</td>
                        <td className="p-3 text-sm text-right">${(p.tax || 0).toFixed(2)}</td>
                        <td className="p-3 text-sm text-right">${(p.commission || 0).toFixed(2)}</td>
                        <td className="p-3 text-sm text-right font-bold">${p.total.toFixed(2)}</td>
                        <td className="p-3 text-center">
                          {currentInvoice.purchases.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 transition-all"
                              onClick={() => handleRemoveItem(p.id)}
                              disabled={loading}
                              title="Quitar de la factura"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-72 p-4 rounded-xl bg-gray-50 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">${currentInvoice.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Impuestos:</span>
                    <span className="font-medium">${currentInvoice.total_tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Comisiones:</span>
                    <span className="font-medium">${currentInvoice.total_commission.toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between">
                    <span className="font-bold text-lg" style={{ color: '#1E3A5F' }}>TOTAL:</span>
                    <span className="font-extrabold text-2xl" style={{ color: '#1E3A5F' }}>${currentInvoice.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Pending alert */}
              {currentInvoice.status !== "approved" && (
                <div className="p-4 rounded-xl bg-yellow-50 border-2 border-yellow-200 flex items-center gap-3">
                  <AlertCircle className="h-6 w-6 text-yellow-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-yellow-800">Factura Pendiente de Pago</p>
                    <p className="text-sm text-yellow-700">Puedes quitar artículos pasando el mouse sobre ellos. Aprueba cuando esté lista.</p>
                  </div>
                </div>
              )}

              {/* Approved - can reopen */}
              {currentInvoice.status === "approved" && (
                <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-200 flex items-center gap-3">
                  <Edit className="h-6 w-6 text-blue-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-blue-800">Factura Pagada</p>
                    <p className="text-sm text-blue-700">Puedes reabrir la factura si necesitas modificarla o quitar artículos</p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={generatePDF}
                  variant="outline"
                  disabled={generatingPDF}
                  className="flex-1 h-12 rounded-xl"
                >
                  {generatingPDF ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5 mr-2" />
                      Descargar PDF
                    </>
                  )}
                </Button>
                {currentInvoice.status === "approved" ? (
                  <Button
                    onClick={handleReopenInvoice}
                    disabled={loading}
                    variant="outline"
                    className="flex-1 h-12 rounded-xl border-orange-300 text-orange-600 hover:bg-orange-50"
                  >
                    <RefreshCw className="h-5 w-5 mr-2" />
                    {loading ? "Reabriendo..." : "Reabrir Factura"}
                  </Button>
                ) : (
                  <Button
                    onClick={handleApproveInvoice}
                    disabled={loading}
                    className="flex-1 h-12 rounded-xl"
                    style={{ background: '#2ECC71' }}
                  >
                    <CheckCircle className="h-5 w-5 mr-2" />
                    {loading ? "Aprobando..." : "Aprobar Factura"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* HISTORY MODE */}
          {viewMode === "history" && (
            <div className="space-y-3">
              {invoices.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-600">Sin facturas</p>
                  <p className="text-sm text-gray-400 mt-2">Aún no se han creado facturas para este cliente</p>
                </div>
              ) : (
                invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 rounded-xl border hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => handleViewInvoice(inv)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(30,58,95,0.1)' }}>
                          <FileText className="h-6 w-6" style={{ color: '#1E3A5F' }} />
                        </div>
                        <div>
                          <p className="font-bold" style={{ color: '#1E3A5F' }}>{inv.invoice_number}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(inv.created_at).toLocaleDateString("es-ES")} · {inv.purchase_ids?.length || 0} items
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-extrabold text-xl" style={{ color: '#1E3A5F' }}>${inv.total.toFixed(2)}</p>
                        <Badge className={inv.status === "approved" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                          {inv.status === "approved" ? (
                            <><CheckCircle className="h-3 w-3 mr-1" /> Pagada</>
                          ) : (
                            <><Clock className="h-3 w-3 mr-1" /> Pendiente</>
                          )}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
