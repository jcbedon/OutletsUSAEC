import { useState, useEffect, useRef } from "react";
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
  getClientInvoicesForShipment,
  createUploadSession,
  getUploadSession,
  attachSessionFilesToShipment
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
  ChevronDown,
  Smartphone,
  RefreshCw
} from "lucide-react";
import QRCode from "qrcode";
import axios from "axios";

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
  const [customerFilter, setCustomerFilter] = useState("");
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
    shipping_category: "",  // "G" | "A" | "B" | "OTHER"
    custom_unit_cost: "",   // Only used when category === "OTHER"
    package_count: "1",
    address: "",
    country: "",
    phone: "",
    additional_info: ""
  });

  // New: Invoice selection (required for every shipment)
  const [clientInvoices, setClientInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Tenant settings (includes shipping_categories)
  const [tenantSettings, setTenantSettings] = useState({
    shipment_show_product_list: true,
    shipping_mode: "packages",
    shipping_categories: [
      { key: "G", label: "Categoría G (CON Núcleo Familiar)", value_packages: 32, value_pounds: 32 },
      { key: "A", label: "Categoría A (Personal)", value_packages: 42, value_pounds: 42 },
      { key: "B", label: "Categoría B (SIN Núcleo Familiar)", value_packages: 52, value_pounds: 52 }
    ]
  });

  // Mobile QR upload session
  const [uploadSession, setUploadSession] = useState(null); // {token, url, qr_data_url, expires_at}
  const [remoteFiles, setRemoteFiles] = useState([]); // files uploaded via mobile
  const pollingRef = useRef(null);

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

  // Create upload session when dialog opens; clean up when it closes
  useEffect(() => {
    let cancelled = false;
    const cleanup = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
    if (createDialogOpen && !uploadSession) {
      (async () => {
        try {
          const res = await createUploadSession();
          if (cancelled) return;
          const { token, expires_at } = res.data;
          const origin = window.location.origin;
          const mobileUrl = `${origin}/m/upload/${token}`;
          const qrDataUrl = await QRCode.toDataURL(mobileUrl, {
            width: 220, margin: 1, color: { dark: "#0F172A", light: "#FFFFFF" }
          });
          if (cancelled) return;
          setUploadSession({ token, url: mobileUrl, qr_data_url: qrDataUrl, expires_at });
        } catch (err) {
          // non-critical; silent fail (QR just won't show)
          console.error("No se pudo crear la sesión de subida:", err);
        }
      })();
    }
    if (!createDialogOpen) {
      setUploadSession(null);
      setRemoteFiles([]);
      cleanup();
    }
    return cleanup;
  }, [createDialogOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for files uploaded via mobile
  useEffect(() => {
    if (!uploadSession?.token || !createDialogOpen) return;
    const tick = async () => {
      try {
        const res = await getUploadSession(uploadSession.token);
        const files = res.data.files || [];
        if (files.length !== remoteFiles.length) {
          if (files.length > remoteFiles.length) {
            const diff = files.length - remoteFiles.length;
            toast.success(`${diff} archivo(s) recibido(s) desde el teléfono`);
          }
          setRemoteFiles(files);
        }
      } catch (err) {
        // ignore; session may expire naturally
      }
    };
    pollingRef.current = setInterval(tick, 3000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [uploadSession?.token, createDialogOpen, remoteFiles.length]);

  const loadData = async () => {
    try {
      const [shipmentsRes, clientsRes, tenantRes] = await Promise.all([
        getAllShipments(),
        getAllClients(),
        getMyTenant()
      ]);
      setShipments(shipmentsRes.data);
      setClients(clientsRes.data);
      // Load tenant settings including shipping categories
      const productListSetting = tenantRes.data.shipment_show_product_list;
      const categories = Array.isArray(tenantRes.data.shipping_categories) && tenantRes.data.shipping_categories.length > 0
        ? tenantRes.data.shipping_categories
        : tenantSettings.shipping_categories;
      setTenantSettings({
        shipment_show_product_list: productListSetting !== false,
        shipping_mode: tenantRes.data.shipping_mode === "pounds" ? "pounds" : "packages",
        shipping_categories: categories
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
    setPendingPurchases([]);

    if (client) {
      try {
        setLoadingInvoices(true);
        const invoicesRes = await getClientInvoicesForShipment(client.customer_id);
        setClientInvoices(invoicesRes.data);
        setShipmentForm(prev => ({
          ...prev,
          country: client.country || prev.country,
          phone: client.whatsapp || prev.phone
        }));
      } catch (error) {
        toast.error("Error al cargar facturas del cliente");
      } finally {
        setLoadingInvoices(false);
      }
    }
  };

  const handleSelectInvoice = (invoice) => {
    setSelectedInvoice(invoice);
    if (invoice?.purchases) {
      setPendingPurchases(invoice.purchases);
      setSelectedPurchases(invoice.purchases.map(p => p.id));
    } else {
      setPendingPurchases([]);
      setSelectedPurchases([]);
    }
  };

  const getUnitCost = () => {
    if (!shipmentForm.shipping_category) return 0;
    if (shipmentForm.shipping_category === "OTHER") {
      return parseFloat(shipmentForm.custom_unit_cost) || 0;
    }
    const cat = tenantSettings.shipping_categories.find(c => c.key === shipmentForm.shipping_category);
    if (!cat) return 0;
    const priceField = tenantSettings.shipping_mode === "pounds" ? "value_pounds" : "value_packages";
    const price = cat[priceField] ?? cat.value ?? 0;
    return parseFloat(price) || 0;
  };

  const getTotalShippingCost = () => {
    const unit = getUnitCost();
    const rawQty = parseFloat(shipmentForm.package_count) || 1;
    const qty = tenantSettings.shipping_mode === "pounds"
      ? Math.max(rawQty, 0.01)
      : Math.max(Math.round(rawQty), 1);
    return Math.round(unit * qty * 100) / 100;
  };

  const handleCreateShipment = async () => {
    // Validate
    if (!selectedClient) {
      toast.error("Selecciona un cliente");
      return;
    }
    const invoiceId = selectedInvoice?.id || invoiceData?.invoice_id;
    if (!invoiceId) {
      toast.error("Selecciona una factura para este envío");
      return;
    }
    if (!shipmentForm.shipping_category) {
      toast.error("Selecciona una categoría de envío");
      return;
    }
    if (shipmentForm.shipping_category === "OTHER") {
      const v = parseFloat(shipmentForm.custom_unit_cost);
      if (isNaN(v) || v < 0) {
        toast.error("Ingresa un costo personalizado válido");
        return;
      }
    }
    const rawQty = parseFloat(shipmentForm.package_count) || 1;
    const packageCount = tenantSettings.shipping_mode === "pounds"
      ? Math.max(rawQty, 0.01)
      : Math.max(Math.round(rawQty), 1);
    const unitCost = getUnitCost();
    const totalCost = Math.round(unitCost * packageCount * 100) / 100;

    // Shipment purchases come from the selected invoice
    const purchasesToSend = (selectedInvoice?.purchases || pendingPurchases).map(p => p.id);
    if (purchasesToSend.length === 0) {
      toast.error("La factura seleccionada no tiene productos");
      return;
    }

    try {
      const response = await createShipment({
        user_id: selectedClient.id,
        purchase_ids: purchasesToSend,
        shipping_category: shipmentForm.shipping_category,
        shipping_unit_cost: unitCost,
        shipping_cost: totalCost,
        package_count: packageCount,
        address: shipmentForm.address,
        country: shipmentForm.country,
        phone: shipmentForm.phone,
        additional_info: shipmentForm.additional_info,
        invoice_id: invoiceId
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
      }

      // Attach files uploaded via QR/mobile session (if any)
      let remoteCount = 0;
      if (uploadSession?.token && remoteFiles.length > 0) {
        try {
          const res = await attachSessionFilesToShipment(shipmentId, uploadSession.token);
          remoteCount = res.data?.attached_count || remoteFiles.length;
        } catch (err) {
          console.error("Error attaching session files:", err);
        }
      }

      const totalAttached = attachmentFiles.length + remoteCount;
      if (totalAttached > 0) {
        toast.success(`Envío creado con ${totalAttached} archivo(s) adjunto(s)`);
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
      setShipmentForm({
        shipping_category: "",
        custom_unit_cost: "",
        package_count: "1",
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
    // Week = Monday 12:00 local → next Monday 11:59:59 local (cutoff Monday at noon).
    const getWeekKey = (dateStr) => {
      const d = new Date(dateStr);
      const day = d.getDay(); // 0 Sun .. 6 Sat (Monday = 1)
      // Days back to the most recent Monday (could be today)
      const daysSinceMonday = (day - 1 + 7) % 7;
      const candidate = new Date(d);
      candidate.setDate(d.getDate() - daysSinceMonday);
      candidate.setHours(12, 0, 0, 0);
      // If the candidate is in the future relative to d (i.e., today is Monday before noon),
      // step back 7 days so the date belongs to the previous week.
      if (candidate > d) {
        candidate.setDate(candidate.getDate() - 7);
      }
      return candidate.toISOString().slice(0, 10);
    };
    let filtered = shipments;
    if (weekFilter !== "all") {
      filtered = filtered.filter(s => getWeekKey(s.created_at) === weekFilter);
    }
    if (status !== "all") {
      filtered = filtered.filter(s => s.status === status);
    }
    const code = customerFilter.trim().toUpperCase();
    if (code) {
      filtered = filtered.filter(s => (s.customer_id || "").toUpperCase().includes(code));
    }
    return filtered;
  };

  // Total package count for a given filtered list (respects shipping_mode)
  const sumPackages = (list) => {
    return list.reduce((sum, s) => {
      const qty = Number(s.package_count) || 0;
      return sum + qty;
    }, 0);
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

                {/* Invoice Selection (required) */}
                {selectedClient && !invoiceData && (
                  <div className="space-y-2">
                    <Label>Factura del Cliente *</Label>
                    {loadingInvoices ? (
                      <p className="text-sm text-gray-500">Cargando facturas...</p>
                    ) : clientInvoices.length === 0 ? (
                      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-center" data-testid="no-invoices-message">
                        <FileText className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                        <p className="text-sm text-amber-800 font-semibold">Este cliente no tiene facturas disponibles</p>
                        <p className="text-xs text-amber-700 mt-1">Crea una factura primero para poder generar un envío.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto" data-testid="invoice-selector-list">
                        {clientInvoices.map((invoice) => (
                          <div
                            key={invoice.id}
                            onClick={() => handleSelectInvoice(invoice)}
                            className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                              selectedInvoice?.id === invoice.id
                                ? "border-purple-500 bg-purple-50"
                                : "border-gray-200 hover:border-purple-300 bg-white"
                            }`}
                            data-testid={`invoice-option-${invoice.id}`}
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
                    {selectedInvoice && (
                      <div className="p-3 rounded-xl bg-purple-50 border border-purple-200" data-testid="selected-invoice-info">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-4 w-4 text-purple-600" />
                          <span className="font-semibold text-purple-800">Factura {selectedInvoice.invoice_number}</span>
                        </div>
                        <p className="text-sm text-purple-700">
                          <strong>{selectedInvoice.purchases?.length || 0}</strong> productos • Total factura: <strong>${selectedInvoice.total?.toFixed(2)}</strong>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Shipment details — show only after invoice is selected (or passed via invoiceData) */}
                {selectedClient && (selectedInvoice || invoiceData) && (
                  <>
                    {/* Products list (optional view) */}
                    {tenantSettings.shipment_show_product_list && pendingPurchases.length > 0 && (
                      <div>
                        <Label>Productos incluidos ({pendingPurchases.length})</Label>
                        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                          {pendingPurchases.map((purchase) => (
                            <div key={purchase.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{purchase.item_name}</p>
                                <p className="text-xs text-gray-500">{purchase.store}</p>
                              </div>
                              <span className="font-semibold text-gray-700 shrink-0 ml-2">${(purchase.price || 0).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Shipping Category */}
                    <div>
                      <Label>Categoría de Envío *</Label>
                      <Select
                        value={shipmentForm.shipping_category}
                        onValueChange={(value) => setShipmentForm({ ...shipmentForm, shipping_category: value })}
                      >
                        <SelectTrigger className="h-12 rounded-xl mt-1" data-testid="select-shipping-category">
                          <SelectValue placeholder="Selecciona una categoría" />
                        </SelectTrigger>
                        <SelectContent>
                          {tenantSettings.shipping_categories.map((cat) => {
                            const unit = tenantSettings.shipping_mode === "pounds" ? "libra" : "paquete";
                            const priceField = tenantSettings.shipping_mode === "pounds" ? "value_pounds" : "value_packages";
                            const price = cat[priceField] ?? cat.value ?? 0;
                            return (
                              <SelectItem key={cat.key} value={cat.key} data-testid={`category-${cat.key}`}>
                                {cat.label} — ${Number(price).toFixed(2)} / {unit}
                              </SelectItem>
                            );
                          })}
                          <SelectItem value="OTHER" data-testid="category-OTHER">Otro (costo personalizado)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Custom Unit Cost (only when OTHER) */}
                    {shipmentForm.shipping_category === "OTHER" && (
                      <div>
                        <Label>Costo por {tenantSettings.shipping_mode === "pounds" ? "libra" : "paquete"} (USD) *</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="Ej: 35.00"
                          value={shipmentForm.custom_unit_cost}
                          onChange={(e) => setShipmentForm({ ...shipmentForm, custom_unit_cost: e.target.value })}
                          onWheel={(e) => e.target.blur()}
                          className="h-12 rounded-xl mt-1"
                          data-testid="custom-unit-cost-input"
                        />
                      </div>
                    )}

                    {/* Quantity (packages or pounds) */}
                    <div>
                      <Label>Número de {tenantSettings.shipping_mode === "pounds" ? "Libras" : "Paquetes"} *</Label>
                      <Input
                        type="number"
                        inputMode={tenantSettings.shipping_mode === "pounds" ? "decimal" : "numeric"}
                        step={tenantSettings.shipping_mode === "pounds" ? "0.01" : "1"}
                        min={tenantSettings.shipping_mode === "pounds" ? "0.1" : "1"}
                        placeholder={tenantSettings.shipping_mode === "pounds" ? "Ej: 3.5" : "Ej: 2"}
                        value={shipmentForm.package_count}
                        onChange={(e) => setShipmentForm({ ...shipmentForm, package_count: e.target.value })}
                        onWheel={(e) => e.target.blur()}
                        className="h-12 rounded-xl mt-1"
                        data-testid="shipping-package-count-input"
                      />
                    </div>

                    {/* Total Cost */}
                    {shipmentForm.shipping_category && (
                      <div className="bg-gradient-to-r from-[#1E3A5F] to-[#2a4a73] rounded-xl p-4 text-white">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-white/80">
                              {(() => {
                                const rawQty = parseFloat(shipmentForm.package_count) || 1;
                                const qty = tenantSettings.shipping_mode === "pounds" ? rawQty : Math.max(Math.round(rawQty), 1);
                                const unit = tenantSettings.shipping_mode === "pounds" ? "libra(s)" : "paquete(s)";
                                return `${qty} ${unit} × $${getUnitCost().toFixed(2)}`;
                              })()}
                            </p>
                            <p className="text-sm font-semibold">Total envío:</p>
                          </div>
                          <span className="text-3xl font-extrabold" data-testid="total-shipment-cost">
                            ${getTotalShippingCost().toFixed(2)}
                          </span>
                        </div>
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

                      {/* Mobile QR upload */}
                      {uploadSession && (
                        <div className="mt-4 p-4 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50" data-testid="mobile-upload-qr-block">
                          <div className="flex items-start gap-3">
                            <div className="shrink-0">
                              <img
                                src={uploadSession.qr_data_url}
                                alt="QR code"
                                className="w-28 h-28 rounded-lg border-2 border-white shadow-sm"
                                data-testid="mobile-upload-qr-image"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-blue-900 flex items-center gap-1">
                                <Smartphone className="h-4 w-4" />
                                Subir desde el teléfono
                              </p>
                              <p className="text-xs text-blue-700 mt-1">
                                Escanea el QR con la cámara de tu teléfono para subir fotos o PDFs sin salir de esta pantalla.
                              </p>
                              <div className="mt-2 flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${remoteFiles.length > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                  <RefreshCw className="h-3 w-3 animate-spin-slow" />
                                  {remoteFiles.length > 0 ? `${remoteFiles.length} recibido(s)` : "Esperando..."}
                                </span>
                              </div>
                              {remoteFiles.length > 0 && (
                                <p className="text-xs text-green-700 mt-2">
                                  Los archivos se adjuntarán al envío al crearlo.
                                </p>
                              )}
                            </div>
                          </div>
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
          // Week = Monday 12:00 local → next Monday 11:59:59 local (cutoff Monday at noon).
          const getWeekKey = (dateStr) => {
            const d = new Date(dateStr);
            const day = d.getDay();
            const daysSinceMonday = (day - 1 + 7) % 7;
            const candidate = new Date(d);
            candidate.setDate(d.getDate() - daysSinceMonday);
            candidate.setHours(12, 0, 0, 0);
            if (candidate > d) {
              candidate.setDate(candidate.getDate() - 7);
            }
            return candidate.toISOString().slice(0, 10);
          };
          const getWeekLabel = (dateStr) => {
            const d = new Date(dateStr);
            const day = d.getDay();
            const daysSinceMonday = (day - 1 + 7) % 7;
            const startMonday = new Date(d);
            startMonday.setDate(d.getDate() - daysSinceMonday);
            startMonday.setHours(12, 0, 0, 0);
            if (startMonday > d) {
              startMonday.setDate(startMonday.getDate() - 7);
            }
            const endMonday = new Date(startMonday);
            endMonday.setDate(startMonday.getDate() + 7);
            const fmt = (dt) => {
              const day = dt.getDate();
              const monthRaw = dt.toLocaleDateString('es-ES', { month: 'long' });
              const month = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1);
              return `${day}-${month}`;
            };
            return `Lunes ${fmt(startMonday)} - Lunes ${fmt(endMonday)}`;
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
          const totalPackages = filtered.reduce((sum, s) => sum + (s.package_count || 0), 0);

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
                        <p className="text-xs text-purple-600">
                          Envíos ({filtered.length}) · {(() => {
                            const pkgTotal = filtered.filter(s => s.shipping_mode !== "pounds").reduce((sum, s) => sum + (s.package_count || 0), 0);
                            const lbTotal = filtered.filter(s => s.shipping_mode === "pounds").reduce((sum, s) => sum + (s.package_count || 0), 0);
                            const parts = [];
                            if (pkgTotal > 0) parts.push(`${pkgTotal} paquete${pkgTotal === 1 ? '' : 's'}`);
                            if (lbTotal > 0) parts.push(`${lbTotal.toFixed(1)} lb`);
                            return parts.length ? parts.join(' • ') : '0';
                          })()}
                        </p>
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
                            {w.label} ({w.count})
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
                    {(() => {
                      const pkgTotal = filtered.filter(s => s.shipping_mode !== "pounds").reduce((sum, s) => sum + (s.package_count || 0), 0);
                      const lbTotal = filtered.filter(s => s.shipping_mode === "pounds").reduce((sum, s) => sum + (s.package_count || 0), 0);
                      if (pkgTotal > 0 && lbTotal > 0) {
                        return (
                          <>
                            <p className="text-lg font-extrabold text-slate-800 leading-tight">{pkgTotal} / {lbTotal.toFixed(1)}</p>
                            <p className="text-[10px] text-gray-500">Paquetes / Libras</p>
                          </>
                        );
                      }
                      if (lbTotal > 0) {
                        return (
                          <>
                            <p className="text-2xl font-extrabold text-slate-800">{lbTotal.toFixed(1)}</p>
                            <p className="text-xs text-gray-500">Libras</p>
                          </>
                        );
                      }
                      return (
                        <>
                          <p className="text-2xl font-extrabold text-slate-800">{pkgTotal}</p>
                          <p className="text-xs text-gray-500">Paquetes</p>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            </>
          );
        })()}

        {/* Customer filter — sticks to all status tabs */}
        <div className="mb-4">
          <div className="relative">
            <Input
              type="text"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              placeholder="Filtrar por código de cliente (ej: J2934)"
              className="h-11 rounded-xl pl-10 pr-24 bg-white border-slate-200 uppercase"
              data-testid="shipments-customer-filter"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            {customerFilter.trim() && (
              <button
                type="button"
                onClick={() => setCustomerFilter("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded-md bg-slate-100"
                data-testid="shipments-customer-filter-clear"
              >
                Limpiar
              </button>
            )}
          </div>
          {customerFilter.trim() && (() => {
            const code = customerFilter.trim().toUpperCase();
            const allForCustomer = shipments.filter(s => (s.customer_id || "").toUpperCase().includes(code));
            const totalPkg = sumPackages(allForCustomer);
            const mode = tenantSettings?.shipping_mode === "pounds" ? "lb" : "paq.";
            return (
              <div className="mt-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 flex items-center justify-between" data-testid="shipments-customer-filter-summary">
                <p className="text-xs text-blue-800">
                  Cliente <span className="font-bold">{code}</span> · {allForCustomer.length} envío(s)
                </p>
                <p className="text-xs font-extrabold text-blue-900">
                  {Number(totalPkg).toFixed(tenantSettings?.shipping_mode === "pounds" ? 1 : 0)} {mode}
                </p>
              </div>
            );
          })()}
        </div>

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
                                {(() => {
                                  const categories = tenantSettings.shipping_categories || [];
                                  const cat = categories.find(c => c.key === shipment.shipping_category);
                                  if (cat) return cat.label;
                                  if (shipment.shipping_category === "OTHER") return "Personalizado";
                                  // Legacy fallback
                                  return shipment.shipping_type === 'with_family' ? 'Con Familiar USA'
                                    : shipment.shipping_type === 'without_family' ? 'Sin Familiar USA'
                                    : shipment.shipping_type || '';
                                })()}
                                {' - '}${shipment.shipping_cost.toFixed(2)}
                                {shipment.package_count > 0 && (() => {
                                  const isPounds = shipment.shipping_mode === "pounds";
                                  const qty = isPounds ? Number(shipment.package_count).toFixed(1) : shipment.package_count;
                                  const unit = isPounds ? 'lb' : `paquete${shipment.package_count === 1 ? '' : 's'}`;
                                  return ` • ${qty} ${unit}`;
                                })()}
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
