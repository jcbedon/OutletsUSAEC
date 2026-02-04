import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAllClients, updateClientCommission } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Users, Search, Phone, Globe, Wallet, DollarSign, Edit, Save } from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";

export default function AdminClients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(null);
  const [newCommission, setNewCommission] = useState("");

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (search) {
      const filtered = clients.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.customer_id.toLowerCase().includes(search.toLowerCase()) ||
          c.whatsapp.includes(search)
      );
      setFilteredClients(filtered);
    } else {
      setFilteredClients(clients);
    }
  }, [search, clients]);

  const loadClients = async () => {
    try {
      const response = await getAllClients();
      setClients(response.data);
      setFilteredClients(response.data);
    } catch (error) {
      toast.error("Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  };

  const handleEditCommission = (client) => {
    setEditingClient(client);
    setNewCommission((client.commission_fee || 3).toString());
  };

  const handleSaveCommission = async () => {
    const commission = parseFloat(newCommission);
    if (isNaN(commission) || commission < 0) {
      toast.error("Ingresa un valor válido");
      return;
    }

    try {
      await updateClientCommission(editingClient.id, commission);
      toast.success(`Comisión de ${editingClient.name} actualizada a $${commission.toFixed(2)}`);
      setEditingClient(null);
      loadClients();
    } catch (error) {
      toast.error("Error al actualizar comisión");
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
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="bg-white rounded-lg p-1">
            <img src={LOGO_URL} alt="Outlets USA EC" className="h-10 object-contain" />
          </div>
          <span className="font-bold text-slate-800">Clientes</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="rounded-xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-800">{clients.length}</p>
                <p className="text-xs text-gray-500">Total Clientes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Wallet className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-800">
                  {clients.filter((c) => c.wallet_balance > 0).length}
                </p>
                <p className="text-xs text-gray-500">Con Saldo</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder="Buscar por nombre, ID o WhatsApp..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12 rounded-xl"
            data-testid="search-clients-input"
          />
        </div>

        <ScrollArea className="h-[calc(100vh-320px)]">
          {filteredClients.length === 0 ? (
            <Card className="rounded-2xl border-dashed border-2 border-gray-200">
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No se encontraron clientes</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredClients.map((client) => (
                <Card key={client.id} className="rounded-xl hover:shadow-md transition-shadow" data-testid="client-item">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="font-bold text-red-600 border-red-200">
                            #{client.customer_id}
                          </Badge>
                          <span className="font-bold text-slate-800">{client.name}</span>
                        </div>
                        
                        <div className="space-y-1 text-sm text-gray-500">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <span>{client.whatsapp}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            <span>{client.country}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right space-y-2">
                        <div className={`px-3 py-2 rounded-xl ${
                          client.wallet_balance > 0 ? 'bg-green-50' : 'bg-gray-50'
                        }`}>
                          <p className="text-xs text-gray-500">Saldo</p>
                          <p className={`text-xl font-bold ${
                            client.wallet_balance > 0 ? 'text-green-600' : 'text-gray-400'
                          }`}>
                            ${client.wallet_balance?.toFixed(2) || '0.00'}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm text-gray-600">
                          Comisión: <span className="font-bold text-yellow-600">${(client.commission_fee || 3).toFixed(2)}</span>
                        </span>
                      </div>
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg"
                            onClick={() => handleEditCommission(client)}
                            data-testid={`edit-commission-${client.customer_id}`}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="rounded-2xl">
                          <DialogHeader>
                            <DialogTitle>Editar Comisión - #{client.customer_id}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <div>
                              <Label>Cliente</Label>
                              <p className="font-bold text-lg">{client.name}</p>
                            </div>
                            <div>
                              <Label>Comisión por compra (USD)</Label>
                              <div className="relative mt-2">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="3.00"
                                  value={newCommission}
                                  onChange={(e) => setNewCommission(e.target.value)}
                                  className="pl-10 h-14 text-2xl font-bold rounded-xl"
                                  data-testid="commission-input"
                                />
                              </div>
                              <p className="text-xs text-gray-500 mt-2">
                                Esta comisión se cobrará por cada compra del cliente
                              </p>
                            </div>
                            <Button
                              onClick={handleSaveCommission}
                              className="w-full h-12 bg-red-600 hover:bg-red-700 font-bold rounded-xl"
                              data-testid="save-commission-btn"
                            >
                              <Save className="h-5 w-5 mr-2" />
                              Guardar Comisión
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
