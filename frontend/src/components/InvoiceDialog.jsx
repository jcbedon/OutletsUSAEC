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
import QRCode from "qrcode";

// Helper function to load image with proper dimensions
const loadImageWithDimensions = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        const dataURL = canvas.toDataURL("image/png");
        resolve({
          dataURL,
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio: img.naturalWidth / img.naturalHeight
        });
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
      
      // ========== MODERN SAAS COLOR PALETTE ==========
      const colors = {
        background: [248, 250, 252],     // #F8FAFC
        textPrimary: [15, 23, 42],        // #0F172A
        textSecondary: [100, 116, 139],   // #64748B
        divider: [226, 232, 240],         // #E2E8F0
        white: [255, 255, 255],
        // Status colors
        paid: { bg: [220, 252, 231], text: [22, 101, 52] },       // #DCFCE7, #166534
        pending: { bg: [254, 243, 199], text: [161, 98, 7] },     // #FEF3C7, #A16207
        cancelled: { bg: [254, 226, 226], text: [185, 28, 28] }   // #FEE2E2, #B91C1C
      };
      
      const pageWidth = 210;
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);
      
      // ========== BACKGROUND ==========
      doc.setFillColor(...colors.background);
      doc.rect(0, 0, pageWidth, 297, "F");
      
      // ========== WHITE CONTAINER WITH SHADOW EFFECT ==========
      const containerX = 12;
      const containerY = 12;
      const containerWidth = pageWidth - 24;
      
      // Subtle shadow effect
      doc.setFillColor(200, 200, 200);
      doc.roundedRect(containerX + 1, containerY + 1, containerWidth, 273, 6, 6, "F");
      
      // White container
      doc.setFillColor(...colors.white);
      doc.roundedRect(containerX, containerY, containerWidth, 273, 6, 6, "F");
      
      let currentY = containerY + 20;
      
      // ========== HEADER SECTION ==========
      // Load and add logo with proper proportions
      let logoUrl = tenant?.logo_url || tenantInfo?.logo_url;
      let logoEndX = margin;
      
      if (logoUrl) {
        if (logoUrl.startsWith('/')) {
          const baseUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
          logoUrl = baseUrl + logoUrl;
        }
        
        try {
          const logoData = await loadImageWithDimensions(logoUrl);
          const targetHeight = 14; // ~40px in mm
          const logoWidth = targetHeight * logoData.aspectRatio;
          
          // Add logo maintaining exact proportions (object-fit: contain)
          doc.addImage(logoData.dataURL, 'PNG', margin, currentY - 4, logoWidth, targetHeight);
          logoEndX = margin + logoWidth + 5; // 14px spacing after logo
        } catch (e) {
          console.log("Could not load logo:", e);
        }
      }
      
      // Company name and email (left side, after logo)
      doc.setTextColor(...colors.textPrimary);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(tenant?.business_name || "Outlets USA EC", logoEndX, currentY + 2);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textSecondary);
      doc.text(tenant?.email || "admin@outletsusaec.com", logoEndX, currentY + 8);
      
      // Invoice info (right side)
      const rightX = pageWidth - margin;
      
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("FACTURA", rightX, currentY - 2, { align: "right" });
      
      doc.setTextColor(...colors.textPrimary);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(inv.invoice_number, rightX, currentY + 6, { align: "right" });
      
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const invoiceDate = new Date(inv.created_at).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
      doc.text(invoiceDate, rightX, currentY + 12, { align: "right" });
      
      // Status badge (pill shape)
      const statusConfig = inv.status === "approved" ? colors.paid : 
                          inv.status === "cancelled" ? colors.cancelled : colors.pending;
      const statusText = inv.status === "approved" ? "PAGADA" : 
                        inv.status === "cancelled" ? "CANCELADA" : "PENDIENTE";
      const statusIcon = inv.status === "approved" ? " ✓" : "";
      
      const badgeText = statusText + statusIcon;
      const badgeWidth = doc.getTextWidth(badgeText) + 8;
      const badgeX = rightX - badgeWidth;
      
      doc.setFillColor(...statusConfig.bg);
      doc.roundedRect(badgeX, currentY + 16, badgeWidth, 7, 3, 3, "F");
      
      doc.setTextColor(...statusConfig.text);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(badgeText, badgeX + badgeWidth / 2, currentY + 21, { align: "center" });
      
      currentY += 36;
      
      // ========== DIVIDER ==========
      doc.setDrawColor(...colors.divider);
      doc.setLineWidth(0.3);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      
      currentY += 12;
      
      // ========== CLIENT AND DETAILS SECTION (2 columns) ==========
      const colWidth = (contentWidth - 10) / 2;
      
      // Column 1: Cliente
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("CLIENTE", margin, currentY);
      
      currentY += 6;
      doc.setTextColor(...colors.textPrimary);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(cli?.name || "", margin, currentY);
      
      currentY += 5;
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`ID: ${cli?.customer_id || ""}`, margin, currentY);
      
      currentY += 4;
      doc.text(`WhatsApp: ${cli?.whatsapp || ""}`, margin, currentY);
      
      // Column 2: Detalles (right side, same Y level)
      const col2X = margin + colWidth + 10;
      let detailY = currentY - 15;
      
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("DETALLES", col2X, detailY);
      
      detailY += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Fecha: ${new Date(inv.created_at).toLocaleDateString("es-ES")}`, col2X, detailY);
      
      detailY += 4;
      doc.text(`Items: ${inv.purchases?.length || 0}`, col2X, detailY);
      
      if (inv.approved_at) {
        detailY += 4;
        doc.setTextColor(...colors.paid.text);
        doc.text(`Aprobada: ${new Date(inv.approved_at).toLocaleDateString("es-ES")}`, col2X, detailY);
      }
      
      currentY += 12;
      
      // ========== PRODUCTS TABLE ==========
      const tableData = (inv.purchases || []).map((p, idx) => [
        (idx + 1).toString(),
        p.item_name,
        p.store,
        `$${p.price.toFixed(2)}`,
        `$${(p.tax || 0).toFixed(2)}`,
        `$${(p.commission || 0).toFixed(2)}`,
        `$${p.total.toFixed(2)}`
      ]);
      
      autoTable(doc, {
        startY: currentY,
        head: [["#", "Producto", "Tienda", "Precio", "Tax", "Comisión", "Total"]],
        body: tableData,
        theme: "plain",
        headStyles: {
          fillColor: [241, 245, 249], // Gris muy claro
          textColor: colors.textSecondary,
          fontStyle: "bold",
          fontSize: 8,
          cellPadding: 4
        },
        bodyStyles: {
          fontSize: 8,
          textColor: colors.textPrimary,
          cellPadding: 3
        },
        alternateRowStyles: {
          fillColor: colors.white
        },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 52 },
          2: { cellWidth: 25 },
          3: { cellWidth: 22, halign: "right" },
          4: { cellWidth: 18, halign: "right" },
          5: { cellWidth: 22, halign: "right" },
          6: { cellWidth: 22, halign: "right", fontStyle: "bold" }
        },
        margin: { left: margin, right: margin },
        styles: {
          lineColor: colors.divider,
          lineWidth: 0.2
        },
        didDrawPage: function(data) {
          // Draw bottom border for header
          doc.setDrawColor(...colors.divider);
          doc.setLineWidth(0.3);
        }
      });
      
      // ========== SHIPPING INFO SECTION (if available) ==========
      let finalY = doc.lastAutoTable.finalY + 12;
      
      if (shipment && (shipment.tracking_number || shipment.shipping_cost > 0)) {
        // Shipping info box
        doc.setFillColor(249, 250, 251); // Very light gray
        doc.roundedRect(margin, finalY - 2, contentWidth, 18, 3, 3, "F");
        
        doc.setTextColor(...colors.textSecondary);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("INFORMACIÓN DE ENVÍO", margin + 4, finalY + 4);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textPrimary);
        
        const shipInfoY = finalY + 11;
        let shipX = margin + 4;
        
        if (shipment.shipping_cost > 0) {
          doc.text(`Costo: $${shipment.shipping_cost.toFixed(2)}`, shipX, shipInfoY);
          shipX += 45;
        }
        
        if (shipment.weight_pounds) {
          doc.text(`Peso: ${shipment.weight_pounds} lbs`, shipX, shipInfoY);
          shipX += 35;
        }
        
        if (shipment.tracking_number) {
          doc.setFont("helvetica", "bold");
          doc.text(`Tracking: ${shipment.tracking_number}`, shipX, shipInfoY);
        }
        
        finalY += 22;
      }
      
      // ========== TOTALS SECTION (right aligned) ==========
      const totalsX = pageWidth - margin - 65;
      const totalsWidth = 65;
      
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      // Subtotal
      doc.text("Subtotal:", totalsX, finalY);
      doc.setTextColor(...colors.textPrimary);
      doc.text(`$${inv.subtotal.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
      
      finalY += 6;
      doc.setTextColor(...colors.textSecondary);
      doc.text("Impuestos:", totalsX, finalY);
      doc.setTextColor(...colors.textPrimary);
      doc.text(`$${inv.total_tax.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
      
      finalY += 6;
      doc.setTextColor(...colors.textSecondary);
      doc.text("Comisiones:", totalsX, finalY);
      doc.setTextColor(...colors.textPrimary);
      doc.text(`$${inv.total_commission.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
      
      // Shipping cost in totals
      if (shipment && shipment.shipping_cost > 0) {
        finalY += 6;
        doc.setTextColor(...colors.textSecondary);
        doc.text("Envío:", totalsX, finalY);
        doc.setTextColor(...colors.textPrimary);
        doc.text(`$${shipment.shipping_cost.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
      }
      
      // Divider line before total
      finalY += 4;
      doc.setDrawColor(...colors.divider);
      doc.setLineWidth(0.3);
      doc.line(totalsX, finalY, pageWidth - margin, finalY);
      
      // TOTAL (larger, bold)
      finalY += 8;
      const grandTotal = inv.total + (shipment?.shipping_cost || 0);
      
      doc.setTextColor(...colors.textPrimary);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL:", totalsX, finalY);
      doc.setFontSize(14);
      doc.text(`$${grandTotal.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
      
      // ========== CLIENT BALANCE (if negative / owes money) ==========
      const clientBalance = currentInvoice.client_balance || 0;
      if (clientBalance < 0) {
        finalY += 10;
        
        // Red warning box for pending balance
        doc.setFillColor(254, 226, 226); // Light red background
        doc.roundedRect(totalsX - 5, finalY - 4, totalsWidth + 10, 14, 3, 3, "F");
        
        doc.setTextColor(185, 28, 28); // Red text
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("SALDO PENDIENTE:", totalsX, finalY + 4);
        doc.setFontSize(12);
        doc.text(`$${Math.abs(clientBalance).toFixed(2)}`, pageWidth - margin, finalY + 4, { align: "right" });
      }
      
      // ========== FOOTER SECTION ==========
      const footerY = containerY + 273 - 25;
      
      // Divider before footer
      doc.setDrawColor(...colors.divider);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 8, pageWidth - margin, footerY - 8);
      
      // Footer text (left side)
      doc.setTextColor(...colors.textPrimary);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Gracias por su compra", margin, footerY);
      
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`${tenant?.business_name || "Outlets USA EC"} – Compras en USA → Entregas en Ecuador`, margin, footerY + 5);
      
      // Generation timestamp (bottom left)
      const genDate = new Date().toLocaleString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      doc.setFontSize(7);
      doc.text(`Generado: ${genDate}`, margin, footerY + 12);
      
      // QR Code (bottom right) - Links to client portal
      try {
        // QR data: URL to client portal with client ID pre-filled
        const portalUrl = `https://outletsusaec.shop/login?user=${encodeURIComponent(cli?.customer_id || "")}`;
        const qrDataUrl = await QRCode.toDataURL(portalUrl, {
          width: 200,
          margin: 1,
          color: {
            dark: '#0F172A',
            light: '#FFFFFF'
          }
        });
        doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - 22, footerY - 6, 22, 22);
        
        // Small text below QR
        doc.setFontSize(6);
        doc.setTextColor(...colors.textSecondary);
        doc.text("Escanea para ver tu portal", pageWidth - margin - 11, footerY + 18, { align: "center" });
      } catch (e) {
        console.log("Could not generate QR:", e);
      }
      
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
