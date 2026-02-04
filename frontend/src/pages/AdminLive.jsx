import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/App";
import { useNavigate } from "react-router-dom";
import { 
  createLive, 
  startLive, 
  endLive, 
  getActiveLive, 
  getLives,
  createPurchase,
  getLivePurchases,
  getActiveClients,
  getWalletByCustomerId,
  getClientInfo
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
  Zap
} from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";

const STORES = ["Walmart", "Target", "Amazon", "Ross", "Marshalls", "TJ Maxx", "Burlington", "Otro"];
const COMMISSION = 3.0;

export default function AdminLive() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeLive, setActiveLive] = useState(null);
  const [lives, setLives] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [activeClients, setActiveClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newLiveTitle, setNewLiveTitle] = useState("");
  const [createLiveDialogOpen, setCreateLiveDialogOpen] = useState(false);

  // Purchase form state
  const [purchaseForm, setPurchaseForm] = useState({
    customer_id: "",
    item_name: "",
    store: "",
    price: ""
  });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerWallet, setCustomerWallet] = useState(null);

  const customerIdRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [activeLiveRes, livesRes, clientsRes] = await Promise.all([
        getActiveLive(),
        getLives(),
        getActiveClients()
      ]);
      
      setActiveLive(activeLiveRes.data);
      setLives(livesRes.data);
      setActiveClients(clientsRes.data);

      if (activeLiveRes.data) {
        const purchasesRes = await getLivePurchases(activeLiveRes.data.id);
        setPurchases(purchasesRes.data);
      }
    } catch (error) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLive = async () => {
    if (!newLiveTitle.trim()) {
      toast.error("Ingresa un título para el Live");
      return;
    }

    try {
      await createLive({ title: newLiveTitle });
      toast.success("Live creado");
      setNewLiveTitle("");
      setCreateLiveDialogOpen(false);
      loadData();
    } catch (error) {
      toast.error("Error al crear Live");
    }
  };

  const handleStartLive = async (liveId) => {
    try {
      await startLive(liveId);
      toast.success("¡LIVE INICIADO!");
      loadData();
    } catch (error) {
      toast.error("Error al iniciar Live");
    }
  };

  const handleEndLive = async () => {
    try {
      await endLive(activeLive.id);
      toast.success("Live finalizado");
      setPurchases([]);
      loadData();
    } catch (error) {
      toast.error("Error al finalizar Live");
    }
  };

  const handleCustomerIdChange = async (customerId) => {
    setPurchaseForm({ ...purchaseForm, customer_id: customerId });
    setSelectedCustomer(null);
    setCustomerWallet(null);

    if (customerId.length >= 2) {
      try {
        const walletRes = await getWalletByCustomerId(customerId);
        const client = activeClients.find(c => c.customer_id === customerId.toUpperCase());
        setCustomerWallet(walletRes.data);
        setSelectedCustomer(client);
      } catch (error) {
        // Customer not found
      }
    }
  };

  const handleSubmitPurchase = async (e) => {
    e.preventDefault();
    
    if (!purchaseForm.customer_id || !purchaseForm.item_name || !purchaseForm.store || !purchaseForm.price) {
      toast.error("Completa todos los campos");
      return;
    }

    const price = parseFloat(purchaseForm.price);
    if (isNaN(price) || price <= 0) {
      toast.error("Precio inválido");
      return;
    }

    const total = price + COMMISSION;
    if (customerWallet && customerWallet.available < total) {
      toast.error(`Saldo insuficiente. Disponible: $${customerWallet.available.toFixed(2)}`);
      return;
    }

    setSubmitting(true);

    try {
      const result = await createPurchase({
        customer_id: purchaseForm.customer_id,
        item_name: purchaseForm.item_name,
        store: purchaseForm.store,
        price: price,
        live_id: activeLive.id
      });

      toast.success(
        `✓ ${result.data.customer_name}: ${purchaseForm.item_name} - $${result.data.total.toFixed(2)}`,
        { duration: 3000 }
      );

      // Reset form
      setPurchaseForm({
        customer_id: "",
        item_name: "",
        store: purchaseForm.store, // Keep store selected
        price: ""
      });
      setSelectedCustomer(null);
      setCustomerWallet(null);

      // Refresh purchases
      const purchasesRes = await getLivePurchases(activeLive.id);
      setPurchases(purchasesRes.data);

      // Refresh active live stats
      loadData();

      // Focus back to customer ID
      customerIdRef.current?.focus();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al registrar compra");
    } finally {
      setSubmitting(false);
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
    <div className="min-h-screen bg-gray-50">
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
              <img src={LOGO_URL} alt="Outlets USA EC" className="h-10 object-contain" />
            </div>
          </div>
          
          {activeLive && (
            <Badge className="bg-red-600 text-white animate-pulse text-sm px-3 py-1">
              <Radio className="h-3 w-3 mr-2 inline" />
              EN VIVO
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* No Active Live */}
        {!activeLive && (
          <div className="space-y-6">
            <Card className="rounded-2xl border-dashed border-2 border-gray-300">
              <CardContent className="p-8 text-center">
                <Radio className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-700 mb-2">No hay Live activo</h2>
                <p className="text-gray-500 mb-6">Crea o inicia un Live para comenzar a registrar compras</p>
                
                <Dialog open={createLiveDialogOpen} onOpenChange={setCreateLiveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      className="bg-red-600 hover:bg-red-700 font-bold rounded-xl h-12 px-6"
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
                      <Button 
                        className="w-full h-12 bg-red-600 hover:bg-red-700 font-bold rounded-xl"
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

            {/* Inactive Lives */}
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
                          className="bg-green-600 hover:bg-green-700 font-bold rounded-xl"
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
          </div>
        )}

        {/* Active Live - Purchase Mode */}
        {activeLive && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Purchase Form - LEFT */}
            <div className="space-y-4">
              {/* Live Header */}
              <Card className="bg-gradient-to-r from-red-600 to-red-700 text-white rounded-2xl border-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-red-100">EN VIVO</span>
                      </div>
                      <h2 className="text-xl font-bold">{activeLive.title}</h2>
                    </div>
                    <Button 
                      onClick={handleEndLive}
                      variant="outline"
                      className="border-white/30 text-white hover:bg-white/10 font-bold"
                      data-testid="end-live-btn"
                    >
                      <Square className="h-4 w-4 mr-2" />
                      Finalizar
                    </Button>
                  </div>
                  <div className="flex gap-6 mt-4 pt-4 border-t border-white/20">
                    <div>
                      <p className="text-red-100 text-xs">Ventas</p>
                      <p className="text-2xl font-bold">{activeLive.purchase_count || 0}</p>
                    </div>
                    <div>
                      <p className="text-red-100 text-xs">Total</p>
                      <p className="text-2xl font-bold">${(activeLive.total_sales || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-red-100 text-xs">Comisiones</p>
                      <p className="text-2xl font-bold">${(activeLive.total_commissions || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Purchase Form */}
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    Registro Rápido
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmitPurchase} className="space-y-4">
                    {/* Customer ID */}
                    <div>
                      <Label className="text-sm font-medium">ID Cliente</Label>
                      <div className="relative mt-1">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                          ref={customerIdRef}
                          placeholder="Ej: J4582"
                          value={purchaseForm.customer_id}
                          onChange={(e) => handleCustomerIdChange(e.target.value.toUpperCase())}
                          className="pl-10 h-14 text-2xl font-bold text-center rounded-xl uppercase"
                          data-testid="purchase-customer-id"
                          autoComplete="off"
                        />
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

                    {/* Store */}
                    <div>
                      <Label className="text-sm font-medium">Tienda</Label>
                      <Select
                        value={purchaseForm.store}
                        onValueChange={(value) => setPurchaseForm({ ...purchaseForm, store: value })}
                      >
                        <SelectTrigger className="h-12 rounded-xl mt-1" data-testid="purchase-store">
                          <Store className="h-5 w-5 text-gray-400 mr-2" />
                          <SelectValue placeholder="Seleccionar tienda" />
                        </SelectTrigger>
                        <SelectContent>
                          {STORES.map((store) => (
                            <SelectItem key={store} value={store}>{store}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                          placeholder="0.00"
                          value={purchaseForm.price}
                          onChange={(e) => setPurchaseForm({ ...purchaseForm, price: e.target.value })}
                          className="pl-10 h-14 text-2xl font-bold text-center rounded-xl"
                          data-testid="purchase-price"
                        />
                      </div>
                      {purchaseForm.price && (
                        <div className="mt-2 p-3 bg-gray-50 rounded-xl">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Precio:</span>
                            <span className="font-medium">${parseFloat(purchaseForm.price || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Comisión:</span>
                            <span className="font-medium">${COMMISSION.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t">
                            <span>Total:</span>
                            <span className="text-red-600">
                              ${(parseFloat(purchaseForm.price || 0) + COMMISSION).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      className="w-full h-16 bg-slate-900 hover:bg-slate-800 text-white font-black text-xl rounded-2xl shadow-xl active:scale-95 transition-transform"
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
            </div>

            {/* Purchases List - RIGHT */}
            <div>
              <Card className="rounded-2xl h-[calc(100vh-160px)]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Compras del Live ({purchases.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <ScrollArea className="h-[calc(100vh-260px)]">
                    {purchases.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Sin compras aún</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {purchases.map((purchase) => (
                          <Card 
                            key={purchase.id} 
                            className="rounded-xl border-gray-100"
                            data-testid="live-purchase-item"
                          >
                            <CardContent className="p-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="font-bold">
                                      #{purchase.customer_id}
                                    </Badge>
                                    <span className="text-xs text-gray-400">
                                      {new Date(purchase.created_at).toLocaleTimeString('es-ES', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                  <p className="font-medium text-slate-800">{purchase.item_name}</p>
                                  <p className="text-sm text-gray-500">{purchase.store}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-red-600">${purchase.total.toFixed(2)}</p>
                                  <p className="text-xs text-gray-400">
                                    ${purchase.price.toFixed(2)} + ${purchase.commission.toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
