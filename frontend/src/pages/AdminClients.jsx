import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { getAllClients, updateClientCommission, createClient, updateClient, getMyTenant } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Users, Search, Phone, Globe, Wallet, Edit, Save, UserPlus, Key, DollarSign, FileText } from "lucide-react";
import InvoiceDialog from "@/components/InvoiceDialog";

export default function AdminClients() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", whatsapp: "", country: "", email: "", new_password: "", commission_fee: ""
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newClient, setNewClient] = useState({
    name: "", country: "", whatsapp: "", email: "", password: "",
    commission_fee: 3, initial_balance: 0
  });
  
  // Invoice dialog state
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [selectedClientForInvoice, setSelectedClientForInvoice] = useState(null);
  const [tenantInfo, setTenantInfo] = useState(null);

  const logoUrl = user?.tenant_logo || "";
  
  // Default tenant info from user context (fallback)
  const defaultTenantInfo = {
    business_name: user?.tenant_name || "Personal Shopper",
    owner_name: user?.name || "",
    email: user?.email || "",
    logo_url: logoUrl
  };

  // Fetch fresh tenant info when opening invoice dialog
  const openInvoiceDialog = async (client) => {
    setSelectedClientForInvoice(client);
    try {
      const res = await getMyTenant();
      setTenantInfo({
        business_name: res.data.business_name || user?.tenant_name || "Personal Shopper",
        owner_name: res.data.owner_name || user?.name || "",
        email: res.data.admin_email || user?.email || "",
        logo_url: res.data.logo_url || logoUrl
      });
    } catch (error) {
      console.error("Error fetching tenant info:", error);
      setTenantInfo(defaultTenantInfo);
    }
    setInvoiceDialogOpen(true);
  };

  useEffect(() => { loadClients(); }, []);

  useEffect(() => {
    if (search) {
      const searchTerms = search.toLowerCase().trim().split(/\s+/);
      setFilteredClients(clients.filter(c => {
        const name = c.name?.toLowerCase() || "";
        const customerId = c.customer_id?.toLowerCase() || "";
        const whatsapp = c.whatsapp || "";
        
        // Buscar cada término en nombre, ID o WhatsApp
        return searchTerms.every(term => 
          name.includes(term) ||
          customerId.includes(term) ||
          whatsapp.includes(term) ||
          // Buscar por iniciales (primera letra de cada palabra del nombre)
          name.split(/\s+/).some(word => word.startsWith(term))
        );
      }));
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

  const handleOpenEditDialog = (client) => {
    setEditingClient(client);
    setEditForm({
      name: client.name || "",
      whatsapp: client.whatsapp || "",
      country: client.country || "",
      email: client.email || "",
      new_password: "",
      commission_fee: client.commission_fee?.toString() || "3"
    });
    setEditDialogOpen(true);
  };

  const handleSaveClient = async () => {
    if (!editForm.name || !editForm.whatsapp) {
      toast.error("Nombre y WhatsApp son requeridos");
      return;
    }
    setSubmitting(true);
    try {
      const dataToSend = { ...editForm };
      if (!dataToSend.new_password) {
        delete dataToSend.new_password;
      }
      if (dataToSend.commission_fee) {
        dataToSend.commission_fee = parseFloat(dataToSend.commission_fee);
      } else {
        delete dataToSend.commission_fee;
      }
      await updateClient(editingClient.id, dataToSend);
      toast.success(`Cliente ${editForm.name} actualizado exitosamente`);
      setEditDialogOpen(false);
      setEditingClient(null);
      loadClients();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al actualizar cliente");
    } finally {
      setSubmitting(false);
    }
  };

  const setEdit = (key, val) => setEditForm({ ...editForm, [key]: val });

  const handleCreateClient = async () => {
    if (!newClient.name || !newClient.whatsapp || !newClient.password) {
      toast.error("Completa nombre, WhatsApp y contraseña");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createClient(newClient);
      toast.success(`Cliente creado: #${res.data.customer_id}`);
      setCreateDialogOpen(false);
      setNewClient({ name: "", country: "", whatsapp: "", email: "", password: "", commission_fee: 3, initial_balance: 0 });
      loadClients();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear cliente");
    } finally {
      setSubmitting(false);
    }
  };

  const setNew = (key, val) => setNewClient({ ...newClient, [key]: val });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="app-bg">
      <div className="sticky top-0 z-50 border-b" style={{ background: 'rgba(255,255,255,0.95)', borderColor: '#E5E7EB' }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="bg-white rounded-lg p-1">
            <img src={logoUrl} alt="Logo" className="h-10 object-contain logo-transparent" />
          </div>
          <span className="font-bold text-slate-800 flex-1">Clientes</span>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl" data-testid="open-create-client-btn" style={{ background: '#1E3A5F', color: 'white' }}>
                <UserPlus className="h-4 w-4 mr-2" /> Crear Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crear Nuevo Cliente</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Nombre *</Label>
                  <Input data-testid="new-client-name" placeholder="Nombre completo" className="rounded-xl mt-1"
                    value={newClient.name} onChange={(e) => setNew("name", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>WhatsApp *</Label>
                    <Input data-testid="new-client-whatsapp" placeholder="+593..." className="rounded-xl mt-1"
                      value={newClient.whatsapp} onChange={(e) => setNew("whatsapp", e.target.value)} />
                  </div>
                  <div>
                    <Label>País</Label>
                    <Input placeholder="Ecuador" className="rounded-xl mt-1"
                      value={newClient.country} onChange={(e) => setNew("country", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Email (opcional)</Label>
                  <Input type="email" placeholder="email@..." className="rounded-xl mt-1"
                    value={newClient.email} onChange={(e) => setNew("email", e.target.value)} />
                </div>
                <div>
                  <Label>Contraseña *</Label>
                  <Input data-testid="new-client-password" type="password" placeholder="Contraseña" className="rounded-xl mt-1"
                    value={newClient.password} onChange={(e) => setNew("password", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Comisión (USD)</Label>
                    <Input type="number" step="0.01" min="0" placeholder="3.00" className="rounded-xl mt-1"
                      value={newClient.commission_fee} onChange={(e) => setNew("commission_fee", parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                    <Label>Saldo Inicial (USD)</Label>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" className="rounded-xl mt-1"
                      value={newClient.initial_balance} onChange={(e) => setNew("initial_balance", parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
                <Button onClick={handleCreateClient} disabled={submitting} data-testid="submit-create-client-btn"
                  className="w-full h-12 font-bold rounded-xl" style={{ background: '#1E3A5F', color: 'white' }}>
                  {submitting ? "Creando..." : "Crear Cliente"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
                  {clients.filter(c => c.wallet_balance > 0).length}
                </p>
                <p className="text-xs text-gray-500">Con Saldo</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input 
            placeholder="Buscar por nombre, apellido, iniciales, ID o WhatsApp..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12 rounded-xl border-2 focus:border-blue-400" 
            data-testid="search-clients-input" 
          />
          {search && (
            <button 
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              data-testid="clear-search-btn"
            >
              ✕
            </button>
          )}
        </div>
        
        {search && (
          <p className="text-sm text-gray-500 mb-3">
            Mostrando {filteredClients.length} de {clients.length} clientes
          </p>
        )}

        <ScrollArea className="h-[calc(100vh-380px)]">
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
                          <Badge variant="outline" className="font-bold text-red-600 border-red-200">#{client.customer_id}</Badge>
                          <span className="font-bold text-slate-800">{client.name}</span>
                        </div>
                        <div className="space-y-1 text-sm text-gray-500">
                          <div className="flex items-center gap-2"><Phone className="h-4 w-4" /><span>{client.whatsapp}</span></div>
                          <div className="flex items-center gap-2"><Globe className="h-4 w-4" /><span>{client.country}</span></div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`px-3 py-2 rounded-xl ${client.pending_balance < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                          <p className="text-xs text-gray-500">Saldo Pendiente</p>
                          <p className={`text-xl font-bold ${client.pending_balance < 0 ? 'text-red-600' : 'text-green-600'}`}
                            data-testid={`pending-balance-${client.customer_id}`}>
                            {client.pending_balance < 0 ? '-' : '+'}${Math.abs(client.pending_balance || 0).toFixed(2)}
                          </p>
                          {(client.total_purchases > 0 || client.total_shipping > 0) && (
                            <p className="text-xs text-gray-400 mt-1">
                              Compras: ${client.total_purchases?.toFixed(2)} | Envío: ${client.total_shipping?.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-lg border-blue-200 text-blue-600 hover:bg-blue-50"
                        onClick={() => openInvoiceDialog(client)}
                        data-testid={`invoice-client-${client.customer_id}`}
                      >
                        <FileText className="h-4 w-4 mr-1" /> Factura
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-lg"
                        onClick={() => handleOpenEditDialog(client)}
                        data-testid={`edit-client-${client.customer_id}`}>
                        <Edit className="h-4 w-4 mr-1" /> Editar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Edit Client Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Editar Cliente - #{editingClient?.customer_id}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Nombre *</Label>
                <Input 
                  placeholder="Nombre completo" 
                  className="rounded-xl mt-1"
                  value={editForm.name} 
                  onChange={(e) => setEdit("name", e.target.value)} 
                  data-testid="edit-client-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>WhatsApp *</Label>
                  <Input 
                    placeholder="+593..." 
                    className="rounded-xl mt-1"
                    value={editForm.whatsapp} 
                    onChange={(e) => setEdit("whatsapp", e.target.value)}
                    data-testid="edit-client-whatsapp"
                  />
                </div>
                <div>
                  <Label>País</Label>
                  <Input 
                    placeholder="Ecuador" 
                    className="rounded-xl mt-1"
                    value={editForm.country} 
                    onChange={(e) => setEdit("country", e.target.value)} 
                  />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input 
                  type="email" 
                  placeholder="email@..." 
                  className="rounded-xl mt-1"
                  value={editForm.email} 
                  onChange={(e) => setEdit("email", e.target.value)} 
                />
              </div>
              
              {/* Password Section */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  <Label className="text-green-600 font-medium">Comisión por Compra</Label>
                </div>
                <Input 
                  type="number" 
                  step="0.01"
                  min="0"
                  placeholder="3.00" 
                  className="rounded-xl"
                  value={editForm.commission_fee} 
                  onChange={(e) => setEdit("commission_fee", e.target.value)}
                  data-testid="edit-client-commission"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Esta comisión se aplicará a las nuevas compras de este cliente
                </p>
              </div>
              
              {/* Change Password Section */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="h-4 w-4 text-orange-500" />
                  <Label className="text-orange-600 font-medium">Cambiar Contraseña</Label>
                </div>
                <Input 
                  type="password" 
                  placeholder="Nueva contraseña (dejar vacío para no cambiar)" 
                  className="rounded-xl"
                  value={editForm.new_password} 
                  onChange={(e) => setEdit("new_password", e.target.value)}
                  data-testid="edit-client-password"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Solo completa este campo si deseas asignar una nueva contraseña
                </p>
              </div>

              <Button 
                onClick={handleSaveClient} 
                disabled={submitting}
                className="w-full h-12 font-bold rounded-xl" 
                style={{ background: '#1E3A5F', color: 'white' }}
                data-testid="save-client-btn"
              >
                <Save className="h-5 w-5 mr-2" />
                {submitting ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Invoice Dialog */}
        <InvoiceDialog
          open={invoiceDialogOpen}
          onOpenChange={setInvoiceDialogOpen}
          client={selectedClientForInvoice}
          tenantInfo={tenantInfo || defaultTenantInfo}
        />
      </div>
    </div>
  );
}
