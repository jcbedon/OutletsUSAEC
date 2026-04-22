import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { getPendingPurchases, createInvoice, getInvoiceDetail, approveInvoice, getClientInvoices, removeItemFromInvoice, reopenInvoice, generateAccessToken, getClientPendingBalance, getClientAvailableDeposits, annulInvoice, updateInvoiceSaldoPendiente, updatePurchase, getTenantSettings } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, CheckCircle, Clock, AlertCircle, History, Trash2, Edit, RefreshCw, Loader2, Package, ArrowRight, Info, Save, X } from "lucide-react";
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

export default function InvoiceDialog({ open, onOpenChange, client, tenantInfo, existingInvoice = null }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [viewMode, setViewMode] = useState("create"); // create, view, history
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [showShipmentPrompt, setShowShipmentPrompt] = useState(false);
  const [saldoPendiente, setSaldoPendiente] = useState("");
  const [autoPendingBalance, setAutoPendingBalance] = useState(0);
  const [pendingDetails, setPendingDetails] = useState([]);
  const [availableDeposits, setAvailableDeposits] = useState([]);
  const [annulDialogOpen, setAnnulDialogOpen] = useState(false);
  const [annulTargetId, setAnnulTargetId] = useState(null);
  const [annulPassword, setAnnulPassword] = useState("");
  const [annulling, setAnnulling] = useState(false);
  const [editSaldoPendiente, setEditSaldoPendiente] = useState("");
  // Inline edit of pending purchases (items)
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [editPurchaseForm, setEditPurchaseForm] = useState({
    item_name: "", store: "", price: "", tax_option: "0", custom_tax: "",
    apply_commission: true, commission: "0"
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [taxOptions, setTaxOptions] = useState([
    { value: "8.25", label: "8.25%" },
    { value: "10", label: "10%" },
    { value: "15", label: "15%" },
    { value: "0", label: "Sin Taxes" },
    { value: "other", label: "Otro" }
  ]);
  const invoiceRef = useRef(null);

  // Sync editSaldoPendiente when currentInvoice changes
  useEffect(() => {
    if (currentInvoice) {
      setEditSaldoPendiente(currentInvoice.saldo_pendiente > 0 ? currentInvoice.saldo_pendiente.toFixed(2) : "");
    }
  }, [currentInvoice?.id, currentInvoice?.saldo_pendiente]);

  useEffect(() => {
    if (open) {
      // If opening with an existing invoice, load it directly in view mode
      if (existingInvoice) {
        loadExistingInvoice(existingInvoice);
      } else if (client) {
        loadPendingPurchases();
        loadInvoices();
        loadPendingBalance();
        setShowShipmentPrompt(false);
        setViewMode("create");
      }
    }
  }, [open, client, existingInvoice]);

  const [isFirstInvoice, setIsFirstInvoice] = useState(true);
  const [saldoAFavor, setSaldoAFavor] = useState(0);

  const loadPendingBalance = async () => {
    try {
      const [balRes, depRes] = await Promise.all([
        getClientPendingBalance(client.customer_id),
        getClientAvailableDeposits(client.customer_id)
      ]);
      const isFirst = balRes.data.is_first_invoice !== false;
      setIsFirstInvoice(isFirst);
      setAutoPendingBalance(balRes.data.total_pending || 0);
      setPendingDetails(balRes.data.details || []);
      setSaldoPendiente(balRes.data.total_pending > 0 ? balRes.data.total_pending.toFixed(2) : "");
      setSaldoAFavor(balRes.data.saldo_a_favor || 0);
      setAvailableDeposits(depRes.data || []);
    } catch {
      setAutoPendingBalance(0);
      setIsFirstInvoice(true);
      setSaldoPendiente("");
      setSaldoAFavor(0);
      setAvailableDeposits([]);
    }
  };

  const loadExistingInvoice = async (invoice) => {
    try {
      setLoading(true);
      // Load full invoice details if we only have basic info
      if (invoice.id) {
        const res = await getInvoiceDetail(invoice.id);
        setCurrentInvoice(res.data);
      } else {
        setCurrentInvoice(invoice);
      }
      setViewMode("view");
    } catch (error) {
      toast.error("Error al cargar la factura");
    } finally {
      setLoading(false);
    }
  };

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

  // Load tenant tax options once
  useEffect(() => {
    if (!open) return;
    getTenantSettings()
      .then((res) => {
        if (res.data?.tax_options && res.data.tax_options.length > 0) {
          setTaxOptions(res.data.tax_options);
        }
      })
      .catch(() => {});
  }, [open]);

  const getEffectiveTaxRate = (taxOption, customTax) => {
    if (taxOption === "0") return 0;
    if (taxOption === "other") return parseFloat(customTax) / 100 || 0;
    return parseFloat(taxOption) / 100 || 0;
  };

  const handleStartEditPurchase = (purchase, e) => {
    if (e) e.stopPropagation();
    setEditingPurchaseId(purchase.id);
    // Derive tax_option from stored tax_rate
    let tax_option = "0";
    let custom_tax = "";
    if (purchase.apply_tax !== false && purchase.tax_rate > 0) {
      const rate = (purchase.tax_rate * 100).toFixed(2).replace(/\.?0+$/, '');
      const matching = taxOptions.find(opt => opt.value === rate && opt.value !== "other");
      if (matching) {
        tax_option = rate;
      } else {
        tax_option = "other";
        custom_tax = rate;
      }
    }
    setEditPurchaseForm({
      item_name: purchase.item_name || "",
      store: purchase.store || "",
      price: (purchase.price ?? 0).toString(),
      tax_option,
      custom_tax,
      apply_commission: purchase.apply_commission !== false,
      commission: (purchase.commission || 0).toString()
    });
  };

  const handleCancelEditPurchase = (e) => {
    if (e) e.stopPropagation();
    setEditingPurchaseId(null);
  };

  const handleSavePurchaseEdit = async (purchaseId, e) => {
    if (e) e.stopPropagation();
    const orig = pendingPurchases.find(p => p.id === purchaseId) ||
                 currentInvoice?.purchases?.find(p => p.id === purchaseId);
    if (!orig) return;
    try {
      setSavingEdit(true);
      const data = {};
      if (editPurchaseForm.item_name !== orig.item_name) data.item_name = editPurchaseForm.item_name;
      if (editPurchaseForm.store !== orig.store) data.store = editPurchaseForm.store;
      const newPrice = parseFloat(editPurchaseForm.price);
      if (!Number.isNaN(newPrice) && newPrice !== orig.price) data.price = newPrice;

      const newTaxRate = getEffectiveTaxRate(editPurchaseForm.tax_option, editPurchaseForm.custom_tax);
      const newApplyTax = newTaxRate > 0;
      const origApplyTax = orig.apply_tax !== false;
      const origTaxRate = orig.tax_rate || 0;
      if (newApplyTax !== origApplyTax) data.apply_tax = newApplyTax;
      if (Math.abs(newTaxRate - origTaxRate) > 0.0001) data.tax_rate = newTaxRate;

      const newApplyCommission = !!editPurchaseForm.apply_commission;
      const newCommission = parseFloat(editPurchaseForm.commission) || 0;
      const origApplyCommission = orig.apply_commission !== false;
      const origCommission = orig.commission || 0;
      if (newApplyCommission !== origApplyCommission) data.apply_commission = newApplyCommission;
      if (newApplyCommission && newCommission !== origCommission) data.commission = newCommission;
      if (!newApplyCommission) data.commission = 0;

      if (Object.keys(data).length === 0) {
        setEditingPurchaseId(null);
        return;
      }
      await updatePurchase(purchaseId, data);
      toast.success("Artículo actualizado. Cambios aplicados también en LIVE.");
      setEditingPurchaseId(null);
      if (viewMode === "view" && currentInvoice?.id) {
        const invoiceRes = await getInvoiceDetail(currentInvoice.id);
        setCurrentInvoice(invoiceRes.data);
        loadInvoices();
      } else {
        await loadPendingPurchases();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al editar artículo");
    } finally {
      setSavingEdit(false);
    }
  };

  const loadInvoices = async () => {
    try {
      const res = await getClientInvoices(client.customer_id, true);
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
        purchase_ids: selectedPurchases,
        saldo_pendiente: parseFloat(saldoPendiente) || 0,
        saldo_a_favor: saldoAFavor || 0
      });
      toast.success(`Factura ${res.data.invoice_number} creada`);
      
      // Load the created invoice
      const invoiceRes = await getInvoiceDetail(res.data.invoice_id);
      setCurrentInvoice(invoiceRes.data);
      setViewMode("view");
      setShowShipmentPrompt(true); // Show shipment creation prompt
      loadPendingPurchases();
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear factura");
    } finally {
      setLoading(false);
    }
  };

  const handleGoToCreateShipment = () => {
    // Store invoice data in sessionStorage for the shipment page
    sessionStorage.setItem('shipmentFromInvoice', JSON.stringify({
      invoice_id: currentInvoice.id,
      invoice_number: currentInvoice.invoice_number,
      customer_id: client.customer_id,
      client_name: client.name,
      client: client,
      purchases: currentInvoice.purchases,
      subtotal: currentInvoice.subtotal,
      total_tax: currentInvoice.total_tax,
      total: currentInvoice.total
    }));
    onOpenChange(false);
    navigate('/admin/shipments?from_invoice=true');
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

  const openAnnulDialog = (invoiceId, e) => {
    if (e) e.stopPropagation();
    setAnnulTargetId(invoiceId);
    setAnnulPassword("");
    setAnnulDialogOpen(true);
  };

  const handleAnnulInvoice = async () => {
    if (!annulPassword) {
      toast.error("Ingresa tu contraseña");
      return;
    }
    setAnnulling(true);
    try {
      await annulInvoice(annulTargetId, annulPassword);
      toast.success("Factura eliminada exitosamente");
      setAnnulDialogOpen(false);
      setAnnulTargetId(null);
      setAnnulPassword("");
      loadInvoices();
      if (currentInvoice?.id === annulTargetId) {
        setCurrentInvoice(null);
        setViewMode("history");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al eliminar factura");
    } finally {
      setAnnulling(false);
    }
  };

  const handleSaveSaldoPendiente = async () => {
    if (!currentInvoice) return;
    const newSaldo = parseFloat(editSaldoPendiente) || 0;
    try {
      await updateInvoiceSaldoPendiente(currentInvoice.id, newSaldo);
      toast.success("Saldo pendiente actualizado");
      const invoiceRes = await getInvoiceDetail(currentInvoice.id);
      setCurrentInvoice(invoiceRes.data);
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al actualizar");
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
      const tenant = {
        ...(currentInvoice.tenant || {}),
        ...tenantInfo
      };
      const { generateInvoicePDF } = await import("@/lib/invoicePDF");
      await generateInvoicePDF(currentInvoice, tenant);
      toast.success("PDF descargado");
    } catch (error) {
      toast.error("Error al generar PDF");
      console.error("PDF generation error:", error);
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
                    {pendingPurchases.map((purchase) => {
                      const isEditing = editingPurchaseId === purchase.id;
                      if (isEditing) {
                        const price = parseFloat(editPurchaseForm.price) || 0;
                        const taxRate = getEffectiveTaxRate(editPurchaseForm.tax_option, editPurchaseForm.custom_tax);
                        const taxAmount = price * taxRate;
                        const commission = editPurchaseForm.apply_commission ? (parseFloat(editPurchaseForm.commission) || 0) : 0;
                        const totalPreview = price + taxAmount + commission;
                        const taxLabel = editPurchaseForm.tax_option === "other"
                          ? `${editPurchaseForm.custom_tax || 0}%`
                          : editPurchaseForm.tax_option === "0" ? "Sin Tax" : `${editPurchaseForm.tax_option}%`;
                        return (
                          <div
                            key={purchase.id}
                            className="p-4 rounded-xl border-2 border-blue-400 bg-blue-50/50 space-y-2"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`edit-pending-purchase-${purchase.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-blue-700 uppercase">Editando artículo</span>
                              <span className="text-xs text-gray-500">{purchase.store || ""}</span>
                            </div>
                            <Input
                              value={editPurchaseForm.item_name}
                              onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, item_name: e.target.value })}
                              placeholder="Producto"
                              className="h-9 rounded-lg text-sm"
                              data-testid="edit-pending-item-name"
                            />
                            <div className="flex gap-2">
                              <Input
                                value={editPurchaseForm.store}
                                onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, store: e.target.value })}
                                placeholder="Tienda"
                                className="h-9 rounded-lg text-sm flex-1"
                              />
                              <Input
                                type="number" step="0.01" min="0"
                                value={editPurchaseForm.price}
                                onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, price: e.target.value })}
                                placeholder="Precio"
                                className="h-9 rounded-lg text-sm w-28"
                                data-testid="edit-pending-price"
                                onWheel={(e) => e.target.blur()}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-2 bg-white rounded-lg border">
                                <p className="text-xs font-medium text-gray-600 mb-1">Impuesto</p>
                                <div className="flex gap-2 items-center">
                                  <Select
                                    value={editPurchaseForm.tax_option}
                                    onValueChange={(val) => setEditPurchaseForm({ ...editPurchaseForm, tax_option: val })}
                                  >
                                    <SelectTrigger className="h-8 rounded text-xs flex-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {taxOptions.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {editPurchaseForm.tax_option === "other" && (
                                    <Input
                                      type="number" step="0.01" min="0"
                                      value={editPurchaseForm.custom_tax}
                                      onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, custom_tax: e.target.value })}
                                      className="w-16 h-8 text-xs text-center rounded"
                                      placeholder="%"
                                    />
                                  )}
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-lg border">
                                <label className="flex items-center gap-1 text-xs cursor-pointer mb-1">
                                  <input
                                    type="checkbox"
                                    checked={editPurchaseForm.apply_commission}
                                    onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, apply_commission: e.target.checked })}
                                    className="w-3 h-3"
                                  />
                                  <span className="font-medium text-gray-700">Comisión $</span>
                                </label>
                                {editPurchaseForm.apply_commission && (
                                  <Input
                                    type="number" step="0.01"
                                    value={editPurchaseForm.commission}
                                    onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, commission: e.target.value })}
                                    className="h-7 text-xs text-center rounded"
                                    data-testid="edit-pending-commission"
                                    onWheel={(e) => e.target.blur()}
                                  />
                                )}
                              </div>
                            </div>
                            {/* Preview */}
                            <div className="p-2 bg-white/80 rounded-lg text-xs space-y-0.5 border">
                              <div className="flex justify-between"><span className="text-gray-500">Precio:</span><span>${price.toFixed(2)}</span></div>
                              {taxRate > 0 && (
                                <div className="flex justify-between"><span className="text-gray-500">Tax ({taxLabel}):</span><span>${taxAmount.toFixed(2)}</span></div>
                              )}
                              {editPurchaseForm.apply_commission && (
                                <div className="flex justify-between"><span className="text-gray-500">Comisión:</span><span>${commission.toFixed(2)}</span></div>
                              )}
                              <div className="flex justify-between pt-1 border-t font-bold text-blue-700"><span>Total:</span><span>${totalPreview.toFixed(2)}</span></div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={(e) => handleSavePurchaseEdit(purchase.id, e)}
                                disabled={savingEdit}
                                className="flex-1 h-9 rounded-lg text-white"
                                style={{ background: '#2ECC71' }}
                                data-testid={`save-pending-edit-${purchase.id}`}
                              >
                                {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Guardar</>}
                              </Button>
                              <Button
                                size="sm" variant="outline"
                                onClick={handleCancelEditPurchase}
                                className="h-9 rounded-lg"
                                data-testid={`cancel-pending-edit-${purchase.id}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={purchase.id}
                          className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                            selectedPurchases.includes(purchase.id)
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                          onClick={() => togglePurchase(purchase.id)}
                          data-testid={`pending-purchase-${purchase.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={selectedPurchases.includes(purchase.id)}
                              onCheckedChange={() => {}}
                              onClick={(e) => e.stopPropagation()}
                              className="data-[state=checked]:bg-blue-600 pointer-events-none"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium text-gray-800 truncate">{purchase.item_name}</p>
                                <div className="flex items-center gap-2 shrink-0">
                                  <p className="font-bold text-lg" style={{ color: '#1E3A5F' }}>${(purchase.price + (purchase.commission || 0)).toFixed(2)}</p>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-gray-500 hover:text-blue-600 hover:bg-blue-100"
                                    onClick={(e) => handleStartEditPurchase(purchase, e)}
                                    title="Editar artículo (aplica también en LIVE)"
                                    data-testid={`edit-pending-purchase-btn-${purchase.id}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                                <span>{purchase.store}</span>
                                <span>Costo: ${purchase.price.toFixed(2)}</span>
                                {purchase.commission > 0 && <span>Com: ${purchase.commission.toFixed(2)}</span>}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(purchase.created_at).toLocaleDateString("es-ES")}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Saldo Pendiente Field */}
                  {selectedPurchases.length > 0 && (
                    <div className="p-3 rounded-xl border border-orange-200 bg-orange-50/50" data-testid="saldo-pendiente-section">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-orange-800">Saldo Pendiente</p>
                          <p className="text-xs text-orange-600">
                            {!isFirstInvoice ? 'Total a pagar de factura anterior' : 'Deuda anterior (editable)'}
                          </p>
                        </div>
                        <div className="w-32">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={saldoPendiente}
                            onChange={(e) => setSaldoPendiente(e.target.value)}
                            className={`h-9 text-right font-bold rounded-lg ${!isFirstInvoice ? 'text-orange-700 bg-orange-100 cursor-not-allowed' : 'text-orange-700'}`}
                            data-testid="saldo-pendiente-input"
                            onWheel={(e) => e.target.blur()}
                            disabled={!isFirstInvoice}
                          />
                        </div>
                      </div>
                      {pendingDetails.length > 0 && (
                        <div className="text-xs text-orange-600 space-y-0.5 border-t border-orange-200 pt-2 mt-1">
                          {pendingDetails.map((d, i) => (
                            <div key={i} className="flex justify-between">
                              <span>{d.invoice_number}: Total a pagar</span>
                              <span>${(d.total_a_pagar || d.remaining || 0).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Totals and Create button */}
                  {selectedPurchases.length > 0 && (
                    <div className="bg-white pt-4 border-t">
                      <div className="p-4 rounded-xl" style={{ background: 'rgba(30,58,95,0.05)' }}>
                        {(() => {
                          const subtotal = selectedTotals.subtotal + selectedTotals.commission;
                          const saldo = parseFloat(saldoPendiente) || 0;
                          const grandTotal = subtotal + saldo;
                          const totalAbonos = availableDeposits.reduce((s, d) => s + d.amount, 0);
                          const totalCredits = totalAbonos + (saldoAFavor || 0);
                          const totalAPagar = Math.max(0, grandTotal - totalCredits);

                          return (
                            <>
                              <div className="space-y-2 mb-3">
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-600">Subtotal:</span>
                                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                                </div>
                                {saldo > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-orange-600">Saldo Pendiente:</span>
                                    <span className="font-medium text-orange-600">${saldo.toFixed(2)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between border-t pt-2">
                                  <span className="font-bold">Total:</span>
                                  <span className="font-bold text-xl" style={{ color: '#1E3A5F' }}>${grandTotal.toFixed(2)}</span>
                                </div>
                              </div>

                              {/* Abonos (recargas disponibles) */}
                              {saldoAFavor > 0 && (
                                <div className="space-y-1 mb-3 p-3 rounded-lg bg-blue-50 border border-blue-200" data-testid="saldo-favor-anterior">
                                  <p className="text-xs font-semibold text-blue-800 mb-1">Saldo a Favor (factura anterior)</p>
                                  <div className="flex justify-between text-sm font-bold text-blue-700">
                                    <span>Crédito:</span>
                                    <span>-${saldoAFavor.toFixed(2)}</span>
                                  </div>
                                </div>
                              )}

                              {availableDeposits.length > 0 && (
                                <div className="space-y-1 mb-3 p-3 rounded-lg bg-green-50 border border-green-200" data-testid="create-abonos-section">
                                  <p className="text-xs font-semibold text-green-800 mb-1">Abonos (Recargas del cliente)</p>
                                  {availableDeposits.map((dep, idx) => (
                                    <div key={dep.id} className="flex justify-between text-sm">
                                      <span className="text-green-700">
                                        Abono {idx + 1}{dep.original_amount && dep.original_amount !== dep.amount ? ` (recarga $${dep.original_amount.toFixed(2)})` : ''}:
                                      </span>
                                      <span className="font-bold text-green-700">-${dep.amount.toFixed(2)}</span>
                                    </div>
                                  ))}
                                  <div className="border-t border-green-300 pt-1 mt-1 flex justify-between text-sm font-bold text-green-800">
                                    <span>Total Abonos:</span>
                                    <span>-${totalAbonos.toFixed(2)}</span>
                                  </div>
                                </div>
                              )}

                              {/* Total a pagar o Saldo a favor */}
                              <div className="flex justify-between items-center mb-4 p-2 rounded-lg" style={{ background: totalAPagar > 0 ? 'rgba(220,38,38,0.05)' : 'rgba(22,163,74,0.05)' }}>
                                <span className="font-extrabold text-lg">Total a pagar:</span>
                                <span className="font-extrabold text-2xl" style={{ color: totalAPagar > 0 ? '#DC2626' : '#16A34A' }}>
                                  ${totalAPagar.toFixed(2)}
                                </span>
                              </div>
                              {totalCredits > grandTotal && (
                                <div className="p-3 rounded-lg bg-green-100 border border-green-300 mb-4 text-center" data-testid="saldo-favor-msg">
                                  <p className="text-sm font-bold text-green-800">
                                    Saldo a favor para próxima factura: ${(totalCredits - grandTotal).toFixed(2)}
                                  </p>
                                  <p className="text-xs text-green-600">Este saldo se aplicará automáticamente</p>
                                </div>
                              )}
                            </>
                          );
                        })()}
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
                    {(tenantInfo?.logo_url || currentInvoice.tenant?.logo_url) ? (
                      <img 
                        src={`${process.env.REACT_APP_BACKEND_URL || ''}${tenantInfo?.logo_url || currentInvoice.tenant?.logo_url}`}
                        alt="Logo"
                        className="w-16 h-16 rounded-2xl object-contain bg-white p-1"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className="w-16 h-16 rounded-2xl items-center justify-center" style={{ background: '#2ECC71', display: (tenantInfo?.logo_url || currentInvoice.tenant?.logo_url) ? 'none' : 'flex' }}>
                      <span className="text-2xl font-bold text-white">
                        {(tenantInfo?.business_name || currentInvoice.tenant?.business_name)?.substring(0, 2)?.toUpperCase() || "PS"}
                      </span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">{tenantInfo?.business_name || currentInvoice.tenant?.business_name || "Personal Shopper"}</h2>
                      <p className="text-blue-200 text-sm">{tenantInfo?.email || currentInvoice.tenant?.email}</p>
                      <p className="text-blue-200 text-sm">{tenantInfo?.owner_name || currentInvoice.tenant?.owner_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold">{currentInvoice.invoice_number}</p>
                    {currentInvoice.is_annulled ? (
                      <Badge className="bg-red-600 mt-2">ANULADA</Badge>
                    ) : (
                      <Badge className={currentInvoice.status === "approved" ? "bg-green-500 mt-2" : "bg-yellow-500 mt-2"}>
                        {currentInvoice.status === "approved" ? "PAGADA" : "PENDIENTE"}
                      </Badge>
                    )}
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
                  <p className="text-xs font-semibold text-gray-500 mb-2">DETALLE DE COMPRA</p>
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
                      {(() => {
                        const s = currentInvoice.shipment;
                        const isPounds = s.shipping_mode === "pounds";
                        const label = isPounds ? "Libras" : (s.shipping_mode === "packages" || s.package_count > 0 ? "Paquetes" : "Peso");
                        const value = isPounds
                          ? `${Number(s.package_count || 0).toFixed(1)} lb`
                          : (s.shipping_mode === "packages" || s.package_count > 0)
                            ? `${s.package_count || 0}`
                            : `${s.weight_pounds || 0} lbs`;
                        return (
                          <>
                            <p className="text-xs text-purple-600">{label}</p>
                            <p className="font-bold text-lg text-purple-800">{value}</p>
                          </>
                        );
                      })()}
                    </div>
                    <div>
                      <p className="text-xs text-purple-600">Tracking ({currentInvoice.shipment.tracking_numbers?.length || (currentInvoice.shipment.tracking_number ? 1 : 0)} paquete(s))</p>
                      {currentInvoice.shipment.tracking_numbers?.length > 0 ? (
                        <div className="space-y-1">
                          {currentInvoice.shipment.tracking_numbers.map((t, i) => (
                            <p key={i} className="font-bold text-sm text-purple-800 font-mono">#{i+1}: {t}</p>
                          ))}
                        </div>
                      ) : (
                        <p className="font-bold text-lg text-purple-800">{currentInvoice.shipment.tracking_number || "N/A"}</p>
                      )}
                    </div>
                  </div>
                  {(currentInvoice.shipment.tracking_numbers?.length > 0 || currentInvoice.shipment.tracking_number) && currentInvoice.tenant?.tracking_url_template && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(currentInvoice.shipment.tracking_numbers?.length > 0 
                        ? currentInvoice.shipment.tracking_numbers 
                        : [currentInvoice.shipment.tracking_number]
                      ).filter(Boolean).map((tracking, idx) => (
                        <a
                          key={idx}
                          href={currentInvoice.tenant.tracking_url_template.replace('{tracking}', tracking)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs font-medium"
                        >
                          📦 Paquete {idx + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Purchases table */}
              <div className="border rounded-xl overflow-hidden" data-testid="invoice-purchases-table">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: '#1E3A5F' }}>
                      <th className="text-center p-3 text-white text-sm font-semibold w-20">CANTIDAD</th>
                      <th className="text-left p-3 text-white text-sm font-semibold">DETALLE</th>
                      <th className="text-right p-3 text-white text-sm font-semibold">COSTO</th>
                      <th className="text-left p-3 text-white text-sm font-semibold">TIENDA</th>
                      <th className="text-right p-3 text-white text-sm font-semibold">COMISION</th>
                      <th className="text-right p-3 text-white text-sm font-semibold">TOTAL</th>
                      <th className="text-center p-3 text-white text-sm font-semibold w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentInvoice.purchases?.map((p, idx) => {
                      const isEditing = editingPurchaseId === p.id;
                      const canEdit = currentInvoice.status === "pending" && !currentInvoice.is_annulled;
                      if (isEditing) {
                        const price = parseFloat(editPurchaseForm.price) || 0;
                        const taxRate = getEffectiveTaxRate(editPurchaseForm.tax_option, editPurchaseForm.custom_tax);
                        const taxAmount = price * taxRate;
                        const commission = editPurchaseForm.apply_commission ? (parseFloat(editPurchaseForm.commission) || 0) : 0;
                        const totalPreview = price + taxAmount + commission;
                        const taxLabel = editPurchaseForm.tax_option === "other"
                          ? `${editPurchaseForm.custom_tax || 0}%`
                          : editPurchaseForm.tax_option === "0" ? "Sin Tax" : `${editPurchaseForm.tax_option}%`;
                        return (
                          <tr key={p.id} className="bg-blue-50">
                            <td colSpan={7} className="p-3">
                              <div className="space-y-2" data-testid={`edit-invoice-purchase-${p.id}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-blue-700 uppercase">Editando artículo</span>
                                  <span className="text-xs text-gray-500">Preview Total: <span className="font-bold text-blue-700">${totalPreview.toFixed(2)}</span> ({taxLabel})</span>
                                </div>
                                <Input
                                  value={editPurchaseForm.item_name}
                                  onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, item_name: e.target.value })}
                                  placeholder="Producto"
                                  className="h-9 rounded-lg text-sm"
                                  data-testid="edit-invoice-item-name"
                                />
                                <div className="flex gap-2">
                                  <Input
                                    value={editPurchaseForm.store}
                                    onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, store: e.target.value })}
                                    placeholder="Tienda"
                                    className="h-9 rounded-lg text-sm flex-1"
                                  />
                                  <Input
                                    type="number" step="0.01" min="0"
                                    value={editPurchaseForm.price}
                                    onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, price: e.target.value })}
                                    placeholder="Precio"
                                    className="h-9 rounded-lg text-sm w-28"
                                    data-testid="edit-invoice-price"
                                    onWheel={(e) => e.target.blur()}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="p-2 bg-white rounded-lg border">
                                    <p className="text-xs font-medium text-gray-600 mb-1">Impuesto</p>
                                    <div className="flex gap-2 items-center">
                                      <Select
                                        value={editPurchaseForm.tax_option}
                                        onValueChange={(val) => setEditPurchaseForm({ ...editPurchaseForm, tax_option: val })}
                                      >
                                        <SelectTrigger className="h-8 rounded text-xs flex-1">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {taxOptions.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {editPurchaseForm.tax_option === "other" && (
                                        <Input
                                          type="number" step="0.01" min="0"
                                          value={editPurchaseForm.custom_tax}
                                          onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, custom_tax: e.target.value })}
                                          className="w-16 h-8 text-xs text-center rounded"
                                          placeholder="%"
                                        />
                                      )}
                                    </div>
                                  </div>
                                  <div className="p-2 bg-white rounded-lg border">
                                    <label className="flex items-center gap-1 text-xs cursor-pointer mb-1">
                                      <input
                                        type="checkbox"
                                        checked={editPurchaseForm.apply_commission}
                                        onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, apply_commission: e.target.checked })}
                                        className="w-3 h-3"
                                      />
                                      <span className="font-medium text-gray-700">Comisión $</span>
                                    </label>
                                    {editPurchaseForm.apply_commission && (
                                      <Input
                                        type="number" step="0.01"
                                        value={editPurchaseForm.commission}
                                        onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, commission: e.target.value })}
                                        className="h-7 text-xs text-center rounded"
                                        data-testid="edit-invoice-commission"
                                        onWheel={(e) => e.target.blur()}
                                      />
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={(e) => handleSavePurchaseEdit(p.id, e)}
                                    disabled={savingEdit}
                                    className="flex-1 h-9 rounded-lg text-white"
                                    style={{ background: '#2ECC71' }}
                                    data-testid={`save-invoice-edit-${p.id}`}
                                  >
                                    {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Guardar</>}
                                  </Button>
                                  <Button
                                    size="sm" variant="outline"
                                    onClick={handleCancelEditPurchase}
                                    className="h-9 rounded-lg"
                                    data-testid={`cancel-invoice-edit-${p.id}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={p.id} className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} group hover:bg-red-50 transition-colors`}>
                          <td className="p-3 text-sm text-center text-gray-600">1</td>
                          <td className="p-3 text-sm font-medium">{p.item_name}</td>
                          <td className="p-3 text-sm text-right">${p.price.toFixed(2)}</td>
                          <td className="p-3 text-sm text-gray-600">{p.store}</td>
                          <td className="p-3 text-sm text-right">${(p.commission || 0).toFixed(2)}</td>
                          <td className="p-3 text-sm text-right font-bold">${(p.price + (p.commission || 0)).toFixed(2)}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center gap-1 justify-center">
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 hover:bg-blue-100 hover:text-blue-600 transition-all"
                                  onClick={(e) => handleStartEditPurchase(p, e)}
                                  disabled={loading}
                                  title="Editar artículo (aplica también en LIVE)"
                                  data-testid={`edit-invoice-purchase-btn-${p.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
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
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary stats below table */}
              {(() => {
                const shippingCost = currentInvoice.shipment?.shipping_cost || currentInvoice.shipping_cost || 0;
                const weightPounds = currentInvoice.shipment?.weight_pounds || currentInvoice.weight_pounds || 0;
                const totalArticulos = currentInvoice.purchases?.length || 0;
                const totalEtiqueta = currentInvoice.subtotal || 0;
                const totalCommission = currentInvoice.total_commission || 0;
                const displaySubtotal = totalEtiqueta + totalCommission;
                const taxes = currentInvoice.total_tax || 0;
                const saldoPend = parseFloat(editSaldoPendiente) || 0;
                const grandTotal = displaySubtotal + taxes + shippingCost + saldoPend;
                const appliedDeposits = currentInvoice.applied_deposits || [];
                const depositsApplied = currentInvoice.deposits_applied || 0;
                const saldoAFavorAnterior = currentInvoice.saldo_a_favor_anterior || 0;
                const totalCredits = depositsApplied + saldoAFavorAnterior;
                const totalAPagar = Math.max(0, grandTotal - totalCredits);
                const saldoAFavorResult = totalCredits > grandTotal ? round2(totalCredits - grandTotal) : 0;
                function round2(v) { return Math.round(v * 100) / 100; }

                return (
                  <>
                    {/* Artículos / Etiqueta / Peso row */}
                    <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-gray-50 border" data-testid="invoice-summary-stats">
                      <div className="text-center">
                        <p className="text-xs text-gray-500 font-semibold">Total de artículos</p>
                        <p className="font-bold text-lg" style={{ color: '#1E3A5F' }}>{totalArticulos}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500 font-semibold">Total Etiqueta</p>
                        <p className="font-bold text-lg" style={{ color: '#1E3A5F' }}>${totalEtiqueta.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        {(() => {
                          const s = currentInvoice.shipment;
                          const mode = s?.shipping_mode;
                          const qty = s?.package_count;
                          const isPounds = mode === "pounds";
                          let label, value;
                          if (isPounds) { label = "Libras"; value = `${Number(qty || 0).toFixed(1)} lb`; }
                          else if (mode === "packages" || (qty && qty > 0)) { label = "Paquetes"; value = `${qty || 0}`; }
                          else { label = "Peso en Libras"; value = `${weightPounds} lbs`; }
                          return (
                            <>
                              <p className="text-xs text-gray-500 font-semibold">{label}</p>
                              <p className="font-bold text-lg" style={{ color: '#1E3A5F' }}>{value}</p>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="flex justify-end">
                      <div className="w-80 p-4 rounded-xl bg-gray-50 space-y-2" data-testid="invoice-financial-summary">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Subtotal:</span>
                          <span className="font-medium">${totalEtiqueta.toFixed(2)}</span>
                        </div>
                        {totalCommission > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Comisiones:</span>
                            <span className="font-medium">${totalCommission.toFixed(2)}</span>
                          </div>
                        )}
                        {taxes > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Taxes:</span>
                            <span className="font-medium">${taxes.toFixed(2)}</span>
                          </div>
                        )}
                        {shippingCost > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              Envio:
                            </span>
                            <span className="font-medium text-purple-600">${shippingCost.toFixed(2)}</span>
                          </div>
                        )}
                        {/* Saldo Pendiente - editable */}
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-orange-600 font-medium">Saldo Pendiente:</span>
                          <div className="flex items-center gap-1">
                            <span className="text-orange-600">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={editSaldoPendiente}
                              onChange={(e) => setEditSaldoPendiente(e.target.value)}
                              onBlur={handleSaveSaldoPendiente}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveSaldoPendiente()}
                              className="h-7 w-24 text-right text-sm font-bold text-orange-700 rounded px-2"
                              data-testid="view-saldo-pendiente-input"
                              onWheel={(e) => e.target.blur()}
                            />
                          </div>
                        </div>
                        {/* Divider before Total */}
                        <div className="border-t border-gray-300 pt-2 mt-2">
                          <div className="flex justify-between">
                            <span className="font-bold text-gray-800">Total:</span>
                            <span className="font-bold text-xl" style={{ color: '#1E3A5F' }}>
                              ${grandTotal.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        {/* Abonos assigned to THIS invoice */}
                        {appliedDeposits.length > 0 && (
                          <div className="space-y-1 pt-1">
                            {appliedDeposits.map((dep, idx) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className="text-green-700">Abono {idx + 1}:</span>
                                <span className="font-medium text-green-700">-${dep.amount_applied.toFixed(2)}</span>
                              </div>
                            ))}
                            {appliedDeposits.length > 1 && (
                              <div className="flex justify-between text-sm border-t border-green-200 pt-1 mt-1">
                                <span className="font-bold text-green-800">Total Abonos:</span>
                                <span className="font-bold text-green-800">-${depositsApplied.toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {/* Saldo a favor from previous invoice */}
                        {saldoAFavorAnterior > 0 && (
                          <div className="flex justify-between text-sm pt-1">
                            <span className="text-blue-700">Saldo a Favor (anterior):</span>
                            <span className="font-medium text-blue-700">-${saldoAFavorAnterior.toFixed(2)}</span>
                          </div>
                        )}
                        {/* Total a pagar */}
                        <div className="border-t-2 border-gray-400 pt-2 mt-2">
                          <div className="flex justify-between">
                            <span className="font-extrabold text-gray-900">Total a pagar:</span>
                            <span className="font-extrabold text-2xl" style={{ color: totalAPagar > 0 ? '#DC2626' : '#16A34A' }}>
                              ${totalAPagar.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        {saldoAFavorResult > 0 && (
                          <div className="mt-2 p-2 rounded-lg bg-green-100 border border-green-300 text-center">
                            <p className="text-sm font-bold text-green-800">
                              Saldo a favor para próxima factura: ${saldoAFavorResult.toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Shipment Creation Prompt - Show when invoice has no shipment */}
              {currentInvoice.status !== "approved" && !currentInvoice.shipment && (
                <div className="p-4 rounded-xl bg-purple-50 border-2 border-purple-300 space-y-3">
                  <div className="flex items-start gap-3">
                    <Package className="h-6 w-6 text-purple-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-purple-800">¿Crear envío para esta factura?</p>
                      <p className="text-sm text-purple-700 mt-1">
                        El envío incluirá los {currentInvoice.purchases?.length || 0} productos de esta factura.
                        El costo del envío se agregará al total final.
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={handleGoToCreateShipment}
                    className="w-full h-10 rounded-xl bg-purple-600 hover:bg-purple-700"
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Crear Envío para esta Factura
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}

              {/* Pending alert with shipping note */}
              {currentInvoice.status !== "approved" && (
                <div className="p-4 rounded-xl bg-yellow-50 border-2 border-yellow-200">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-6 w-6 text-yellow-600" />
                    <div className="flex-1">
                      <p className="font-semibold text-yellow-800">Factura Pendiente de Pago</p>
                      <p className="text-sm text-yellow-700">Puedes quitar artículos pasando el mouse sobre ellos. Aprueba cuando esté lista.</p>
                    </div>
                  </div>
                  {/* Note about shipping cost */}
                  {!currentInvoice.shipment && !currentInvoice.shipping_cost && (
                    <div className="mt-3 p-2 rounded-lg bg-yellow-100/50 flex items-start gap-2">
                      <Info className="h-4 w-4 text-yellow-700 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-yellow-700">
                        <strong>Nota:</strong> Aún falta agregar el valor del envío. El costo de envío se mostrará una vez que crees el envío para esta factura.
                      </p>
                    </div>
                  )}
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
                    className={`p-4 rounded-xl border transition-all ${inv.is_annulled ? 'bg-red-50/30 border-red-100 hover:border-red-300 cursor-pointer' : 'hover:border-blue-300 hover:shadow-md cursor-pointer'}`}
                    onClick={() => handleViewInvoice(inv)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: inv.is_annulled ? 'rgba(220,38,38,0.1)' : 'rgba(30,58,95,0.1)' }}>
                          <FileText className="h-6 w-6" style={{ color: inv.is_annulled ? '#DC2626' : '#1E3A5F' }} />
                        </div>
                        <div>
                          <p className={`font-bold ${inv.is_annulled ? 'text-red-400 line-through' : ''}`} style={{ color: inv.is_annulled ? undefined : '#1E3A5F' }}>{inv.invoice_number}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(inv.created_at).toLocaleDateString("es-ES")} · {inv.purchase_ids?.length || 0} items
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`font-extrabold text-xl ${inv.is_annulled ? 'line-through text-red-400' : ''}`} style={{ color: inv.is_annulled ? undefined : '#1E3A5F' }}>
                            ${((inv.total || 0) + (inv.saldo_pendiente || 0) + (inv.shipping_cost || 0)).toFixed(2)}
                          </p>
                          {(inv.deposits_applied || 0) > 0 && !inv.is_annulled && (
                            <p className="text-xs text-green-600">Abonos: -${(inv.deposits_applied || 0).toFixed(2)}</p>
                          )}
                          {(inv.saldo_a_favor_anterior || 0) > 0 && !inv.is_annulled && (
                            <p className="text-xs text-blue-600">Saldo ant: -${(inv.saldo_a_favor_anterior || 0).toFixed(2)}</p>
                          )}
                          {(inv.total_a_pagar != null && inv.total_a_pagar > 0 && !inv.is_annulled) && (
                            <p className="text-xs font-bold text-red-600">A pagar: ${inv.total_a_pagar.toFixed(2)}</p>
                          )}
                          {(inv.saldo_a_favor || 0) > 0 && !inv.is_annulled && (
                            <p className="text-xs font-bold text-green-700">A favor: +${inv.saldo_a_favor.toFixed(2)}</p>
                          )}
                          {inv.is_annulled ? (
                            <Badge className="bg-red-100 text-red-700">Anulada</Badge>
                          ) : (
                            <Badge className={inv.status === "approved" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                              {inv.status === "approved" ? (
                                <><CheckCircle className="h-3 w-3 mr-1" /> Pagada</>
                              ) : (
                                <><Clock className="h-3 w-3 mr-1" /> Pendiente</>
                              )}
                            </Badge>
                          )}
                        </div>
                        {!inv.is_annulled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                            onClick={(e) => openAnnulDialog(inv.id, e)}
                            title="Eliminar factura"
                            data-testid={`annul-invoice-${inv.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </ScrollArea>

        {/* Annul Invoice Confirmation Dialog */}
        <Dialog open={annulDialogOpen} onOpenChange={(open) => { setAnnulDialogOpen(open); if (!open) setAnnulPassword(""); }}>
          <DialogContent className="max-w-sm rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Eliminar Factura
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600">
              Esta accion anulara la factura, liberara las compras y los abonos asignados. Ingresa tu contrasena de administrador para confirmar.
            </p>
            <div className="space-y-4 py-2">
              <div>
                <Input
                  type="password"
                  placeholder="Contrasena del administrador..."
                  value={annulPassword}
                  onChange={(e) => setAnnulPassword(e.target.value)}
                  className="h-11 rounded-xl"
                  data-testid="annul-password-input"
                  onKeyDown={(e) => e.key === 'Enter' && handleAnnulInvoice()}
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setAnnulDialogOpen(false)} className="flex-1 h-11 rounded-xl">
                  Cancelar
                </Button>
                <Button
                  onClick={handleAnnulInvoice}
                  disabled={annulling || !annulPassword}
                  className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
                  data-testid="confirm-annul-btn"
                >
                  {annulling ? "Eliminando..." : "Confirmar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
