import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/App";
import { 
  getAllShipments, 
  updateShipmentStatus, 
  updateTracking,
  getAllClients,
  getPendingShipmentPurchases,
  createShipment,
  uploadShipmentAttachment,
  updateShipment,
  deleteShipment,
  getMyTenant,
  getClientInvoicesForShipment
} from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import TrackingDialog from "@/components/TrackingDialog";
import ShipmentEditDialog from "@/components/ShipmentEditDialog";
import { 
  ArrowLeft, 
  Truck, 
  Package, 
  CheckCircle, 
  Clock, 
  Plus,
  MapPin,
  Phone,
  Navigation,
  Search,
  Paperclip,
  X,
  Image as ImageIcon,
  Trash2,
  FileText,
  AlertCircle,
  DollarSign,
  ChevronDown
} from "lucide-react";

const LOGO_URL_DEFAULT = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";

export default function AdminShipments() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const logoUrl = user?.tenant_logo || LOGO_URL_DEFAULT;
  
  // Check if coming from invoice
  const fromInvoice = searchParams.get('from_invoice') === 'true';
  const [invoiceData, setInvoiceData] = useState(null);
  
  // Check permissions for employees
  const permissions = user?.permissions || {};
  const isAdmin = user?.role === "admin";
  const hasPermission = isAdmin || permissions.manage_shipments === true;
  
  const [shipments, setShipments] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekFilter, setWeekFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(null);
  const [trackingNumbers, setTrackingNumbers] = useState([""]);  // Array of tracking numbers
  const [editDialogOpen, setEditDialogOpen] = useState(null);
  const [editForm, setEditForm] = useState({
    shipping_type: "",
    shipping_cost: "",
    weight_pounds: "",
    address: "",
    country: "",
    phone: "",
    additional_info: "",
    tracking_numbers: []
  });
  
  // Redirect if no permission
  useEffect(() => {
    if (!hasPermission) {
      toast.error("No tienes permiso para acceder a este módulo");
      navigate("/admin");
    }
  }, [hasPermission, navigate]);

  // Load invoice data if coming from invoice
  useEffect(() => {
    if (fromInvoice) {
      const storedData = sessionStorage.getItem('shipmentFromInvoice');
      if (storedData) {
        const parsed = JSON.parse(storedData);
        setInvoiceData(parsed);
        // Auto-open create dialog
        setCreateDialogOpen(true);
        // Clear the stored data
        sessionStorage.removeItem('shipmentFromInvoice');
      }
    }
  }, [fromInvoice]);
  
  // Create shipment form
  const [selectedClient, setSelectedClient] = useState(null);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [shipmentForm, setShipmentForm] = useState({
    shipping_type: "",
    shipping_cost: "",
    weight_pounds: "",
    package_count: "",
    address: "",
    country: "",
    phone: "",
    additional_info: ""
  });
  
  // New: Invoice selection mode
  const [shipmentSource, setShipmentSource] = useState("purchases"); // "purchases" or "invoice"
  const [clientInvoices, setClientInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  
  // Tenant settings
  const [tenantSettings, setTenantSettings] = useState({
    shipment_show_product_list: true
  });

  // Filter and sort clients
  const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name));
  const filteredClients = sortedClients.filter(client => 
    client.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    client.customer_id.toLowerCase().includes(clientSearch.toLowerCase())
  );

  useEffect(() => {
    loadData();
  }, []);

  // Auto-select client when coming from invoice
  useEffect(() => {
    if (invoiceData && clients.length > 0 && createDialogOpen) {
      // Find the client by customer_id
      const client = clients.find(c => c.customer_id === invoiceData.customer_id);
      if (client) {
        setSelectedClient(invoiceData.client || client);
        // Pre-load purchases from the invoice
        if (invoiceData.purchases && invoiceData.purchases.length > 0) {
          setPendingPurchases(invoiceData.purchases);
          setSelectedPurchases(invoiceData.purchases.map(p => p.id));
        }
      }
    }
  }, [invoiceData, clients, createDialogOpen]);

  const loadData = async () => {
    try {
      const [shipmentsRes, clientsRes, tenantRes] = await Promise.all([
        getAllShipments(),
        getAllClients(),
        getMyTenant()
      ]);
      setShipments(shipmentsRes.data);
      setClients(clientsRes.data);
      // Load tenant settings
      const productListSetting = tenantRes.data.shipment_show_product_list;
      setTenantSettings({
        shipment_show_product_list: productListSetting !== false
      });
    } catch (error) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleClientSelect = async (clientId) => {
    const client = clients.find(c => c.id === clientId);
    setSelectedClient(client);
    setSelectedPurchases([]);
    setSelectedInvoice(null);
    setClientInvoices([]);
    setShipmentSource("purchases"); // Reset to default
    
    if (client) {
      try {
        // Load both pending purchases and invoices in parallel
        const [purchasesRes, invoicesRes] = await Promise.all([
          getPendingShipmentPurchases(clientId),
          getClientInvoicesForShipment(client.customer_id)
        ]);
        
        setPendingPurchases(purchasesRes.data);
        setClientInvoices(invoicesRes.data);
        
        // Auto-select all purchases
        setSelectedPurchases(purchasesRes.data.map(p => p.id));
        setShipmentForm({
          ...shipmentForm,
          country: client.country,
          phone: client.whatsapp
        });
      } catch (error) {
        toast.error("Error al cargar datos del cliente");
      }
    }
  };
  
  const handleSelectInvoice = (invoice) => {
    setSelectedInvoice(invoice);
    // Use the purchases from the invoice
    if (invoice.purchases) {
      setPendingPurchases(invoice.purchases);
      setSelectedPurchases(invoice.purchases.map(p => p.id));
    }
  };

  const handleCreateShipment = async () => {
    // When product list is hidden, use all pending purchases
    const purchasesToSend = tenantSettings.shipment_show_product_list 
      ? selectedPurchases 
      : pendingPurchases.map(p => p.id);
    
    // Validate each field and show specific error
    if (!selectedClient) {
      toast.error("Selecciona un cliente");
      return;
    }
    if (purchasesToSend.length === 0) {
      toast.error("No hay compras pendientes para enviar");
      return;
    }
    if (!shipmentForm.shipping_type) {
      toast.error("Selecciona el tipo de envío");
      return;
    }
    if (!shipmentForm.shipping_cost) {
      toast.error("Ingresa el costo de envío");
      return;
    }

    const cost = parseFloat(shipmentForm.shipping_cost);
    if (isNaN(cost) || cost < 0) {
      toast.error("Ingresa un costo de envío válido");
      return;
    }

    const weight = parseFloat(shipmentForm.weight_pounds) || 0;

    try {
      const response = await createShipment({
        user_id: selectedClient.id,
        purchase_ids: purchasesToSend,
        shipping_type: shipmentForm.shipping_type,
        shipping_cost: cost,
        weight_pounds: weight,
        package_count: parseInt(shipmentForm.package_count) || 0,
        address: shipmentForm.address,
        country: shipmentForm.country,
        phone: shipmentForm.phone,
        additional_info: shipmentForm.additional_info,
        invoice_id: selectedInvoice?.id || invoiceData?.invoice_id || null
      });
      
      const shipmentId = response.data.shipment_id;
      
      // Upload attachments if any
      if (attachmentFiles.length > 0) {
        for (const file of attachmentFiles) {
          try {
            await uploadShipmentAttachment(shipmentId, file);
          } catch (err) {
            console.error("Error uploading attachment:", err);
          }
        }
        toast.success(`Envío creado con ${attachmentFiles.length} archivo(s) adjunto(s)`);
      } else {
        toast.success("Envío creado exitosamente");
      }
      
      setCreateDialogOpen(false);
      setSelectedClient(null);
      setPendingPurchases([]);
      setSelectedPurchases([]);
      setClientSearch("");
      setAttachmentFiles([]);
      setSelectedInvoice(null);
      setClientInvoices([]);
      setShipmentSource("purchases");
      setShipmentForm({
        shipping_type: "",
        shipping_cost: "",
        weight_pounds: "",
        package_count: "",
        address: "",
        country: "",
        phone: "",
        additional_info: ""
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear envío");
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setAttachmentFiles([...attachmentFiles, ...files]);
  };

  const removeAttachment = (index) => {
    setAttachmentFiles(attachmentFiles.filter((_, i) => i !== index));
  };

  const handleUpdateStatus = async (shipmentId, newStatus) => {
    try {
      await updateShipmentStatus(shipmentId, newStatus);
      toast.success(`Estado actualizado a: ${getStatusLabel(newStatus)}`);
      loadData();
    } catch (error) {
      toast.error("Error al actualizar estado");
    }
  };

  const handleUpdateTracking = async (shipmentId) => {
    // Filter out empty tracking numbers
    const validTrackings = trackingNumbers.filter(t => t.trim());
    
    if (validTrackings.length === 0) {
      toast.error("Ingresa al menos un número de tracking");
      return;
    }
    
    try {
      await updateTracking(shipmentId, { tracking_numbers: validTrackings });
      toast.success(`${validTrackings.length} tracking(s) guardado(s)`);
      setTrackingDialogOpen(null);
      setTrackingNumbers([""]);
      loadData();
    } catch (error) {
      toast.error("Error al actualizar tracking");
    }
  };

  const handleOpenTrackingDialog = (shipment) => {
    // Load existing tracking numbers or start with one empty field
    const existingTrackings = shipment.tracking_numbers?.length > 0 
      ? shipment.tracking_numbers 
      : (shipment.tracking_number ? [shipment.tracking_number] : [""]);
    setTrackingNumbers(existingTrackings.length > 0 ? existingTrackings : [""]);
    setTrackingDialogOpen(shipment.id);
  };

  const addTrackingField = () => {
    setTrackingNumbers([...trackingNumbers, ""]);
  };

  const removeTrackingField = (index) => {
    if (trackingNumbers.length > 1) {
      setTrackingNumbers(trackingNumbers.filter((_, i) => i !== index));
    }
  };

  const updateTrackingField = (index, value) => {
    const updated = [...trackingNumbers];
    updated[index] = value;
    setTrackingNumbers(updated);
  };

  const handleOpenEditDialog = (shipment) => {
    setEditForm({
      shipping_type: shipment.shipping_type || "",
      shipping_cost: shipment.shipping_cost?.toString() || "",
      weight_pounds: shipment.weight_pounds?.toString() || "",
      address: shipment.address || "",
      country: shipment.country || "",
      phone: shipment.phone || "",
      additional_info: shipment.additional_info || "",
      tracking_numbers: shipment.tracking_numbers?.length > 0 
        ? shipment.tracking_numbers 
        : (shipment.tracking_number ? [shipment.tracking_number] : [])
    });
    setEditDialogOpen(shipment.id);
  };

  const handleSaveEdit = async (shipmentId) => {
    try {
      const data = {
        ...editForm,
        shipping_cost: parseFloat(editForm.shipping_cost) || 0,
        weight_pounds: parseFloat(editForm.weight_pounds) || 0,
        tracking_numbers: editForm.tracking_numbers?.filter(t => t.trim()) || [],
        tracking_number: editForm.tracking_numbers?.[0] || null  // Keep first one for backwards compatibility
      };
      await updateShipment(shipmentId, data);
      toast.success("Envío actualizado");
      setEditDialogOpen(null);
      loadData();
    } catch (error) {
      toast.error("Error al actualizar envío");
    }
  };

  const handleDeleteShipment = async (shipmentId) => {
    if (!window.confirm("¿Estás seguro de eliminar este envío?")) return;
    try {
      await deleteShipment(shipmentId);
      toast.success("Envío eliminado");
      loadData();
    } catch (error) {
      toast.error("Error al eliminar envío");
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      preparing: "Preparando",
      in_transit: "En Tránsito",
      delivered: "Entregado"
    };
    return labels[status] || status;
  };

  const getStatusBadge = (status) => {
    const styles = {
      preparing: "bg-yellow-100 text-yellow-800",
      in_transit: "bg-blue-100 text-blue-800",
      delivered: "bg-green-100 text-green-800"
    };
    return (
      <Badge className={`${styles[status]} font-medium`}>
        {getStatusLabel(status)}
      </Badge>
    );
  };

  const filterByStatus = (status) => {
    const getWeekKey = (dateStr) => {
      const d = new Date(dateStr);
      const day = d.getDay();
      const sunday = new Date(d);
      sunday.setDate(d.getDate() - day);
      sunday.setHours(0, 0, 0, 0);
      return sunday.toISOString().slice(0, 10);
    };
    let filtered = shipments;
    if (weekFilter !== "all") {
      filtered = filtered.filter(s => getWeekKey(s.created_at) === weekFilter);
    }
    if (status !== "all") {
      filtered = filtered.filter(s => s.status === status);
    }
    return filtered;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="app-bg">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/admin")}
              data-testid="back-btn"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="bg-white rounded-lg p-1">
              <img src={logoUrl} alt="Logo" className="h-10 object-contain logo-transparent" />
            </div>
            <span className="font-bold text-slate-800">Envíos</span>
          </div>
          
          <Dialog open={createDialogOpen} onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) {
              // Clear all state when closing dialog
              setInvoiceData(null);
              setSelectedClient(null);
              setPendingPurchases([]);
              setSelectedPurchases([]);
              setSelectedInvoice(null);
              setClientInvoices([]);
              setShipmentSource("purchases");
              setClientSearch("");
            }
          }}>
            <DialogTrigger asChild>
              <Button 
                className="font-bold rounded-xl" style={{ background: '#1E3A5F', color: 'white' }}
                data-testid="create-shipment-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {invoiceData ? "Crear Envío para Factura" : "Crear Nuevo Envío"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {/* Invoice Info Banner - when coming from invoice */}
                {invoiceData && (
                  <div className="p-4 rounded-xl bg-purple-50 border-2 border-purple-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-purple-600" />
                      <span className="font-semibold text-purple-800">Factura #{invoiceData.invoice_number}</span>
                    </div>
                    <p className="text-sm text-purple-700">
                      Este envío incluirá los <strong>{invoiceData.purchases?.length || 0} productos</strong> de la factura seleccionada.
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge className="bg-purple-100 text-purple-700">
                        Subtotal: ${invoiceData.subtotal?.toFixed(2)}
                      </Badge>
                      <Badge className="bg-purple-100 text-purple-700">
                        Total: ${invoiceData.total?.toFixed(2)}
                      </Badge>
                    </div>
                    <div className="p-2 bg-purple-100 rounded-lg flex items-start gap-2 mt-2">
                      <AlertCircle className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-purple-700">
                        El costo de envío se agregará a la factura final automáticamente.
                      </p>
                    </div>
                  </div>
                )}

                {/* Client Select with Search - disabled when coming from invoice */}
                <div>
                  <Label>Cliente</Label>
                  {invoiceData ? (
                    <div className="mt-1 p-3 bg-blue-50 rounded-xl border border-blue-200">
                      <span className="font-bold text-blue-800">#{invoiceData.customer_id}</span>
                      <span className="text-blue-700 ml-2">{invoiceData.client_name}</span>
                    </div>
                  ) : (
                    <Select onValueChange={handleClientSelect}>
                      <SelectTrigger className="h-12 rounded-xl mt-1 text-slate-800" data-testid="select-client">
                        <SelectValue placeholder="Seleccionar cliente" className="text-slate-800" />
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        {/* Search Input */}
                        <div className="p-2 border-b sticky top-0 bg-white">
                          <Input
                            placeholder="Buscar cliente..."
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            className="h-10 rounded-lg"
                            data-testid="client-search-input"
                          />
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {filteredClients.length === 0 ? (
                            <div className="p-4 text-center text-gray-500 text-sm">
                              No se encontraron clientes
                            </div>
                          ) : (
                            filteredClients.map((client) => (
                              <SelectItem 
                                key={client.id} 
                                value={client.id}
                                className="text-slate-800 cursor-pointer hover:bg-gray-100"
                              >
                                <span className="font-medium text-slate-800">#{client.customer_id}</span>
                                <span className="text-slate-600 ml-2">{client.name}</span>
                              </SelectItem>
                            ))
                          )}
                        </div>
                      </SelectContent>
                    </Select>
                  )}
                  {selectedClient && !invoiceData && (
                    <div className="mt-2 p-2 bg-blue-50 rounded-lg text-sm text-blue-800">
                      Seleccionado: <span className="font-bold">#{selectedClient.customer_id} - {selectedClient.name}</span>
                    </div>
                  )}
                </div>

                {/* Source Selection: Purchases or Invoice */}
                {selectedClient && !invoiceData && (
                  <div className="space-y-3">
                    <Label>Origen de los productos</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShipmentSource("purchases");
                          setSelectedInvoice(null);
                          // Reload pending purchases
                          getPendingShipmentPurchases(selectedClient.id).then(res => {
                            setPendingPurchases(res.data);
                            setSelectedPurchases(res.data.map(p => p.id));
                          });
                        }}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          shipmentSource === "purchases" 
                            ? "border-blue-500 bg-blue-50" 
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Package className={`h-5 w-5 ${shipmentSource === "purchases" ? "text-blue-600" : "text-gray-400"}`} />
                          <span className={`font-medium ${shipmentSource === "purchases" ? "text-blue-800" : "text-gray-700"}`}>
                            Compras Pendientes
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Enviar productos sin factura</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShipmentSource("invoice");
                          setSelectedInvoice(null);
                          setPendingPurchases([]);
                          setSelectedPurchases([]);
                        }}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          shipmentSource === "invoice" 
                            ? "border-purple-500 bg-purple-50" 
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className={`h-5 w-5 ${shipmentSource === "invoice" ? "text-purple-600" : "text-gray-400"}`} />
                          <span className={`font-medium ${shipmentSource === "invoice" ? "text-purple-800" : "text-gray-700"}`}>
                            Desde Factura
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Seleccionar factura existente</p>
                      </button>
                    </div>
                  </div>
                )}

                {/* Invoice Selection */}
                {selectedClient && shipmentSource === "invoice" && !invoiceData && (
                  <div className="space-y-3">
                    <Label>Seleccionar Factura ({clientInvoices.length} disponibles)</Label>
                    {clientInvoices.length === 0 ? (
                      <div className="p-4 rounded-xl bg-gray-50 border border-dashed border-gray-300 text-center">
                        <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No hay facturas pendientes de envío</p>
                        <p className="text-xs text-gray-400 mt-1">Las facturas ya enviadas no aparecen aquí</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {clientInvoices.map((invoice) => (
                          <div
                            key={invoice.id}
                            onClick={() => handleSelectInvoice(invoice)}
                            className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                              selectedInvoice?.id === invoice.id
                                ? "border-purple-500 bg-purple-50"
                                : "border-gray-200 hover:border-purple-300 bg-white"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-purple-700">{invoice.invoice_number}</span>
                                  <Badge className={invoice.status === "approved" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
                                    {invoice.status === "approved" ? "Pagada" : "Pendiente"}
                                  </Badge>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  {invoice.purchase_count || invoice.purchase_ids?.length || 0} productos • {new Date(invoice.created_at).toLocaleDateString("es-ES")}
                                </p>
                              </div>
                              <span className="font-bold text-lg" style={{ color: '#1E3A5F' }}>
                                ${invoice.total?.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Selected Invoice Info */}
                    {selectedInvoice && (
                      <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4 text-purple-600" />
                          <span className="font-semibold text-purple-800">Factura {selectedInvoice.invoice_number}</span>
                        </div>
                        <p className="text-sm text-purple-700">
                          <strong>{selectedInvoice.purchases?.length || 0}</strong> productos incluidos • Total: <strong>${selectedInvoice.total?.toFixed(2)}</strong>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Pending Purchases - only show when source is "purchases" or when coming from invoice */}
                {selectedClient && (shipmentSource === "purchases" || invoiceData) && (
                  <>
                    {tenantSettings.shipment_show_product_list ? (
                      <div>
                        <Label>Compras a enviar ({pendingPurchases.length} disponibles)</Label>
                        {pendingPurchases.length === 0 ? (
                          <p className="text-sm text-gray-500 mt-2">No hay compras pendientes de envío</p>
                        ) : (
                          <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                            {pendingPurchases.map((purchase) => (
                              <label 
                                key={purchase.id}
                                className={`flex items-center p-3 rounded-xl border cursor-pointer transition-colors ${
                                  selectedPurchases.includes(purchase.id) 
                                    ? 'bg-red-50 border-red-200' 
                                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPurchases.includes(purchase.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedPurchases([...selectedPurchases, purchase.id]);
                                    } else {
                                      setSelectedPurchases(selectedPurchases.filter(id => id !== purchase.id));
                                    }
                                  }}
                                  className="mr-3"
                                />
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{purchase.item_name}</p>
                                  <p className="text-xs text-gray-500">{purchase.store}</p>
                                </div>
                                <span className="font-bold text-red-600">${purchase.price.toFixed(2)}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-blue-50 rounded-xl">
                        <p className="text-sm text-blue-800">
                          <span className="font-bold">{pendingPurchases.length}</span> compras pendientes serán incluidas automáticamente en este envío.
                        </p>
                      </div>
                    )}

                    {/* Shipping Type */}
                    <div>
                      <Label>Tipo de Envío</Label>
                      <Select 
                        value={shipmentForm.shipping_type}
                        onValueChange={(value) => setShipmentForm({ ...shipmentForm, shipping_type: value })}
                      >
                        <SelectTrigger className="h-12 rounded-xl mt-1" data-testid="select-shipping-type">
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="with_family">Con Familiar en USA</SelectItem>
                          <SelectItem value="without_family">Sin Familiar en USA</SelectItem>
                          <SelectItem value="custom">Personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Shipping Cost - Custom */}
                    <div>
                      <Label>Costo de Envío (USD) *</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="Ej: 32, 52, o personalizado"
                        value={shipmentForm.shipping_cost}
                        onChange={(e) => setShipmentForm({ ...shipmentForm, shipping_cost: e.target.value })}
                        onWheel={(e) => e.target.blur()}
                        className="h-12 rounded-xl mt-1 text-xl font-bold"
                        data-testid="shipping-cost-input"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Define el precio según el cliente y el envío
                      </p>
                    </div>

                    {/* Weight in Pounds */}
                    <div>
                      <Label>Peso del Envío (Libras)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        placeholder="Ej: 5.5"
                        value={shipmentForm.weight_pounds}
                        onChange={(e) => setShipmentForm({ ...shipmentForm, weight_pounds: e.target.value })}
                        onWheel={(e) => e.target.blur()}
                        className="h-12 rounded-xl mt-1"
                        data-testid="shipping-weight-input"
                      />
                    </div>

                    {/* Package Count */}
                    <div>
                      <Label>Número de Paquetes</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        placeholder="Ej: 2"
                        value={shipmentForm.package_count}
                        onChange={(e) => setShipmentForm({ ...shipmentForm, package_count: e.target.value })}
                        onWheel={(e) => e.target.blur()}
                        className="h-12 rounded-xl mt-1"
                        data-testid="shipping-package-count-input"
                      />
                    </div>

                    {/* Total Cost Display */}
                    {selectedPurchases.length > 0 && (
                      <div className="bg-gradient-to-r from-[#1E3A5F] to-[#2a4a73] rounded-xl p-4 text-white">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium">Total a Recargar:</span>
                          <span className="text-2xl font-extrabold" data-testid="total-shipment-cost">
                            ${(
                              pendingPurchases
                                .filter(p => selectedPurchases.includes(p.id))
                                .reduce((sum, p) => sum + (p.total_price || (p.price + (p.tax || 0) + (p.commission || 0))), 0) +
                              (parseFloat(shipmentForm.shipping_cost) || 0)
                            ).toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-white/70 text-right">
                          (Precio incluye: Impuestos, comisión y envío)
                        </p>
                      </div>
                    )}

                    {/* Address - Optional */}
                    <div>
                      <Label className="text-gray-600">Dirección Completa (opcional)</Label>
                      <Textarea
                        placeholder="Calle, número, ciudad..."
                        value={shipmentForm.address}
                        onChange={(e) => setShipmentForm({ ...shipmentForm, address: e.target.value })}
                        className="mt-1 rounded-xl"
                        data-testid="shipment-address"
                      />
                    </div>

                    {/* Country & Phone - Optional */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-gray-600">País (opcional)</Label>
                        <Input
                          placeholder="Ecuador"
                          value={shipmentForm.country}
                          onChange={(e) => setShipmentForm({ ...shipmentForm, country: e.target.value })}
                          className="h-12 rounded-xl mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-gray-600">Teléfono (opcional)</Label>
                        <Input
                          placeholder="+593..."
                          value={shipmentForm.phone}
                          onChange={(e) => setShipmentForm({ ...shipmentForm, phone: e.target.value })}
                          className="h-12 rounded-xl mt-1"
                        />
                      </div>
                    </div>

                    {/* Additional Info */}
                    <div>
                      <Label>Información Adicional (opcional)</Label>
                      <Textarea
                        placeholder="Notas adicionales..."
                        value={shipmentForm.additional_info}
                        onChange={(e) => setShipmentForm({ ...shipmentForm, additional_info: e.target.value })}
                        className="mt-1 rounded-xl"
                      />
                    </div>

                    {/* Attachments */}
                    <div>
                      <Label className="flex items-center gap-2">
                        <Paperclip className="h-4 w-4" />
                        Archivos Adjuntos (opcional)
                      </Label>
                      <p className="text-xs text-gray-500 mb-2">Pruebas de envío, fotos de paquetes, etc.</p>
                      
                      <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center">
                        <input
                          type="file"
                          multiple
                          accept="image/*,video/*,.pdf"
                          onChange={handleFileSelect}
                          className="hidden"
                          id="attachment-input"
                          data-testid="attachment-input"
                        />
                        <label 
                          htmlFor="attachment-input" 
                          className="cursor-pointer flex flex-col items-center"
                        >
                          <ImageIcon className="h-8 w-8 text-gray-400 mb-2" />
                          <span className="text-sm text-gray-600">Click para agregar archivos</span>
                          <span className="text-xs text-gray-400">Imágenes, videos o PDF</span>
                        </label>
                      </div>

                      {/* Preview selected files */}
                      {attachmentFiles.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {attachmentFiles.map((file, index) => (
                            <div key={index} className="flex items-center justify-between bg-gray-100 rounded-lg p-2">
                              <div className="flex items-center gap-2">
                                <ImageIcon className="h-4 w-4 text-gray-500" />
                                <span className="text-sm text-gray-700 truncate max-w-[200px]">{file.name}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeAttachment(index)}
                                className="h-6 w-6 p-0"
                              >
                                <X className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button
                      onClick={handleCreateShipment}
                      className="w-full h-12 font-bold rounded-xl" style={{ background: '#1E3A5F', color: 'white' }}
                      data-testid="submit-shipment-btn"
                    >
                      <Truck className="h-5 w-5 mr-2" />
                      Crear Envío
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Week Filter */}
        {(() => {
          // Generate week options from shipments
          const getWeekKey = (dateStr) => {
            const d = new Date(dateStr);
            const day = d.getDay();
            const sunday = new Date(d);
            sunday.setDate(d.getDate() - day);
            sunday.setHours(0, 0, 0, 0);
            return sunday.toISOString().slice(0, 10);
          };
          const getWeekLabel = (dateStr) => {
            const d = new Date(dateStr);
            const day = d.getDay();
            const sunday = new Date(d);
            sunday.setDate(d.getDate() - day);
            const saturday = new Date(sunday);
            saturday.setDate(sunday.getDate() + 6);
            const fmt = (dt) => dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            return `${fmt(sunday)} - ${fmt(saturday)}`;
          };

          const weeks = {};
          shipments.forEach(s => {
            const key = getWeekKey(s.created_at);
            if (!weeks[key]) weeks[key] = { label: getWeekLabel(s.created_at), total: 0, count: 0 };
            weeks[key].total += s.shipping_cost || 0;
            weeks[key].count++;
          });
          const weekList = Object.entries(weeks).sort((a, b) => b[0].localeCompare(a[0]));

          const filtered = weekFilter === "all" ? shipments : shipments.filter(s => getWeekKey(s.created_at) === weekFilter);
          const totalShipping = filtered.reduce((sum, s) => sum + (s.shipping_cost || 0), 0);
          const totalWeight = filtered.reduce((sum, s) => sum + (s.weight_pounds || 0), 0);

          return (
            <>
              {/* Total shipping + week selector */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <Card className="rounded-xl flex-1 bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-200 rounded-xl flex items-center justify-center">
                        <DollarSign className="h-5 w-5 text-purple-700" />
                      </div>
                      <div>
                        <p className="text-2xl font-extrabold text-purple-800">${totalShipping.toFixed(2)}</p>
                        <p className="text-xs text-purple-600">Envios ({filtered.length}) · {totalWeight.toFixed(1)} lbs</p>
                      </div>
                    </div>
                    <Select value={weekFilter} onValueChange={setWeekFilter}>
                      <SelectTrigger className="w-48 h-9 rounded-lg text-xs bg-white" data-testid="week-filter">
                        <SelectValue placeholder="Filtrar por semana" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las semanas</SelectItem>
                        {weekList.map(([key, w]) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {w.label} ({w.count}) · ${w.total.toFixed(0)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              </div>

              {/* Status Stats */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                <Card className="rounded-xl">
                  <CardContent className="p-3 text-center">
                    <Clock className="h-5 w-5 text-yellow-600 mx-auto mb-1" />
                    <p className="text-2xl font-extrabold text-slate-800">
                      {filtered.filter(s => s.status === "preparing").length}
                    </p>
                    <p className="text-xs text-gray-500">Preparando</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl">
                  <CardContent className="p-3 text-center">
                    <Truck className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                    <p className="text-2xl font-extrabold text-slate-800">
                      {filtered.filter(s => s.status === "in_transit").length}
                    </p>
                    <p className="text-xs text-gray-500">En Transito</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl">
                  <CardContent className="p-3 text-center">
                    <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
                    <p className="text-2xl font-extrabold text-slate-800">
                      {filtered.filter(s => s.status === "delivered").length}
                    </p>
                    <p className="text-xs text-gray-500">Entregados</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl">
                  <CardContent className="p-3 text-center">
                    <Package className="h-5 w-5 text-orange-600 mx-auto mb-1" />
                    <p className="text-2xl font-extrabold text-slate-800">
                      {filtered.reduce((total, s) => total + Math.ceil((s.weight_pounds || 0) / 8), 0)}
                    </p>
                    <p className="text-xs text-gray-500">Paquetes</p>
                  </CardContent>
                </Card>
              </div>
            </>
          );
        })()}

        {/* Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-gray-100 rounded-xl p-1 h-auto mb-4">
            <TabsTrigger value="all" className="data-[state=active]:bg-white rounded-lg py-2 text-xs">
              Todos
            </TabsTrigger>
            <TabsTrigger value="preparing" className="data-[state=active]:bg-white rounded-lg py-2 text-xs">
              Preparando
            </TabsTrigger>
            <TabsTrigger value="in_transit" className="data-[state=active]:bg-white rounded-lg py-2 text-xs">
              Tránsito
            </TabsTrigger>
            <TabsTrigger value="delivered" className="data-[state=active]:bg-white rounded-lg py-2 text-xs">
              Entregados
            </TabsTrigger>
          </TabsList>

          {["all", "preparing", "in_transit", "delivered"].map((tabValue) => (
            <TabsContent key={tabValue} value={tabValue}>
              <ScrollArea className="h-[calc(100vh-400px)]">
                {filterByStatus(tabValue).length === 0 ? (
                  <Card className="rounded-2xl border-dashed border-2 border-gray-200">
                    <CardContent className="p-8 text-center">
                      <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No hay envíos</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {filterByStatus(tabValue).map((shipment) => (
                      <Card key={shipment.id} className="rounded-xl" data-testid="shipment-item">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="font-bold">
                                  #{shipment.customer_id}
                                </Badge>
                                <span className="font-bold text-slate-800">{shipment.user_name}</span>
                              </div>
                              <p className="text-sm text-gray-500">
                                {shipment.shipping_type === 'with_family' ? 'Con Familiar USA' : 'Sin Familiar USA'}
                                {' - '}${shipment.shipping_cost.toFixed(2)}
                                {shipment.weight_pounds > 0 && ` - ${shipment.weight_pounds} lbs`}
                              </p>
                            </div>
                            {getStatusBadge(shipment.status)}
                          </div>

                          <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                              <p className="text-sm text-gray-600">{shipment.address}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-gray-400" />
                              <p className="text-sm text-gray-600">{shipment.phone}</p>
                            </div>
                            {/* Show multiple tracking numbers */}
                            {(shipment.tracking_numbers?.length > 0 || shipment.tracking_number) && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Navigation className="h-4 w-4 text-gray-400" />
                                  <span className="text-xs text-gray-500 font-medium">
                                    {(shipment.tracking_numbers?.length || 1)} paquete(s):
                                  </span>
                                </div>
                                {shipment.tracking_numbers?.length > 0 ? (
                                  shipment.tracking_numbers.map((tracking, idx) => (
                                    <div key={idx} className="ml-6 flex items-center gap-2">
                                      <Package className="h-3 w-3 text-blue-500" />
                                      <p className="text-sm font-mono font-bold text-blue-700">{tracking}</p>
                                    </div>
                                  ))
                                ) : shipment.tracking_number && (
                                  <div className="ml-6 flex items-center gap-2">
                                    <Package className="h-3 w-3 text-blue-500" />
                                    <p className="text-sm font-mono font-bold text-blue-700">{shipment.tracking_number}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2 items-center">
                            {/* Status Selector */}
                            <div className="flex-1">
                              <Select
                                value={shipment.status}
                                onValueChange={(value) => handleUpdateStatus(shipment.id, value)}
                                data-testid={`status-select-${shipment.id}`}
                              >
                                <SelectTrigger className="h-10 rounded-lg">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="preparing">
                                    <span className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-yellow-600" /> Preparación
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="in_transit">
                                    <span className="flex items-center gap-2">
                                      <Truck className="h-4 w-4 text-blue-600" /> En Tránsito
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="delivered">
                                    <span className="flex items-center gap-2">
                                      <CheckCircle className="h-4 w-4 text-green-600" /> Completado
                                    </span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Tracking Button - Using separate component */}
                            <TrackingDialog
                              shipment={shipment}
                              trackingDialogOpen={trackingDialogOpen}
                              setTrackingDialogOpen={setTrackingDialogOpen}
                              trackingNumbers={trackingNumbers}
                              setTrackingNumbers={setTrackingNumbers}
                              handleOpenTrackingDialog={handleOpenTrackingDialog}
                              handleUpdateTracking={handleUpdateTracking}
                              addTrackingField={addTrackingField}
                              removeTrackingField={removeTrackingField}
                              updateTrackingField={updateTrackingField}
                            />

                            {/* Edit Button - Using separate component */}
                            <ShipmentEditDialog
                              shipment={shipment}
                              editDialogOpen={editDialogOpen}
                              setEditDialogOpen={setEditDialogOpen}
                              editForm={editForm}
                              setEditForm={setEditForm}
                              handleOpenEditDialog={handleOpenEditDialog}
                              handleSaveEdit={handleSaveEdit}
                            />

                            {/* Delete Button */}
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="rounded-lg text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleDeleteShipment(shipment.id)}
                              data-testid={`delete-shipment-${shipment.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
