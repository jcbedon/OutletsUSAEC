import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/App";
import { useNavigate } from "react-router-dom";
import { 
  createLive, 
  updateLive,
  startLive, 
  endLive, 
  getActiveLive, 
  getLives,
  createPurchase,
  getLivePurchases,
  getActiveClients,
  getAllClients,
  getWalletByCustomerId,
  getClientInfo,
  updatePurchase,
  deletePurchase,
  getTenantSettings,
  getLive
} from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StoreInvoiceSection from "@/components/StoreInvoiceSection";
import PurchaseItem from "@/components/live/PurchaseItem";
import { 
  Radio, 
  Play, 
  Square, 
  Plus, 
  ArrowLeft,
  User,
  ShoppingBag,
  DollarSign,
  Store,
  CheckCircle,
  AlertTriangle,
  Zap,
  Edit,
  Trash2,
  X,
  Search
} from "lucide-react";

// Default tax options
const DEFAULT_TAX_OPTIONS = [
  { value: "8.25", label: "8.25%" },
  { value: "10", label: "10%" },
  { value: "15", label: "15%" },
  { value: "0", label: "Sin Taxes" },
  { value: "other", label: "Otro" }
];

export default function AdminLive() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const logoUrl = user?.tenant_logo || "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";
  
  // Check permissions for employees
  const permissions = user?.permissions || {};
  const isAdmin = user?.role === "admin";
  const hasPermission = isAdmin || permissions.manage_lives === true;
  
  const [activeLive, setActiveLive] = useState(null);
  const [selectedLive, setSelectedLive] = useState(null); // Live currently being viewed/edited
  const [lives, setLives] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [activeClients, setActiveClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newLiveTitle, setNewLiveTitle] = useState("");
  const [newLiveStore, setNewLiveStore] = useState("");
  const [createLiveDialogOpen, setCreateLiveDialogOpen] = useState(false);
  
  // Edit Live state
  const [editLiveDialogOpen, setEditLiveDialogOpen] = useState(false);
  const [editLiveForm, setEditLiveForm] = useState({ title: "", store: "" });
  
  // Confirm open finalized live
  const [confirmOpenFinalizedDialog, setConfirmOpenFinalizedDialog] = useState(false);
  const [liveToOpen, setLiveToOpen] = useState(null);
  
  // Redirect if no permission
  useEffect(() => {
    if (!hasPermission) {
      toast.error("No tienes permiso para acceder a este módulo");
      navigate("/admin");
    }
  }, [hasPermission, navigate]);

  // Purchase form state
  const [purchaseForm, setPurchaseForm] = useState({
    customer_id: "",
    item_name: "",
    price: "",
    tax_option: "8.25",  // Selected tax option value
    custom_tax: "",       // For "other" option
    apply_commission: true,
    commission_amount: "3"
  });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerWallet, setCustomerWallet] = useState(null);
  const [customerCommission, setCustomerCommission] = useState(3.0);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editForm, setEditForm] = useState({ 
    item_name: "", store: "", price: "", tax_option: "8.25",
    custom_tax: "", apply_commission: true, commission: "3", customer_id: ""
  });
  const [purchaseSearch, setPurchaseSearch] = useState("");
  
  // Client autocomplete state
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearchValue, setClientSearchValue] = useState("");
  
  // Tax options from tenant settings
  const [taxOptions, setTaxOptions] = useState(DEFAULT_TAX_OPTIONS);

  const customerIdRef = useRef(null);

  // Filter clients for autocomplete - now more permissive
  const filteredClients = useMemo(() => {
    if (!clientSearchValue || clientSearchValue.length < 1) return [];
    const search = clientSearchValue.toLowerCase().trim();
    
    // Simple search: match if name or customer_id contains the search string
    return activeClients.filter(c => {
      const name = c.name?.toLowerCase() || "";
      const customerId = c.customer_id?.toLowerCase() || "";
      return name.includes(search) || customerId.includes(search);
    }).slice(0, 8); // Limit to 8 suggestions
  }, [activeClients, clientSearchValue]);

  // Calculate actual tax rate from selected option
  const getEffectiveTaxRate = (taxOption, customTax) => {
    if (taxOption === "0") return 0;
    if (taxOption === "other") return parseFloat(customTax) / 100 || 0;
    return parseFloat(taxOption) / 100;
  };

  useEffect(() => {
    loadData();
    // Load tenant tax settings
    getTenantSettings().then(res => {
      if (res.data?.tax_options && res.data.tax_options.length > 0) {
        setTaxOptions(res.data.tax_options);
      }
    }).catch(() => {});
  }, []);

  const loadData = async (preserveSelection = false) => {
    try {
      const currentSelectedId = selectedLive?.id; // Preserve current selection
      
      const [activeLiveRes, livesRes, clientsRes] = await Promise.all([
        getActiveLive(),
        getLives(),
        getAllClients()  // Use all clients for autocomplete
      ]);
      
      setActiveLive(activeLiveRes.data);
      setLives(livesRes.data);
      setActiveClients(clientsRes.data);

      // If preserveSelection is true and we had a selected live, keep it
      if (preserveSelection && currentSelectedId) {
        const updatedLive = livesRes.data.find(l => l.id === currentSelectedId);
        if (updatedLive) {
          setSelectedLive(updatedLive);
          const purchasesRes = await getLivePurchases(currentSelectedId);
          setPurchases(purchasesRes.data);
          return;
        }
      }
      
      // Don't auto-select any live - always show the list first
      // User must explicitly choose which live to work with
    } catch (error) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLive = async (live) => {
    // If live is finalized, show confirmation dialog
    if (live.status === "ended" || live.status === "finalized" || live.status === "completed") {
      setLiveToOpen(live);
      setConfirmOpenFinalizedDialog(true);
      return;
    }
    
    // Otherwise, open directly
    await openLive(live);
  };
  
  const openLive = async (live) => {
    setSelectedLive(live);
    try {
      const purchasesRes = await getLivePurchases(live.id);
      setPurchases(purchasesRes.data);
    } catch (error) {
      toast.error("Error al cargar compras del live");
    }
  };
  
  const confirmOpenFinalizedLive = async () => {
    if (liveToOpen) {
      await openLive(liveToOpen);
    }
    setConfirmOpenFinalizedDialog(false);
    setLiveToOpen(null);
  };

  const handleCreateLive = async () => {
    if (!newLiveTitle.trim()) {
      toast.error("Ingresa un título para el Live");
      return;
    }
    if (!newLiveStore.trim()) {
      toast.error("Ingresa el nombre de la tienda");
      return;
    }

    try {
      const res = await createLive({ title: newLiveTitle, store: newLiveStore });
      const newLiveId = res.data.live_id;
      toast.success("Live creado");
      setNewLiveTitle("");
      setNewLiveStore("");
      setCreateLiveDialogOpen(false);
      
      // Reload lives and select the NEW live
      const livesRes = await getLives();
      setLives(livesRes.data);
      
      // Find and select the newly created live
      const createdLive = livesRes.data.find(l => l.id === newLiveId);
      if (createdLive) {
        setSelectedLive(createdLive);
        setPurchases([]);
      }
    } catch (error) {
      toast.error("Error al crear Live");
    }
  };

  const handleStartLive = async (liveId) => {
    try {
      await startLive(liveId);
      toast.success("¡LIVE INICIADO!");
      // Reload lives and select the started one
      const livesRes = await getLives();
      setLives(livesRes.data);
      const startedLive = livesRes.data.find(l => l.id === liveId);
      if (startedLive) {
        setActiveLive(startedLive);
        setSelectedLive(startedLive);
        const purchasesRes = await getLivePurchases(liveId);
        setPurchases(purchasesRes.data);
      }
    } catch (error) {
      toast.error("Error al iniciar Live");
    }
  };

  const openEditLiveDialog = () => {
    if (selectedLive) {
      setEditLiveForm({
        title: selectedLive.title || "",
        store: selectedLive.store || ""
      });
      setEditLiveDialogOpen(true);
    }
  };

  const handleUpdateLive = async () => {
    if (!selectedLive) return;
    if (!editLiveForm.title.trim()) {
      toast.error("El título es requerido");
      return;
    }
    try {
      await updateLive(selectedLive.id, editLiveForm);
      toast.success("Live actualizado y compras sincronizadas");
      setEditLiveDialogOpen(false);
      // Reload lives
      const livesRes = await getLives();
      setLives(livesRes.data);
      // Update selected live
      const updatedLive = livesRes.data.find(l => l.id === selectedLive.id);
      if (updatedLive) {
        setSelectedLive(updatedLive);
        if (activeLive?.id === updatedLive.id) {
          setActiveLive(updatedLive);
        }
        // Also reload purchases to show updated store name
        const purchasesRes = await getLivePurchases(updatedLive.id);
        setPurchases(purchasesRes.data);
      }
    } catch (error) {
      toast.error("Error al actualizar Live");
    }
  };

  const handleEndLive = async () => {
    try {
      await endLive(selectedLive.id);
      toast.success("Live finalizado");
      // Reload to update status
      const livesRes = await getLives();
      setLives(livesRes.data);
      setActiveLive(null);
      // Keep selectedLive but update its status
      const updatedLive = livesRes.data.find(l => l.id === selectedLive.id);
      if (updatedLive) setSelectedLive(updatedLive);
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "Error al finalizar Live";
      toast.error(errorMessage);
    }
  };

  const handleReactivateLive = async () => {
    if (!selectedLive) return;
    try {
      await startLive(selectedLive.id);
      toast.success("¡Live reactivado! Ahora puedes agregar productos");
      // Reload to update status
      const livesRes = await getLives();
      setLives(livesRes.data);
      const reactivatedLive = livesRes.data.find(l => l.id === selectedLive.id);
      if (reactivatedLive) {
        setSelectedLive(reactivatedLive);
        setActiveLive(reactivatedLive);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "Error al reactivar Live";
      toast.error(errorMessage);
    }
  };

  const handleCustomerIdChange = async (value) => {
    setClientSearchValue(value);
    setPurchaseForm({ ...purchaseForm, customer_id: value.toUpperCase() });
    setSelectedCustomer(null);
    setCustomerWallet(null);
    setCustomerCommission(3.0);

    // Always show dropdown when typing (will be filtered by filteredClients)
    if (value.length >= 1) {
      setClientSearchOpen(true);
    } else {
      setClientSearchOpen(false);
    }

    // Try to find customer by exact ID
    if (value.length >= 2) {
      try {
        const clientInfoRes = await getClientInfo(value.toUpperCase());
        const clientData = clientInfoRes.data;
        setCustomerWallet({ available: clientData.wallet_balance });
        setSelectedCustomer(clientData);
        setCustomerCommission(clientData.commission_fee || 3.0);
        // Don't close dropdown immediately - let user see suggestions
      } catch (error) {
        // Customer not found by ID - keep dropdown open for name search
      }
    }
  };

  const handleSelectClient = (client) => {
    setPurchaseForm({ ...purchaseForm, customer_id: client.customer_id });
    setClientSearchValue(client.customer_id);
    setSelectedCustomer(client);
    setCustomerWallet({ available: client.wallet_balance || 0 });
    setCustomerCommission(client.commission_fee || 3.0);
    setClientSearchOpen(false);
  };

  const handleSubmitPurchase = async (e) => {
    e.preventDefault();
    
    if (!purchaseForm.customer_id || !purchaseForm.item_name || !purchaseForm.price) {
      toast.error("Completa todos los campos");
      return;
    }

    const price = parseFloat(purchaseForm.price);
    if (isNaN(price) || price <= 0) {
      toast.error("Precio inválido");
      return;
    }

    // Validate custom tax if "other" is selected
    if (purchaseForm.tax_option === "other" && (!purchaseForm.custom_tax || parseFloat(purchaseForm.custom_tax) < 0)) {
      toast.error("Ingresa un valor válido para el impuesto personalizado");
      return;
    }

    setSubmitting(true);

    try {
      const taxRate = getEffectiveTaxRate(purchaseForm.tax_option, purchaseForm.custom_tax);
      
      const result = await createPurchase({
        customer_id: purchaseForm.customer_id,
        item_name: purchaseForm.item_name,
        store: selectedLive.store || "Sin tienda",
        price: price,
        live_id: selectedLive.id,
        tax_rate: taxRate,
        apply_tax: taxRate > 0,
        apply_commission: purchaseForm.apply_commission,
        commission_amount: parseFloat(purchaseForm.commission_amount) || 0
      });

      toast.success(
        `${result.data.customer_name}: ${purchaseForm.item_name} - Total: $${result.data.total.toFixed(2)} (Saldo: $${result.data.new_balance.toFixed(2)})`,
        { duration: 3000 }
      );

      // Reset form but keep tax option and commission for next purchase
      const lastTaxOption = purchaseForm.tax_option;
      const lastCustomTax = purchaseForm.custom_tax;
      const lastCommission = purchaseForm.commission_amount;
      setPurchaseForm({
        customer_id: "",
        item_name: "",
        price: "",
        tax_option: lastTaxOption,
        custom_tax: lastCustomTax,
        apply_commission: true,
        commission_amount: lastCommission
      });
      setClientSearchValue("");
      setSelectedCustomer(null);
      setCustomerWallet(null);

      // Refresh purchases
      const purchasesRes = await getLivePurchases(selectedLive.id);
      setPurchases(purchasesRes.data);

      // Refresh lives to update stats
      const livesRes = await getLives();
      setLives(livesRes.data);
      const updatedLive = livesRes.data.find(l => l.id === selectedLive.id);
      if (updatedLive) setSelectedLive(updatedLive);

      // Focus back to customer ID
      customerIdRef.current?.focus();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al registrar compra");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditPurchase = (purchase) => {
    setEditingPurchase(purchase.id);
    // Determine tax_option from stored tax_rate
    let tax_option = "0";
    let custom_tax = "";
    if (purchase.apply_tax !== false && purchase.tax_rate > 0) {
      const rate = (purchase.tax_rate * 100).toFixed(2).replace(/\.?0+$/, '');
      // Check if it matches predefined options
      const matchingOption = DEFAULT_TAX_OPTIONS.find(opt => opt.value === rate);
      if (matchingOption && matchingOption.value !== "other") {
        tax_option = rate;
      } else {
        tax_option = "other";
        custom_tax = rate;
      }
    }
    setEditForm({ 
      item_name: purchase.item_name, 
      store: purchase.store, 
      price: purchase.price.toString(),
      tax_option: tax_option,
      custom_tax: custom_tax,
      apply_commission: purchase.apply_commission !== false,
      commission: (purchase.commission || 0).toString(),
      customer_id: purchase.customer_id
    });
  };

  const handleSaveEdit = async (purchaseId) => {
    try {
      const data = {};
      const orig = purchases.find(p => p.id === purchaseId);
      
      // Basic fields
      if (editForm.item_name !== orig.item_name) data.item_name = editForm.item_name;
      if (editForm.store !== orig.store) data.store = editForm.store;
      if (parseFloat(editForm.price) !== orig.price) data.price = parseFloat(editForm.price);
      
      // Customer change
      if (editForm.customer_id !== orig.customer_id) data.customer_id = editForm.customer_id;
      
      // Tax fields - use new tax option system
      const newTaxRate = getEffectiveTaxRate(editForm.tax_option, editForm.custom_tax);
      const newApplyTax = newTaxRate > 0;
      const origApplyTax = orig.apply_tax !== false;
      const origTaxRate = orig.tax_rate || 0;
      
      if (newApplyTax !== origApplyTax) data.apply_tax = newApplyTax;
      if (Math.abs(newTaxRate - origTaxRate) > 0.0001) data.tax_rate = newTaxRate;
      
      // Commission fields
      const newApplyCommission = editForm.apply_commission;
      const newCommission = parseFloat(editForm.commission) || 0;
      const origApplyCommission = orig.apply_commission !== false;
      const origCommission = orig.commission || 0;
      
      if (newApplyCommission !== origApplyCommission) data.apply_commission = newApplyCommission;
      if (newApplyCommission && newCommission !== origCommission) data.commission = newCommission;
      if (!newApplyCommission) data.commission = 0;
      
      if (Object.keys(data).length === 0) { setEditingPurchase(null); return; }
      await updatePurchase(purchaseId, data);
      toast.success("Compra actualizada");
      setEditingPurchase(null);
      loadData(true); // Preserve selection to stay on current Live
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al editar");
    }
  };

  const handleDeletePurchase = async (purchaseId) => {
    try {
      await deletePurchase(purchaseId);
      toast.success("Compra eliminada y saldo reembolsado");
      loadData(true); // Preserve selection to stay on current Live
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al eliminar");
    }
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
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
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
          </div>
          
          {activeLive && (
            <Badge className="text-white animate-pulse text-sm px-3 py-1" style={{ background: '#2ECC71' }}>
              <Radio className="h-3 w-3 mr-2 inline" />
              EN VIVO
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* No Selected Live - Show list of all lives */}
        {!selectedLive && (
          <div className="space-y-6">
            <Card className="rounded-2xl border-dashed border-2 border-gray-300">
              <CardContent className="p-8 text-center">
                <Radio className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-700 mb-2">Selecciona o crea un Live</h2>
                <p className="text-gray-500 mb-6">Puedes crear uno nuevo o continuar con uno existente</p>
                
                <Dialog open={createLiveDialogOpen} onOpenChange={setCreateLiveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      className="font-bold rounded-xl h-12 px-6" style={{ background: '#1E3A5F', color: 'white' }}
                      data-testid="create-live-btn"
                    >
                      <Plus className="h-5 w-5 mr-2" />
                      Crear Nuevo Live
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-2xl">
                    <DialogHeader>
                      <DialogTitle>Crear Nuevo Live</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <Label>Título del Live</Label>
                        <Input
                          placeholder="Ej: Live Walmart Febrero"
                          value={newLiveTitle}
                          onChange={(e) => setNewLiveTitle(e.target.value)}
                          className="h-12 rounded-xl mt-2"
                          data-testid="live-title-input"
                        />
                      </div>
                      <div>
                        <Label>Tienda *</Label>
                        <Input
                          placeholder="Ej: Walmart, Target, Amazon..."
                          value={newLiveStore}
                          onChange={(e) => setNewLiveStore(e.target.value)}
                          className="h-12 rounded-xl mt-2"
                          data-testid="live-store-input"
                        />
                        <p className="text-xs text-gray-500 mt-1">Todas las compras de este Live serán de esta tienda</p>
                      </div>
                      <Button 
                        className="w-full h-12 font-bold rounded-xl" style={{ background: '#1E3A5F', color: 'white' }}
                        onClick={handleCreateLive}
                        data-testid="submit-create-live-btn"
                      >
                        Crear Live
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>

            {/* All Lives - Grouped by status */}
            {lives.length > 0 && (
              <div className="space-y-6">
                {/* Active Lives */}
                {lives.filter(l => l.status === "active").length > 0 && (
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      Lives Activos
                    </h2>
                    <div className="space-y-3">
                      {lives.filter(l => l.status === "active").map((live) => (
                        <Card key={live.id} className="rounded-xl border-green-200 bg-green-50/50">
                          <CardContent className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-slate-800">{live.title}</p>
                              <p className="text-sm text-blue-600 font-medium">
                                <Store className="h-3 w-3 inline mr-1" />
                                {live.store || "Sin tienda"}
                              </p>
                              <p className="text-sm text-gray-500">
                                {live.purchase_count || 0} compras • ${(live.total_sales || 0).toFixed(2)} ventas
                              </p>
                            </div>
                            <Button 
                              onClick={() => handleSelectLive(live)}
                              className="bg-green-600 hover:bg-green-700 font-bold rounded-xl"
                              data-testid={`select-live-${live.id}`}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Continuar
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inactive Lives (not started) */}
                {lives.filter(l => l.status === "inactive").length > 0 && (
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Lives Pendientes</h2>
                    <div className="space-y-3">
                      {lives.filter(l => l.status === "inactive").map((live) => (
                        <Card key={live.id} className="rounded-xl">
                          <CardContent className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-slate-800">{live.title}</p>
                              <p className="text-sm text-gray-500">
                                Creado: {new Date(live.created_at).toLocaleDateString('es-ES')}
                              </p>
                            </div>
                            <Button 
                              onClick={() => handleStartLive(live.id)}
                              className="bg-blue-600 hover:bg-blue-700 font-bold rounded-xl"
                              data-testid={`start-live-${live.id}`}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Iniciar
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ended Lives */}
                {lives.filter(l => l.status === "ended" || l.status === "completed").length > 0 && (
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Lives Finalizados</h2>
                    <div className="space-y-3">
                      {lives.filter(l => l.status === "ended" || l.status === "completed").map((live) => (
                        <Card key={live.id} className="rounded-xl bg-gray-50">
                          <CardContent className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-slate-800">{live.title}</p>
                              <p className="text-sm text-blue-600 font-medium">
                                <Store className="h-3 w-3 inline mr-1" />
                                {live.store || "Sin tienda"}
                              </p>
                              <p className="text-sm text-gray-500">
                                {live.purchase_count || 0} compras • ${(live.total_sales || 0).toFixed(2)} ventas
                              </p>
                              <p className="text-xs text-gray-400">
                                Finalizado: {new Date(live.ended_at || live.created_at).toLocaleDateString('es-ES')}
                              </p>
                            </div>
                            <Button 
                              onClick={() => handleSelectLive(live)}
                              variant="outline"
                              className="font-bold rounded-xl"
                              data-testid={`open-live-${live.id}`}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Abrir
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Selected Live - Purchase Mode */}
        {selectedLive && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Purchase Form - LEFT */}
            <div className="space-y-4">
              {/* Live Header */}
              <Card className="text-white rounded-2xl border-0 overflow-hidden" style={{ background: 'linear-gradient(135deg, #1E3A5F, #2a4f7f)' }}>
                <CardContent className="p-0">
                  {/* Top Bar - Back button and status */}
                  <div className="px-4 py-2 flex items-center justify-between border-b border-white/10">
                    <Button 
                      onClick={() => { setSelectedLive(null); setPurchases([]); }}
                      variant="ghost"
                      size="sm"
                      className="text-white/80 hover:text-white hover:bg-white/10 -ml-2"
                      data-testid="back-to-lives-btn"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Volver
                    </Button>
                    <div className="flex items-center gap-2">
                      {selectedLive.status === "active" ? (
                        <>
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          <span className="text-sm font-medium text-green-300">EN VIVO</span>
                        </>
                      ) : (
                        <>
                          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                          <span className="text-sm font-medium text-gray-300">FINALIZADO</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="p-4">
                    {/* Title and Actions Row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h2 className="text-2xl font-bold leading-tight">{selectedLive.title}</h2>
                        <p className="text-blue-200 mt-1 flex items-center gap-1">
                          <Store className="h-4 w-4" />
                          {selectedLive.store || "Sin tienda definida"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          onClick={openEditLiveDialog}
                          variant="outline"
                          size="sm"
                          className="border-white/30 text-white hover:bg-white/10"
                          data-testid="edit-live-btn"
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                        {selectedLive.status === "active" && (
                          <Button 
                            onClick={handleEndLive}
                            size="sm"
                            className="bg-red-500/80 hover:bg-red-500 text-white border-0"
                            data-testid="end-live-btn"
                          >
                            <Square className="h-4 w-4 mr-1" />
                            Finalizar
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="flex gap-6 mt-4 pt-4 border-t border-white/20">
                      <div>
                        <p className="text-gray-300 text-xs">Ventas</p>
                        <p className="text-2xl font-bold">{selectedLive.purchase_count || 0}</p>
                      </div>
                      <div>
                        <p className="text-gray-300 text-xs">Total</p>
                        <p className="text-2xl font-bold">${(selectedLive.total_sales || 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-300 text-xs">Comisiones</p>
                        <p className="text-2xl font-bold">${(selectedLive.total_commissions || 0).toFixed(2)}</p>
                      </div>
                      {/* Store Invoice inline in header - always show */}
                      <div className="ml-auto">
                        <StoreInvoiceSection 
                          live={selectedLive} 
                          onUpdate={async () => {
                            const res = await getLive(selectedLive.id);
                            setSelectedLive(res.data);
                          }}
                          compact={true}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Purchase Form - Only show if live is active */}
              {selectedLive.status === "active" ? (
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    Registro Rápido
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmitPurchase} noValidate className="space-y-4">
                    {/* Customer ID with Autocomplete */}
                    <div>
                      <Label className="text-sm font-medium">ID Cliente</Label>
                      <div className="relative mt-1">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 z-10" />
                        <Input
                          ref={customerIdRef}
                          placeholder="ID o nombre del cliente..."
                          value={clientSearchValue}
                          onChange={(e) => {
                            handleCustomerIdChange(e.target.value);
                            if (e.target.value.length >= 1) {
                              setClientSearchOpen(true);
                            }
                          }}
                          onFocus={() => clientSearchValue.length >= 1 && setClientSearchOpen(true)}
                          onBlur={() => setTimeout(() => setClientSearchOpen(false), 200)}
                          className="pl-10 h-14 text-xl font-bold rounded-xl"
                          data-testid="purchase-customer-id"
                          autoComplete="off"
                        />
                        
                        {/* Autocomplete Dropdown */}
                        {clientSearchOpen && filteredClients.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                            {filteredClients.map((client) => (
                              <button
                                key={client.id}
                                type="button"
                                onClick={() => handleSelectClient(client)}
                                className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center justify-between border-b border-gray-100 last:border-0"
                                data-testid={`client-suggestion-${client.customer_id}`}
                              >
                                <div>
                                  <span className="font-bold text-blue-600">#{client.customer_id}</span>
                                  <span className="ml-2 text-gray-800">{client.name}</span>
                                </div>
                                <Badge className="bg-gray-100 text-gray-600">
                                  ${(client.wallet_balance || 0).toFixed(2)}
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedCustomer && (
                        <div className="mt-2 p-3 bg-green-50 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            <span className="font-medium text-green-800">{selectedCustomer.name}</span>
                          </div>
                          <Badge className="bg-green-600 text-white">
                            ${customerWallet?.available?.toFixed(2) || '0.00'}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Item Name */}
                    <div>
                      <Label className="text-sm font-medium">Producto</Label>
                      <div className="relative mt-1">
                        <ShoppingBag className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                          placeholder="Nombre del producto"
                          value={purchaseForm.item_name}
                          onChange={(e) => setPurchaseForm({ ...purchaseForm, item_name: e.target.value })}
                          className="pl-10 h-12 rounded-xl"
                          data-testid="purchase-item-name"
                        />
                      </div>
                    </div>

                    {/* Price */}
                    <div>
                      <Label className="text-sm font-medium">Precio (USD)</Label>
                      <div className="relative mt-1">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={purchaseForm.price}
                          onChange={(e) => setPurchaseForm({ ...purchaseForm, price: e.target.value })}
                          onWheel={(e) => e.target.blur()}
                          onInvalid={(e) => e.preventDefault()}
                          className="pl-10 h-14 text-2xl font-bold text-center rounded-xl"
                          data-testid="purchase-price"
                        />
                      </div>
                      
                      {/* Tax Options - Dropdown */}
                      <div className="mt-3 p-3 bg-blue-50 rounded-xl">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Impuesto (Tax)</p>
                        <div className="flex gap-2 items-center">
                          <Select 
                            value={purchaseForm.tax_option} 
                            onValueChange={(val) => setPurchaseForm({ ...purchaseForm, tax_option: val })}
                          >
                            <SelectTrigger className="h-10 rounded-lg bg-white flex-1" data-testid="tax-select">
                              <SelectValue placeholder="Seleccionar impuesto" />
                            </SelectTrigger>
                            <SelectContent>
                              {taxOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          {purchaseForm.tax_option === "other" && (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                placeholder="0"
                                value={purchaseForm.custom_tax}
                                onChange={(e) => setPurchaseForm({ ...purchaseForm, custom_tax: e.target.value })}
                                onWheel={(e) => e.target.blur()}
                                onInvalid={(e) => e.preventDefault()}
                                className="w-20 h-10 text-center rounded-lg"
                                data-testid="custom-tax-input"
                              />
                              <span className="text-sm font-medium text-gray-600">%</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Commission */}
                      <div className="mt-3 p-3 bg-yellow-50 rounded-xl">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={purchaseForm.apply_commission}
                              onChange={(e) => setPurchaseForm({ ...purchaseForm, apply_commission: e.target.checked })}
                              className="w-4 h-4 rounded text-yellow-600"
                              data-testid="apply-commission-checkbox"
                            />
                            <span className="text-sm font-medium text-gray-700">Comisión $</span>
                          </label>
                          {purchaseForm.apply_commission && (
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              placeholder="3.00"
                              value={purchaseForm.commission_amount}
                              onChange={(e) => setPurchaseForm({ ...purchaseForm, commission_amount: e.target.value })}
                              onWheel={(e) => e.target.blur()}
                              onInvalid={(e) => e.preventDefault()}
                              className="w-24 h-8 text-center rounded-lg text-sm font-bold"
                              data-testid="commission-amount-input"
                            />
                          )}
                        </div>
                      </div>

                      {purchaseForm.price && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                          {(() => {
                            const price = parseFloat(purchaseForm.price || 0);
                            const taxRate = getEffectiveTaxRate(purchaseForm.tax_option, purchaseForm.custom_tax);
                            const taxAmount = price * taxRate;
                            const priceWithTax = price + taxAmount;
                            const commission = purchaseForm.apply_commission ? parseFloat(purchaseForm.commission_amount || 0) : 0;
                            const total = priceWithTax + commission;
                            const taxLabel = purchaseForm.tax_option === "other" 
                              ? `${purchaseForm.custom_tax || 0}%`
                              : purchaseForm.tax_option === "0" 
                                ? "Sin Tax" 
                                : `${purchaseForm.tax_option}%`;
                            
                            return (
                              <>
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-600">Precio:</span>
                                  <span className="font-medium">${price.toFixed(2)}</span>
                                </div>
                                {taxRate > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Tax ({taxLabel}):</span>
                                    <span className="font-medium">${taxAmount.toFixed(2)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-sm font-bold text-blue-600">
                                  <span>Precio {taxRate > 0 ? '+ Tax' : ''}:</span>
                                  <span>${priceWithTax.toFixed(2)}</span>
                                </div>
                                {purchaseForm.apply_commission && (
                                  <div className="flex justify-between text-sm mt-2 pt-2 border-t border-dashed">
                                    <span className="text-yellow-600">Comisión:</span>
                                    <span className="font-bold text-yellow-600">${commission.toFixed(2)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t -mx-3 px-3 py-2 rounded-b-xl" style={{ background: 'rgba(30,58,95,0.05)' }}>
                                  <span>Se descuenta del saldo:</span>
                                  <span className="text-red-600">${total.toFixed(2)}</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      className="w-full h-16 text-white font-black text-xl rounded-2xl shadow-xl active:scale-95 transition-transform"
                      style={{ background: '#1E3A5F' }}
                      disabled={submitting}
                      data-testid="submit-purchase-btn"
                    >
                      {submitting ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></span>
                          GUARDANDO...
                        </span>
                      ) : (
                        <>
                          <CheckCircle className="h-6 w-6 mr-2" />
                          REGISTRAR COMPRA
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
              ) : (
              /* Message for finalized lives - no purchase form */
              <Card className="rounded-2xl border-amber-200 bg-amber-50">
                <CardContent className="p-6 text-center">
                  <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-amber-800 mb-2">Live Finalizado</h3>
                  <p className="text-amber-700 mb-4">
                    Este live está finalizado. Solo puedes ver las compras registradas.
                  </p>
                  <Button 
                    onClick={handleReactivateLive}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl h-12 px-6"
                    data-testid="reactivate-live-btn"
                  >
                    <Play className="h-5 w-5 mr-2" />
                    Reactivar Live para Agregar Productos
                  </Button>
                </CardContent>
              </Card>
              )}
            </div>

            {/* Purchases List - RIGHT */}
            <div>
              <Card className="rounded-2xl h-[calc(100vh-160px)]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Compras del Live ({purchases.length})</CardTitle>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Buscar por cliente o producto..."
                      value={purchaseSearch}
                      onChange={(e) => setPurchaseSearch(e.target.value)}
                      className="pl-9 h-9 rounded-lg text-sm"
                      data-testid="purchase-search-input"
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <ScrollArea className="h-[calc(100vh-300px)]">
                    {(() => {
                      const filtered = purchaseSearch.trim()
                        ? purchases.filter(p => 
                            p.customer_id?.toLowerCase().includes(purchaseSearch.toLowerCase()) ||
                            p.item_name?.toLowerCase().includes(purchaseSearch.toLowerCase()) ||
                            activeClients.find(c => c.customer_id === p.customer_id)?.name?.toLowerCase().includes(purchaseSearch.toLowerCase())
                          )
                        : purchases;
                      
                      if (filtered.length === 0 && purchases.length > 0) {
                        return (
                          <div className="text-center py-8 text-gray-400">
                            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No se encontraron resultados</p>
                          </div>
                        );
                      }
                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-12 text-gray-400">
                            <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p>Sin compras aun</p>
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-3">
                          {filtered.map((purchase) => (
                          <PurchaseItem
                            key={purchase.id}
                            purchase={purchase}
                            isEditing={editingPurchase === purchase.id}
                            editForm={editForm}
                            setEditForm={setEditForm}
                            taxOptions={taxOptions}
                            activeClients={activeClients}
                            getEffectiveTaxRate={getEffectiveTaxRate}
                            onEdit={handleEditPurchase}
                            onSaveEdit={handleSaveEdit}
                            onCancelEdit={() => setEditingPurchase(null)}
                            onDelete={handleDeletePurchase}
                          />
                        ))}
                      </div>
                      );
                    })()}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Edit Live Dialog */}
        <Dialog open={editLiveDialogOpen} onOpenChange={setEditLiveDialogOpen}>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-blue-600" />
                Editar Live
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-sm font-semibold">Título del Live *</Label>
                <Input
                  placeholder="Ej: Live de Navidad"
                  value={editLiveForm.title}
                  onChange={(e) => setEditLiveForm({...editLiveForm, title: e.target.value})}
                  className="mt-1 h-11 rounded-xl"
                  data-testid="edit-live-title"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Tienda</Label>
                <Input
                  placeholder="Ej: Amazon, Target, Walmart"
                  value={editLiveForm.store}
                  onChange={(e) => setEditLiveForm({...editLiveForm, store: e.target.value})}
                  className="mt-1 h-11 rounded-xl"
                  data-testid="edit-live-store"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setEditLiveDialogOpen(false)}
                  className="flex-1 h-11 rounded-xl"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleUpdateLive}
                  className="flex-1 h-11 rounded-xl font-bold"
                  style={{ background: '#1E3A5F', color: 'white' }}
                  data-testid="save-edit-live-btn"
                >
                  Guardar Cambios
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirm Open Finalized Live Dialog */}
        <Dialog open={confirmOpenFinalizedDialog} onOpenChange={setConfirmOpenFinalizedDialog}>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                Live Finalizado
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-gray-600">
                Este live ya fue <strong>finalizado</strong>. Al abrirlo podrás ver los productos registrados pero no podrás agregar nuevos.
              </p>
              <p className="text-sm text-gray-500">
                ¿Estás seguro de que quieres abrir este live?
              </p>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setConfirmOpenFinalizedDialog(false);
                    setLiveToOpen(null);
                  }}
                  className="flex-1 h-11 rounded-xl"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={confirmOpenFinalizedLive}
                  className="flex-1 h-11 rounded-xl font-bold bg-amber-500 hover:bg-amber-600 text-white"
                >
                  Sí, Abrir Live
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
