import { useState, useEffect } from "react";
import { getAllClients, getPendingPurchases, createInvoice } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Search, 
  User, 
  FileText, 
  Loader2,
  ShoppingBag,
  DollarSign,
  ChevronRight,
  ArrowLeft
} from "lucide-react";

export default function CreateInvoiceDialog({ open, onOpenChange, onSuccess }) {
  const [step, setStep] = useState(1); // 1: Select Client, 2: Select Purchases
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      loadClients();
      // Reset state
      setStep(1);
      setSelectedClient(null);
      setPendingPurchases([]);
      setSelectedPurchases([]);
      setClientSearch("");
    }
  }, [open]);

  const loadClients = async () => {
    try {
      setLoading(true);
      const res = await getAllClients();
      setClients(res.data);
    } catch (error) {
      toast.error("Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClient = async (client) => {
    setSelectedClient(client);
    setLoading(true);
    try {
      const res = await getPendingPurchases(client.customer_id);
      setPendingPurchases(res.data);
      // Auto-select all purchases
      setSelectedPurchases(res.data.map(p => p.id));
      setStep(2);
    } catch (error) {
      toast.error("Error al cargar compras pendientes");
    } finally {
      setLoading(false);
    }
  };

  const togglePurchase = (purchaseId) => {
    setSelectedPurchases(prev => 
      prev.includes(purchaseId)
        ? prev.filter(id => id !== purchaseId)
        : [...prev, purchaseId]
    );
  };

  const toggleAll = () => {
    if (selectedPurchases.length === pendingPurchases.length) {
      setSelectedPurchases([]);
    } else {
      setSelectedPurchases(pendingPurchases.map(p => p.id));
    }
  };

  const handleCreateInvoice = async () => {
    if (selectedPurchases.length === 0) {
      toast.error("Selecciona al menos una compra");
      return;
    }

    try {
      setCreating(true);
      await createInvoice({
        customer_id: selectedClient.customer_id,
        purchase_ids: selectedPurchases
      });
      toast.success("Factura creada exitosamente");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear factura");
    } finally {
      setCreating(false);
    }
  };

  const filteredClients = clients
    .filter(c => 
      c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.customer_id.toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.whatsapp && c.whatsapp.includes(clientSearch))
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedTotal = pendingPurchases
    .filter(p => selectedPurchases.includes(p.id))
    .reduce((sum, p) => sum + (p.total || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: '#1E3A5F' }}>
            <FileText className="h-5 w-5" />
            {step === 1 ? "Seleccionar Cliente" : "Crear Factura"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar cliente por nombre, ID o WhatsApp..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="pl-10 h-11"
                data-testid="create-invoice-client-search"
              />
            </div>

            {/* Client List */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {filteredClients.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <User className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                      <p>No se encontraron clientes</p>
                    </div>
                  ) : (
                    filteredClients.map((client) => (
                      <div
                        key={client.id}
                        className="p-3 rounded-xl border bg-white hover:border-blue-300 hover:shadow-md cursor-pointer transition-all flex items-center justify-between"
                        onClick={() => handleSelectClient(client)}
                        data-testid={`select-client-${client.customer_id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                            <User className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium" style={{ color: '#1E3A5F' }}>{client.name}</p>
                            <div className="flex gap-3 text-sm text-gray-500">
                              <span>#{client.customer_id}</span>
                              {client.whatsapp && <span>{client.whatsapp}</span>}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {/* Back Button + Client Info */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                className="h-8 px-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-3 flex-1 p-2 rounded-lg bg-blue-50">
                <User className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-sm">{selectedClient?.name}</p>
                  <p className="text-xs text-gray-500">#{selectedClient?.customer_id}</p>
                </div>
              </div>
            </div>

            {/* Purchases List */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : pendingPurchases.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingBag className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium text-gray-600">Sin compras pendientes</p>
                <p className="text-sm text-gray-400">Este cliente no tiene compras pendientes de facturar</p>
              </div>
            ) : (
              <>
                {/* Select All */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedPurchases.length === pendingPurchases.length}
                      onCheckedChange={toggleAll}
                    />
                    <span className="text-sm font-medium">Seleccionar todas ({pendingPurchases.length})</span>
                  </label>
                  <Badge className="bg-green-100 text-green-800">
                    <DollarSign className="h-3 w-3 mr-1" />
                    {selectedPurchases.length} seleccionadas
                  </Badge>
                </div>

                <ScrollArea className="h-[280px]">
                  <div className="space-y-2">
                    {pendingPurchases.map((purchase) => (
                      <div
                        key={purchase.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedPurchases.includes(purchase.id)
                            ? "bg-blue-50 border-blue-300"
                            : "bg-white hover:border-gray-300"
                        }`}
                        onClick={() => togglePurchase(purchase.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedPurchases.includes(purchase.id)}
                            onCheckedChange={() => togglePurchase(purchase.id)}
                          />
                          <div className="flex-1">
                            <p className="font-medium">{purchase.item_name}</p>
                            <div className="flex gap-3 text-sm text-gray-500">
                              <span>{purchase.store}</span>
                              <span>{new Date(purchase.created_at).toLocaleDateString("es-ES")}</span>
                            </div>
                          </div>
                          <p className="font-bold" style={{ color: '#1E3A5F' }}>
                            ${purchase.total.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Total */}
                <div className="p-4 rounded-xl" style={{ background: 'rgba(30,58,95,0.05)' }}>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Total Factura</span>
                    <span className="text-2xl font-bold" style={{ color: '#1E3A5F' }}>
                      ${selectedTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {step === 2 && pendingPurchases.length > 0 && (
            <Button
              onClick={handleCreateInvoice}
              disabled={creating || selectedPurchases.length === 0}
              style={{ background: '#1E3A5F' }}
              data-testid="confirm-create-invoice-btn"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Crear Factura
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
