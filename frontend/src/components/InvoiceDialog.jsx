import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { getPendingPurchases, createInvoice, getInvoiceDetail, approveInvoice, getClientInvoices, removeItemFromInvoice, reopenInvoice } from "@/lib/api";
import { toast } from "sonner";
import { FileText, Download, CheckCircle, Clock, AlertCircle, History, Trash2, Edit, RefreshCw } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

export default function InvoiceDialog({ open, onOpenChange, client, tenantInfo }) {
  const [loading, setLoading] = useState(false);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [viewMode, setViewMode] = useState("create"); // create, view, history
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

  const generatePDF = () => {
    if (!currentInvoice) return;
    
    const doc = new jsPDF();
    const tenant = currentInvoice.tenant || tenantInfo;
    const inv = currentInvoice;
    const cli = currentInvoice.client || client;
    
    // Colors
    const primaryColor = [30, 58, 95]; // #1E3A5F
    const accentColor = [46, 204, 113]; // #2ECC71
    
    // Header background
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 50, "F");
    
    // Logo placeholder (circle)
    doc.setFillColor(255, 255, 255);
    doc.circle(25, 25, 12, "F");
    doc.setFillColor(...accentColor);
    doc.circle(25, 25, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(tenant?.business_name?.substring(0, 2)?.toUpperCase() || "PS", 25, 28, { align: "center" });
    
    // Company name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(tenant?.business_name || "Personal Shopper", 45, 22);
    
    // Company details
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${tenant?.owner_name || ""} | ${tenant?.email || ""}`, 45, 30);
    
    // Invoice title
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text("FACTURA", 165, 25, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(inv.invoice_number, 165, 33, { align: "center" });
    
    // Status badge
    const statusY = 40;
    if (inv.status === "approved") {
      doc.setFillColor(...accentColor);
      doc.roundedRect(145, statusY - 4, 40, 8, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text("PAGADA", 165, statusY + 1, { align: "center" });
    } else {
      doc.setFillColor(241, 196, 15); // Yellow
      doc.roundedRect(145, statusY - 4, 40, 8, 2, 2, "F");
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.text("PENDIENTE", 165, statusY + 1, { align: "center" });
    }
    
    // Client info section
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, 58, 85, 35, 3, 3, "F");
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text("CLIENTE", 20, 67);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(11);
    doc.text(cli?.name || "", 20, 75);
    doc.setFontSize(9);
    doc.text(`ID: ${cli?.customer_id || ""}`, 20, 82);
    doc.text(`Tel: ${cli?.whatsapp || ""}`, 20, 88);
    
    // Invoice details section
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(110, 58, 85, 35, 3, 3, "F");
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text("DETALLES", 116, 67);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.text(`Fecha: ${new Date(inv.created_at).toLocaleDateString("es-ES")}`, 116, 75);
    doc.text(`Items: ${inv.purchase_ids?.length || 0}`, 116, 82);
    if (inv.approved_at) {
      doc.text(`Aprobada: ${new Date(inv.approved_at).toLocaleDateString("es-ES")}`, 116, 88);
    }
    
    // Purchases table
    const tableData = (inv.purchases || []).map((p, idx) => [
      idx + 1,
      p.item_name,
      p.store,
      `$${p.price.toFixed(2)}`,
      `$${(p.tax || 0).toFixed(2)}`,
      `$${(p.commission || 0).toFixed(2)}`,
      `$${p.total.toFixed(2)}`
    ]);
    
    doc.autoTable({
      startY: 100,
      head: [["#", "Producto", "Tienda", "Precio", "Tax", "Comisión", "Total"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [60, 60, 60]
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 50 },
        2: { cellWidth: 30 },
        3: { cellWidth: 22, halign: "right" },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 25, halign: "right", fontStyle: "bold" }
      },
      margin: { left: 14, right: 14 }
    });
    
    // Totals section
    const finalY = doc.lastAutoTable.finalY + 10;
    
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(120, finalY, 75, 45, 3, 3, "F");
    
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text("Subtotal:", 125, finalY + 10);
    doc.text(`$${inv.subtotal.toFixed(2)}`, 190, finalY + 10, { align: "right" });
    
    doc.text("Impuestos:", 125, finalY + 18);
    doc.text(`$${inv.total_tax.toFixed(2)}`, 190, finalY + 18, { align: "right" });
    
    doc.text("Comisiones:", 125, finalY + 26);
    doc.text(`$${inv.total_commission.toFixed(2)}`, 190, finalY + 26, { align: "right" });
    
    doc.setDrawColor(...primaryColor);
    doc.line(125, finalY + 32, 190, finalY + 32);
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text("TOTAL:", 125, finalY + 41);
    doc.text(`$${inv.total.toFixed(2)}`, 190, finalY + 41, { align: "right" });
    
    // Pending badge if not approved
    if (inv.status !== "approved") {
      doc.setFillColor(255, 243, 205);
      doc.roundedRect(14, finalY, 95, 20, 3, 3, "F");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(133, 100, 4);
      doc.text("PENDIENTE DE PAGO", 62, finalY + 12, { align: "center" });
    }
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Gracias por su preferencia", 105, 280, { align: "center" });
    doc.text(`Generado: ${new Date().toLocaleString("es-ES")}`, 105, 285, { align: "center" });
    
    // Save
    doc.save(`Factura_${inv.invoice_number}_${cli?.customer_id || ""}.pdf`);
    toast.success("PDF descargado");
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
                  className="flex-1 h-12 rounded-xl"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Descargar PDF
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
