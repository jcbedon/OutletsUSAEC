import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { searchInvoices, annulInvoice, getInvoiceDetail, getAllClients, getMyTenant } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import InvoiceDialog from "@/components/InvoiceDialog";
import { 
  Search, 
  FileText, 
  CheckCircle, 
  Clock, 
  Ban, 
  Loader2,
  AlertTriangle,
  User,
  Phone,
  Mail,
  Calendar,
  Plus,
  ArrowLeft,
  ChevronRight,
  Upload
} from "lucide-react";

const DEFAULT_LOGO = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";

export default function AdminInvoices() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const logoUrl = user?.tenant_logo || DEFAULT_LOGO;
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("active"); // active, annulled, all
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showAnnulDialog, setShowAnnulDialog] = useState(false);
  const [invoiceToAnnul, setInvoiceToAnnul] = useState(null);
  const [annulling, setAnnulling] = useState(false);
  
  // For creating new invoice - client selection
  const [showClientSelector, setShowClientSelector] = useState(false);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [loadingClients, setLoadingClients] = useState(false);
  
  // For InvoiceDialog
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [selectedClientForInvoice, setSelectedClientForInvoice] = useState(null);
  const [tenantInfo, setTenantInfo] = useState(null);
  
  const defaultTenantInfo = {
    business_name: user?.tenant_name || "Personal Shopper",
    owner_name: user?.name || "",
    email: user?.email || "",
    logo_url: logoUrl
  };

  useEffect(() => {
    loadInvoices();
  }, [activeTab]);

  const loadInvoices = async (query = searchQuery) => {
    try {
      setLoading(true);
      const statusFilter = activeTab === "active" ? "active" : activeTab === "annulled" ? "annulled" : "all";
      const res = await searchInvoices(query, statusFilter);
      setInvoices(res.data);
    } catch (error) {
      toast.error("Error al cargar facturas");
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      setLoadingClients(true);
      const res = await getAllClients();
      setClients(res.data);
    } catch (error) {
      toast.error("Error al cargar clientes");
    } finally {
      setLoadingClients(false);
    }
  };

  const handleNewInvoiceClick = () => {
    loadClients();
    setClientSearch("");
    setShowClientSelector(true);
  };

  const handleSelectClientForInvoice = async (client) => {
    setSelectedClientForInvoice(client);
    setShowClientSelector(false);
    
    // Load tenant info
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

  const handleSearch = (e) => {
    e.preventDefault();
    loadInvoices(searchQuery);
  };

  const handleViewInvoice = async (invoice) => {
    try {
      const res = await getInvoiceDetail(invoice.id);
      setSelectedInvoice(res.data);
    } catch (error) {
      toast.error("Error al cargar detalles de la factura");
    }
  };

  const handleAnnulClick = (invoice, e) => {
    e.stopPropagation();
    setInvoiceToAnnul(invoice);
    setShowAnnulDialog(true);
  };

  const confirmAnnul = async () => {
    if (!invoiceToAnnul) return;
    
    try {
      setAnnulling(true);
      await annulInvoice(invoiceToAnnul.id);
      toast.success(`Factura ${invoiceToAnnul.invoice_number} anulada exitosamente`);
      setShowAnnulDialog(false);
      setInvoiceToAnnul(null);
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al anular factura");
    } finally {
      setAnnulling(false);
    }
  };

  const getStatusBadge = (invoice) => {
    if (invoice.is_annulled) {
      return (
        <Badge className="bg-red-100 text-red-800">
          <Ban className="h-3 w-3 mr-1" /> Anulada
        </Badge>
      );
    }
    if (invoice.status === "approved") {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" /> Pagada
        </Badge>
      );
    }
    return (
      <Badge className="bg-yellow-100 text-yellow-800">
        <Clock className="h-3 w-3 mr-1" /> Pendiente
      </Badge>
    );
  };

  const tabs = [
    { id: "active", label: "Activas", icon: FileText },
    { id: "annulled", label: "Anuladas", icon: Ban },
    { id: "all", label: "Todas", icon: Search }
  ];

  // Count invoices by type for tabs
  const activeCount = invoices.filter(i => !i.is_annulled).length;
  const annulledCount = invoices.filter(i => i.is_annulled).length;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%)' }}>
      {/* Header - White Style */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          {/* Left: Logo + Business Name */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="text-gray-600 hover:bg-gray-100 -ml-2">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
            <div>
              <h1 className="text-xl font-bold" style={{ color: '#1E3A5F' }}>{user?.tenant_name || "Outlets USA EC"}</h1>
              <p className="text-sm text-gray-500">{user?.name}</p>
            </div>
          </div>
          
          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="text-gray-500">
              <Upload className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* Blue Banner - Module Info */}
        <div className="px-6 pb-4">
          <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: '#1E3A5F' }}>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse"></div>
              <div>
                <h2 className="text-white font-bold text-lg">Gestión de Facturas</h2>
                <p className="text-white/70 text-sm">
                  {invoices.filter(i => !i.is_annulled).length} facturas activas | ${invoices.filter(i => !i.is_annulled).reduce((sum, i) => sum + (i.total || 0), 0).toFixed(2)} total
                </p>
              </div>
            </div>
            <Button
              onClick={handleNewInvoiceClick}
              className="bg-green-500 hover:bg-green-600 text-white font-bold px-6 py-3 rounded-xl shadow-lg"
              data-testid="new-invoice-btn"
            >
              <Plus className="h-5 w-5 mr-2" />
              Nueva Factura
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder="Buscar por número de factura, cliente, email, WhatsApp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 text-lg rounded-xl"
            data-testid="invoice-search-input"
          />
        </div>
        <Button 
          type="submit" 
          className="h-12 px-6 rounded-xl"
          style={{ background: '#1E3A5F' }}
          data-testid="invoice-search-btn"
        >
          <Search className="h-5 w-5 mr-2" />
          Buscar
        </Button>
      </form>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-3">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className="rounded-lg"
            style={activeTab === tab.id ? { background: '#1E3A5F' } : {}}
            data-testid={`tab-${tab.id}`}
          >
            <tab.icon className="h-4 w-4 mr-2" />
            {tab.label}
            {tab.id === "active" && activeTab === "all" && (
              <Badge className="ml-2 bg-blue-500 text-white text-xs">{activeCount}</Badge>
            )}
            {tab.id === "annulled" && activeTab === "all" && (
              <Badge className="ml-2 bg-red-500 text-white text-xs">{annulledCount}</Badge>
            )}
          </Button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-600">No se encontraron facturas</p>
          <p className="text-sm text-gray-400 mt-2">
            {searchQuery ? "Intenta con otros términos de búsqueda" : "Aún no hay facturas registradas"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{invoices.length} factura(s) encontrada(s)</p>
          
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                invoice.is_annulled 
                  ? "bg-red-50 border-red-200 hover:border-red-300" 
                  : "bg-white hover:border-blue-300 hover:shadow-md"
              }`}
              onClick={() => handleViewInvoice(invoice)}
              data-testid={`invoice-row-${invoice.invoice_number}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div 
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      invoice.is_annulled ? "bg-red-100" : "bg-blue-50"
                    }`}
                  >
                    <FileText className={`h-6 w-6 ${invoice.is_annulled ? "text-red-500" : "text-blue-600"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-lg" style={{ color: invoice.is_annulled ? '#991B1B' : '#1E3A5F' }}>
                        {invoice.invoice_number}
                      </p>
                      {getStatusBadge(invoice)}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {invoice.client?.name || invoice.customer_id}
                      </span>
                      {invoice.client?.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {invoice.client.email}
                        </span>
                      )}
                      {invoice.client?.whatsapp && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {invoice.client.whatsapp}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(invoice.created_at).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                      {invoice.is_annulled && invoice.annulled_at && (
                        <span className="ml-2 text-red-600">
                          · Anulada el {new Date(invoice.annulled_at).toLocaleDateString("es-ES")} por {invoice.annulled_by_name}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`font-extrabold text-xl ${invoice.is_annulled ? "text-red-600 line-through" : ""}`} style={{ color: invoice.is_annulled ? undefined : '#1E3A5F' }}>
                      ${invoice.total.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">{invoice.purchase_ids?.length || 0} items</p>
                  </div>
                  {!invoice.is_annulled && user?.role === "admin" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={(e) => handleAnnulClick(invoice, e)}
                      data-testid={`annul-btn-${invoice.invoice_number}`}
                    >
                      <Ban className="h-4 w-4 mr-1" />
                      Anular
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: '#1E3A5F' }}>
              <FileText className="h-5 w-5" />
              Factura {selectedInvoice?.invoice_number}
              {selectedInvoice?.is_annulled && (
                <Badge className="bg-red-100 text-red-800 ml-2">ANULADA</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedInvoice && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                {/* Client Info */}
                <div className="p-4 rounded-xl bg-gray-50">
                  <p className="text-sm text-gray-500 mb-2">Cliente</p>
                  <p className="font-bold text-lg">{selectedInvoice.client?.name || selectedInvoice.customer_id}</p>
                  {selectedInvoice.client && (
                    <div className="flex gap-4 text-sm text-gray-600 mt-1">
                      {selectedInvoice.client.email && <span>{selectedInvoice.client.email}</span>}
                      {selectedInvoice.client.whatsapp && <span>{selectedInvoice.client.whatsapp}</span>}
                    </div>
                  )}
                </div>

                {/* Annulled Info */}
                {selectedInvoice.is_annulled && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-5 w-5" />
                      <span className="font-bold">Factura Anulada</span>
                    </div>
                    <p className="text-sm text-red-600 mt-1">
                      Anulada el {new Date(selectedInvoice.annulled_at).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })} por <strong>{selectedInvoice.annulled_by_name}</strong>
                    </p>
                  </div>
                )}

                {/* Purchases */}
                <div>
                  <p className="text-sm text-gray-500 mb-2">Items ({selectedInvoice.purchases?.length || 0})</p>
                  <div className="space-y-2">
                    {(selectedInvoice.purchases || []).map((p, idx) => (
                      <div key={idx} className="p-3 rounded-lg border bg-white">
                        <div className="flex justify-between">
                          <div>
                            <p className="font-medium">{p.item_name}</p>
                            <p className="text-sm text-gray-500">{p.store}</p>
                          </div>
                          <p className="font-bold">${p.total.toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="p-4 rounded-xl" style={{ background: 'rgba(30,58,95,0.05)' }}>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span>${selectedInvoice.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Impuestos</span>
                      <span>${selectedInvoice.total_tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Comisiones</span>
                      <span>${selectedInvoice.total_commission.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                      <span>Total</span>
                      <span className={selectedInvoice.is_annulled ? "text-red-600 line-through" : ""} style={{ color: selectedInvoice.is_annulled ? undefined : '#1E3A5F' }}>
                        ${selectedInvoice.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Annul Confirmation Dialog */}
      <Dialog open={showAnnulDialog} onOpenChange={setShowAnnulDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Anulación
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-gray-600">
              ¿Estás seguro de que deseas anular la factura <strong>{invoiceToAnnul?.invoice_number}</strong>?
            </p>
            <div className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <p className="text-sm text-yellow-800">
                <strong>Nota:</strong> Esta acción no elimina la factura, solo la marca como anulada. 
                Las compras asociadas volverán a estado pendiente y podrán ser facturadas nuevamente.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAnnulDialog(false)}
              disabled={annulling}
            >
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmAnnul}
              disabled={annulling}
              data-testid="confirm-annul-btn"
            >
              {annulling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Anulando...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4 mr-2" />
                  Sí, Anular Factura
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Selector Dialog */}
      <Dialog open={showClientSelector} onOpenChange={setShowClientSelector}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: '#1E3A5F' }}>
              <User className="h-5 w-5" />
              Seleccionar Cliente para Nueva Factura
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Client Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar cliente por nombre, ID o WhatsApp..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="pl-10 h-11"
                data-testid="client-search-input"
              />
            </div>
            
            {/* Client List */}
            {loadingClients ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {clients
                    .filter(c => 
                      c.name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
                      c.customer_id?.toLowerCase().includes(clientSearch.toLowerCase()) ||
                      (c.whatsapp && c.whatsapp.includes(clientSearch))
                    )
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((client) => (
                      <div
                        key={client.id}
                        className="p-3 rounded-xl border bg-white hover:border-blue-300 hover:shadow-md cursor-pointer transition-all flex items-center justify-between"
                        onClick={() => handleSelectClientForInvoice(client)}
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
                    ))}
                  {clients.length === 0 && !loadingClients && (
                    <div className="text-center py-8 text-gray-500">
                      <User className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                      <p>No se encontraron clientes</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice Dialog - Full Process */}
      <InvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={(open) => {
          setInvoiceDialogOpen(open);
          if (!open) {
            loadInvoices(); // Reload invoices when dialog closes
          }
        }}
        client={selectedClientForInvoice}
        tenantInfo={tenantInfo || defaultTenantInfo}
      />
      </div>
    </div>
  );
}
