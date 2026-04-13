import { useState, useEffect } from "react";
import { useAuth } from "@/App";
import { useNavigate } from "react-router-dom";
import { 
  getWallet, 
  getUserPurchases, 
  getUserShipments, 
  getUserNotifications,
  getWalletTransactions,
  requestDepositWithProof,
  getClientInvoices,
  getInvoiceDetail
} from "@/lib/api";
import { generateInvoicePDF } from "@/lib/invoicePDF";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ShoppingBag, 
  Truck, 
  Bell, 
  LogOut, 
  Plus,
  History,
  Share2,
  Gift,
  Copy,
  Check,
  Camera,
  X,
  Paperclip,
  Eye,
  FileText,
  Download
} from "lucide-react";

const DEFAULT_LOGO = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const logoUrl = user?.tenant_logo || DEFAULT_LOGO;
  const navigate = useNavigate();
  const [wallet, setWallet] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositProof, setDepositProof] = useState(null);
  const [depositProofPreview, setDepositProofPreview] = useState(null);
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState([]);
  const [shipmentDetailOpen, setShipmentDetailOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [shipmentProducts, setShipmentProducts] = useState([]);
  const [clientInvoices, setClientInvoices] = useState([]);
  const [downloadingPDF, setDownloadingPDF] = useState(null);
  
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [walletRes, purchasesRes, shipmentsRes, notificationsRes, transactionsRes, invoicesRes] = await Promise.all([
        getWallet(user.user_id),
        getUserPurchases(user.user_id),
        getUserShipments(user.user_id),
        getUserNotifications(user.user_id),
        getWalletTransactions(user.user_id),
        getClientInvoices(user.customer_id).catch(() => ({ data: [] }))
      ]);

      setWallet(walletRes.data);
      setPurchases(purchasesRes.data);
      setShipments(shipmentsRes.data);
      setNotifications(notificationsRes.data);
      setTransactions(transactionsRes.data);
      setClientInvoices(invoicesRes.data || []);
    } catch (error) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadInvoice = async (invoice, e) => {
    if (e) e.stopPropagation();
    setDownloadingPDF(invoice.id);
    try {
      const res = await getInvoiceDetail(invoice.id);
      await generateInvoicePDF(res.data, { business_name: user?.tenant_name, logo_url: user?.tenant_logo });
      toast.success("PDF descargado");
    } catch (error) {
      toast.error("Error al descargar PDF");
    } finally {
      setDownloadingPDF(null);
    }
  };


  const handleRequestDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    setDepositSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("user_id", user.user_id);
      formData.append("amount", parseFloat(depositAmount));
      formData.append("description", "Solicitud de recarga");
      if (depositProof) {
        formData.append("file", depositProof);
      }
      await requestDepositWithProof(formData);
      toast.success("Solicitud de recarga enviada. Pendiente de aprobación.");
      setDepositDialogOpen(false);
      setDepositAmount("");
      setDepositProof(null);
      setDepositProofPreview(null);
      loadData();
    } catch (error) {
      toast.error("Error al solicitar recarga");
    } finally {
      setDepositSubmitting(false);
    }
  };

  const handleProofFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setDepositProof(file);
      const reader = new FileReader();
      reader.onloadend = () => setDepositProofPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleShareWhatsApp = () => {
    const referralCode = user?.customer_id || "";
    const message = `¡Hola! Te invito a comprar en OUTLETS USA EC. Usa mi código de referido *${referralCode}* al registrarte y ambos ganamos saldo. 🎁\n\n👉 Regístrate aquí: ${window.location.origin}/register?ref=${referralCode}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(user?.customer_id || "");
    setCopied(true);
    toast.success("¡Código copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = (status) => {
    const styles = {
      preparing: "bg-yellow-100 text-yellow-800",
      in_transit: "bg-blue-100 text-blue-800",
      delivered: "bg-green-100 text-green-800",
      confirmed: "bg-green-100 text-green-800",
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      waiting: "bg-gray-100 text-gray-800"
    };
    const labels = {
      preparing: "Preparación",
      in_transit: "En Tránsito",
      delivered: "Entregado",
      confirmed: "Confirmada",
      pending: "Pendiente",
      approved: "Aprobado",
      waiting: "En Espera"
    };
    return (
      <Badge className={`${styles[status] || "bg-gray-100 text-gray-800"} font-medium`}>
        {labels[status] || status}
      </Badge>
    );
  };

  // Function to get shipment status for a purchase by ID
  const getShipmentStatusForPurchase = (purchaseId) => {
    const shipment = shipments.find(s => s.purchase_ids && s.purchase_ids.includes(purchaseId));
    if (shipment) {
      return shipment.status;
    }
    return "waiting"; // En Espera if not in any shipment
  };

  // Function to find purchase by item name from transaction description
  const findPurchaseByDescription = (description) => {
    // Transaction description formats:
    // - "Compra: {item_name} ({store}) - Total: ${total}"
    // - "Comisión: {item_name} ({store})"
    let match = description.match(/Compra:\s*([^(]+)\s*\(/);
    if (!match) {
      match = description.match(/Comisión:\s*([^(]+)\s*\(/);
    }
    if (match) {
      const itemName = match[1].trim();
      return purchases.find(p => p.item_name === itemName);
    }
    return null;
  };

  // Function to get shipment status badge for transactions
  const getTransactionShipmentBadge = (tx) => {
    // For deposits, show the transaction status
    if (tx.type === 'deposit' || tx.type === 'referral_bonus' || tx.type === 'initial_balance') {
      return getStatusBadge(tx.status);
    }
    
    // For purchases, check shipment status
    if (tx.type === 'purchase') {
      // First try by purchase_id if available
      if (tx.purchase_id) {
        const shipmentStatus = getShipmentStatusForPurchase(tx.purchase_id);
        return getStatusBadge(shipmentStatus);
      }
      
      // Fallback: find purchase by description
      const purchase = findPurchaseByDescription(tx.description);
      if (purchase) {
        const shipmentStatus = getShipmentStatusForPurchase(purchase.id);
        return getStatusBadge(shipmentStatus);
      }
    }
    
    // Default to waiting
    return getStatusBadge("waiting");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="app-bg pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="bg-white rounded-lg p-1">
            <img src={logoUrl} alt="Logo" className="h-12 object-contain logo-transparent" />
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleLogout}
            data-testid="logout-btn"
            className="text-gray-500"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Wallet Card */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <Card className="text-white rounded-3xl shadow-2xl overflow-hidden" data-testid="wallet-card" style={{ background: 'linear-gradient(135deg, #1E3A5F, #2a4f7f)' }}>
          <CardContent className="p-6">
            {(() => {
              const totalPurchases = purchases.reduce((sum, p) => sum + (p.total_price || (p.price + (p.tax || 0) + (p.commission || 0))), 0);
              const totalShipping = shipments.reduce((sum, s) => sum + (s.shipping_cost || 0), 0);
              const totalRecharges = transactions
                .filter(t => (t.type === 'deposit' || t.type === 'initial_balance' || t.type === 'referral_bonus') && t.status === 'approved' && !t.is_deleted)
                .reduce((sum, t) => sum + t.amount, 0);
              const saldoAnterior = wallet?.total_saldo_pendiente || 0;
              const totalDebt = totalPurchases + totalShipping + saldoAnterior;
              const balance = totalRecharges - totalDebt;
              const needsRecharge = balance < 0;
              
              return (
                <>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-white/70 text-sm font-medium">Tu Saldo</p>
                      <p className={`text-4xl font-extrabold mt-1 ${needsRecharge ? 'text-red-400' : 'text-green-400'}`} data-testid="wallet-balance">
                        {needsRecharge ? '-' : ''}${Math.abs(balance).toFixed(2)}
                      </p>
                      <p className="text-white/60 text-xs mt-1">
                        {needsRecharge ? '(Debes recargar este monto)' : '(Saldo a favor)'}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-white/20 text-white border-0 font-bold text-lg px-3 py-1">
                        #{user?.customer_id}
                      </Badge>
                    </div>
                  </div>

                  {/* Desglose detallado */}
                  <div className="bg-white/10 rounded-xl p-3 mb-4 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <p className="text-white/70">Total Compras:</p>
                      <p className="font-medium text-red-300">${totalPurchases.toFixed(2)}</p>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <p className="text-white/70">Total Envios:</p>
                      <p className="font-medium text-red-300">${totalShipping.toFixed(2)}</p>
                    </div>
                    {saldoAnterior > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <p className="text-white/70">Saldo Anterior:</p>
                        <p className="font-medium text-orange-300">${saldoAnterior.toFixed(2)}</p>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-sm border-t border-white/20 pt-2">
                      <p className="text-white/70">Total Recargas:</p>
                      <p className="font-medium text-green-300">${totalRecharges.toFixed(2)}</p>
                    </div>
                    <div className="flex justify-between items-center text-sm border-t border-white/20 pt-2">
                      <p className="text-white/80 font-medium">Balance:</p>
                      <p className={`font-bold text-lg ${needsRecharge ? 'text-red-400' : 'text-green-400'}`}>
                        {needsRecharge ? '-' : '+'}${Math.abs(balance).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </>
              );
            })()}

            <div className="flex gap-3">
              <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    className="flex-1 bg-white text-slate-900 hover:bg-gray-100 font-bold rounded-xl h-12"
                    data-testid="request-deposit-btn"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Recargar
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold">Solicitar Recarga</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Monto (USD)</label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        className="h-12 text-xl font-bold text-center rounded-xl mt-2"
                        data-testid="deposit-amount-input"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Comprobante de pago</label>
                      <div className="mt-2">
                        {depositProofPreview ? (
                          <div className="relative rounded-xl overflow-hidden border-2 border-green-200 bg-green-50">
                            <img src={depositProofPreview} alt="Comprobante" className="w-full max-h-48 object-contain" />
                            <button
                              onClick={() => { setDepositProof(null); setDepositProofPreview(null); }}
                              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                              data-testid="remove-proof-btn"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-red-400 hover:bg-red-50/50 transition-colors">
                            <Camera className="h-8 w-8 text-gray-400 mb-2" />
                            <span className="text-sm text-gray-500 font-medium">Subir screenshot del depósito</span>
                            <span className="text-xs text-gray-400 mt-1">JPG, PNG o PDF</span>
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              onChange={handleProofFileChange}
                              data-testid="deposit-proof-input"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    <Button 
                      className="w-full h-12 font-bold rounded-xl" style={{ background: '#1E3A5F', color: 'white' }}
                      onClick={handleRequestDeposit}
                      disabled={depositSubmitting}
                      data-testid="submit-deposit-btn"
                    >
                      {depositSubmitting ? "Enviando..." : "Enviar Solicitud"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Share/Referral Button */}
              <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    className="bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl h-12 px-4"
                    data-testid="share-referral-btn"
                  >
                    <Gift className="h-5 w-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                      <Gift className="h-6 w-6 text-green-500" />
                      Invita y Gana
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <p className="text-sm text-gray-600 mb-2">Tu código de referido:</p>
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-3xl font-extrabold text-green-600">
                          {user?.customer_id}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyCode}
                          className="text-green-600"
                        >
                          {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                        </Button>
                      </div>
                    </div>
                    
                    <div className="text-center text-sm text-gray-600">
                      <p>Comparte tu código con amigos.</p>
                      <p className="font-bold text-green-600">¡Ambos ganan saldo al registrarse!</p>
                    </div>

                    <Button 
                      className="w-full h-14 bg-green-500 hover:bg-green-600 font-bold rounded-xl text-lg"
                      onClick={handleShareWhatsApp}
                      data-testid="share-whatsapp-btn"
                    >
                      <Share2 className="h-5 w-5 mr-2" />
                      Compartir por WhatsApp
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="mt-4 pt-4 border-t border-white/20">
              <p className="text-white/70 text-xs">
                Hola, <span className="font-bold text-white">{user?.name}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="max-w-lg mx-auto px-4 mt-6">
        <Tabs defaultValue="invoices" className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-gray-100 rounded-xl p-1 h-auto">
            <TabsTrigger 
              value="invoices" 
              className="data-[state=active]:bg-white rounded-lg py-2 text-xs font-medium"
              data-testid="tab-invoices"
            >
              <FileText className="h-4 w-4 mb-1" />
              <span className="hidden sm:inline ml-1">Facturas</span>
            </TabsTrigger>
            <TabsTrigger 
              value="purchases" 
              className="data-[state=active]:bg-white rounded-lg py-2 text-xs font-medium"
              data-testid="tab-purchases"
            >
              <ShoppingBag className="h-4 w-4 mb-1" />
              <span className="hidden sm:inline ml-1">Compras</span>
            </TabsTrigger>
            <TabsTrigger 
              value="history"
              className="data-[state=active]:bg-white rounded-lg py-2 text-xs font-medium"
              data-testid="tab-history"
            >
              <History className="h-4 w-4 mb-1" />
              <span className="hidden sm:inline ml-1">Historial</span>
            </TabsTrigger>
            <TabsTrigger 
              value="shipments"
              className="data-[state=active]:bg-white rounded-lg py-2 text-xs font-medium"
              data-testid="tab-shipments"
            >
              <Truck className="h-4 w-4 mb-1" />
              <span className="hidden sm:inline ml-1">Envios</span>
            </TabsTrigger>
            <TabsTrigger 
              value="notifications"
              className="data-[state=active]:bg-white rounded-lg py-2 text-xs font-medium"
              data-testid="tab-notifications"
            >
              <Bell className="h-4 w-4 mb-1" />
              <span className="hidden sm:inline ml-1">Avisos</span>
            </TabsTrigger>
          </TabsList>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="mt-4">
            <ScrollArea className="h-[400px]">
              {clientInvoices.length === 0 ? (
                <Card className="rounded-xl border-dashed border-2">
                  <CardContent className="p-6 text-center">
                    <FileText className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500">No tienes facturas</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    // Group invoices by week (Sunday to Sunday)
                    const getWeekLabel = (dateStr) => {
                      const d = new Date(dateStr);
                      const day = d.getDay();
                      const sunday = new Date(d);
                      sunday.setDate(d.getDate() - day);
                      sunday.setHours(0, 0, 0, 0);
                      const saturday = new Date(sunday);
                      saturday.setDate(sunday.getDate() + 6);
                      const fmt = (dt) => dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
                      return `${fmt(sunday)} - ${fmt(saturday)}`;
                    };
                    const getWeekKey = (dateStr) => {
                      const d = new Date(dateStr);
                      const day = d.getDay();
                      const sunday = new Date(d);
                      sunday.setDate(d.getDate() - day);
                      sunday.setHours(0, 0, 0, 0);
                      return sunday.toISOString().slice(0, 10);
                    };

                    const grouped = {};
                    clientInvoices.forEach((inv) => {
                      const key = getWeekKey(inv.created_at);
                      if (!grouped[key]) grouped[key] = { label: getWeekLabel(inv.created_at), invoices: [] };
                      grouped[key].invoices.push(inv);
                    });

                    const weeks = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
                    let globalIdx = 0;

                    return weeks.map(([key, { label, invoices }]) => (
                      <div key={key}>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">Semana: {label}</p>
                        <div className="space-y-2">
                          {invoices.map((inv) => {
                            const isFirst = globalIdx === 0;
                            globalIdx++;
                            return (
                              <Card key={inv.id} className={`rounded-xl ${isFirst ? 'border-2 border-blue-300 bg-blue-50/30' : ''}`} data-testid={`client-invoice-${inv.id}`}>
                                <CardContent className="p-3">
                                  <div className="flex justify-between items-center">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="font-bold" style={{ color: '#1E3A5F' }}>{inv.invoice_number}</p>
                                        {isFirst && <Badge className="bg-blue-500 text-white text-xs">Ultima</Badge>}
                                        <Badge className={inv.status === 'approved' ? 'bg-green-100 text-green-700 text-xs' : 'bg-yellow-100 text-yellow-700 text-xs'}>
                                          {inv.status === 'approved' ? 'Aprobada' : 'Pendiente'}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {new Date(inv.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                        {' · '}{inv.purchase_ids?.length || 0} items
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <p className="font-extrabold text-lg" style={{ color: '#1E3A5F' }}>${inv.total?.toFixed(2)}</p>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 w-9 p-0 rounded-lg"
                                        onClick={(e) => handleDownloadInvoice(inv, e)}
                                        disabled={downloadingPDF === inv.id}
                                        data-testid={`download-invoice-${inv.id}`}
                                      >
                                        {downloadingPDF === inv.id ? (
                                          <div className="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                          <Download className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Purchases Tab */}
          <TabsContent value="purchases" className="mt-4">
            <ScrollArea className="h-[400px]">
              {purchases.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-2 border-gray-200">
                  <CardContent className="p-8 text-center">
                    <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Sin compras aún</p>
                    <p className="text-gray-400 text-sm mt-1">Tus compras aparecerán aquí</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {purchases.map((purchase) => (
                    <Card key={purchase.id} className="rounded-xl border-gray-100" data-testid="purchase-item">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-bold text-slate-800">{purchase.item_name}</p>
                            <p className="text-sm text-gray-500">{purchase.store}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(purchase.created_at).toLocaleDateString('es-ES')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-red-600">${purchase.price.toFixed(2)}</p>
                            <p className="text-xs text-gray-400">+${purchase.commission.toFixed(2)} com.</p>
                            {getStatusBadge(getShipmentStatusForPurchase(purchase.id))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Transaction History Tab */}
          <TabsContent value="history" className="mt-4">
            <ScrollArea className="h-[400px]">
              {transactions.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-2 border-gray-200">
                  <CardContent className="p-8 text-center">
                    <History className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Sin movimientos</p>
                    <p className="text-gray-400 text-sm mt-1">Tu historial aparecerá aquí</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {transactions.map((tx) => (
                    <Card key={tx.id} className="rounded-xl border-gray-100" data-testid="transaction-item">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            tx.type === 'deposit' ? 'bg-green-100' : 'bg-red-100'
                          }`}>
                            {tx.type === 'deposit' ? (
                              <Plus className={`h-5 w-5 text-green-600`} />
                            ) : (
                              <ShoppingBag className={`h-5 w-5 text-red-600`} />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-slate-800">{tx.description}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(tx.created_at).toLocaleDateString('es-ES', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-400">
                              Saldo: ${tx.balance_after.toFixed(2)}
                            </p>
                            {getTransactionShipmentBadge(tx)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Shipments Tab */}
          <TabsContent value="shipments" className="mt-4">
            <ScrollArea className="h-[400px]">
              {shipments.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-2 border-gray-200">
                  <CardContent className="p-8 text-center">
                    <Truck className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Sin envíos</p>
                    <p className="text-gray-400 text-sm mt-1">Tus envíos aparecerán aquí</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {shipments.map((shipment) => (
                    <Card key={shipment.id} className="rounded-xl border-gray-100" data-testid="shipment-item">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold text-slate-800">
                              {shipment.shipping_type === 'with_family' ? 'Con Familiar USA' : 'Sin Familiar USA'}
                            </p>
                            <p className="text-sm text-gray-500">{shipment.country}</p>
                            {(shipment.weight_pounds && shipment.weight_pounds > 0) && (
                              <p className="text-sm text-blue-600 font-bold mt-1">
                                {shipment.weight_pounds} lbs
                              </p>
                            )}
                          </div>
                          {getStatusBadge(shipment.status)}
                        </div>
                        
                        {shipment.tracking_number && (
                          <div className="bg-gray-50 rounded-lg p-3 mb-3">
                            <p className="text-xs text-gray-500">Tracking:</p>
                            <p className="font-mono font-bold text-sm">{shipment.tracking_number}</p>
                          </div>
                        )}

                        {shipment.additional_info && (
                          <div className="bg-blue-50 rounded-lg p-3 mb-3">
                            <p className="text-xs text-gray-500">Información adicional:</p>
                            <p className="text-sm text-slate-700">{shipment.additional_info}</p>
                          </div>
                        )}

                        <div className="flex justify-between items-center text-sm">
                          <button
                            onClick={() => {
                              setSelectedShipment(shipment);
                              // Find the products for this shipment
                              const prods = purchases.filter(p => shipment.purchase_ids.includes(p.id));
                              setShipmentProducts(prods);
                              setShipmentDetailOpen(true);
                            }}
                            className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                            data-testid={`view-products-${shipment.id}`}
                          >
                            <ShoppingBag className="h-4 w-4" />
                            Ver {shipment.purchase_ids?.length || 0} productos
                          </button>
                          <div className="flex items-center gap-2">
                            {shipment.attachments && shipment.attachments.length > 0 && (
                              <button
                                onClick={() => {
                                  setSelectedAttachments(shipment.attachments);
                                  setAttachmentDialogOpen(true);
                                }}
                                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-lg transition-colors"
                                data-testid={`view-attachments-${shipment.id}`}
                              >
                                <Paperclip className="h-3 w-3" />
                                <span>{shipment.attachments.length} archivo(s)</span>
                              </button>
                            )}
                            <span className="font-bold text-red-600">${shipment.shipping_cost?.toFixed(2) || '0.00'}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-4">
            <ScrollArea className="h-[400px]">
              {notifications.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-2 border-gray-200">
                  <CardContent className="p-8 text-center">
                    <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Sin notificaciones</p>
                    <p className="text-gray-400 text-sm mt-1">Las alertas aparecerán aquí</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notif) => (
                    <Card key={notif.id} className="rounded-xl border-gray-100" data-testid="notification-item">
                      <CardContent className="p-4">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                            <Bell className="h-5 w-5 text-red-600" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{notif.title}</p>
                            <p className="text-sm text-gray-600 mt-1">{notif.message}</p>
                            <p className="text-xs text-gray-400 mt-2">
                              {new Date(notif.created_at).toLocaleDateString('es-ES', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Attachments Dialog */}
      <Dialog open={attachmentDialogOpen} onOpenChange={setAttachmentDialogOpen}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-green-600" />
              Archivos Adjuntos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {selectedAttachments.map((att, idx) => {
              // Asegurar que la URL tenga el prefijo /api si es necesario
              const normalizedAtt = !att.startsWith('http') && !att.startsWith('/api/') ? '/api' + att : att;
              const url = att.startsWith('http') ? att : `${process.env.REACT_APP_BACKEND_URL}${normalizedAtt}`;
              const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(att);
              const isVideo = /\.(mp4|mov|webm|avi|mkv)$/i.test(att);
              return (
                <div key={idx} className="border rounded-xl overflow-hidden">
                  {isImg ? (
                    <img src={url} alt={`Adjunto ${idx + 1}`} className="w-full max-h-64 object-contain bg-gray-50" />
                  ) : isVideo ? (
                    <div className="p-2 bg-gray-50">
                      <video controls className="w-full max-h-64 rounded">
                        <source src={url} type="video/mp4" />
                        Tu navegador no soporta video.
                      </video>
                      <a 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block text-center text-sm text-blue-600 hover:underline mt-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Abrir en nueva pestaña
                      </a>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 flex items-center justify-between">
                      <span className="text-sm text-gray-600">Archivo {idx + 1}</span>
                      <a 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Eye className="h-4 w-4" /> Ver/Descargar
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ShipmentDetailModal 
        open={shipmentDetailOpen}
        onClose={() => setShipmentDetailOpen(false)}
        shipment={selectedShipment}
        products={shipmentProducts}
        backendUrl={backendUrl}
      />
    </div>
  );
}

function ShipmentDetailModal({ open, onClose, shipment, products, backendUrl }) {
  if (!open || !shipment) return null;
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            Detalle del Envio
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="bg-blue-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Tipo:</span>
              <span className="font-medium">{shipment.shipping_type === 'with_family' ? 'Con Familiar USA' : 'Sin Familiar USA'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Destino:</span>
              <span className="font-medium">{shipment.country}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Peso:</span>
              <span className="font-bold text-blue-600">{shipment.weight_pounds || 0} lbs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Costo:</span>
              <span className="font-bold text-red-600">${(shipment.shipping_cost || 0).toFixed(2)}</span>
            </div>
            {shipment.tracking_number && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Tracking:</span>
                <span className="font-mono text-sm">{shipment.tracking_number}</span>
              </div>
            )}
          </div>

          <div>
            <h4 className="font-bold text-slate-800 mb-3">Productos ({products.length})</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {products.length > 0 ? (
                <ProductList items={products} />
              ) : (
                <p className="text-center text-gray-400 py-4">Sin productos</p>
              )}
            </div>
          </div>

          {shipment.attachments && shipment.attachments.length > 0 && (
            <div>
              <h4 className="font-bold text-slate-800 mb-2">Archivos ({shipment.attachments.length})</h4>
              <AttachmentList items={shipment.attachments} backendUrl={backendUrl} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductList({ items }) {
  return (
    <div className="space-y-2">
      {items.map(function(p) {
        return (
          <div key={p.id} className="bg-gray-50 rounded-lg p-3 flex justify-between">
            <div>
              <p className="font-medium text-slate-800">{p.item_name}</p>
              <p className="text-xs text-gray-500">{p.store || 'Sin tienda'}</p>
            </div>
            <div className="text-right">
              <p className="font-bold">${(p.total || 0).toFixed(2)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AttachmentList({ items, backendUrl }) {
  return (
    <div className="space-y-2">
      {items.map(function(att, idx) {
        // Asegurar que la URL tenga el prefijo /api si es necesario
        var normalizedAtt = att;
        if (!att.startsWith('http') && !att.startsWith('/api/')) {
          normalizedAtt = '/api' + att;
        }
        var url = att.startsWith('http') ? att : backendUrl + normalizedAtt;
        var isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(att);
        var isVideo = /\.(mp4|mov|webm|avi|mkv)$/i.test(att);
        
        if (isImg) {
          return <img key={idx} src={url} alt="Adjunto" className="w-full max-h-32 object-contain bg-gray-50 rounded" />;
        }
        if (isVideo) {
          return (
            <div key={idx} className="bg-gray-50 rounded p-2">
              <video controls className="w-full max-h-48 rounded">
                <source src={url} type="video/mp4" />
                Tu navegador no soporta video.
              </video>
              <a 
                href={url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="block text-center text-sm text-blue-600 hover:underline mt-2"
                onClick={(e) => e.stopPropagation()}
              >
                Abrir en nueva pestaña
              </a>
            </div>
          );
        }
        return (
          <a 
            key={idx} 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="block p-3 bg-gray-50 rounded hover:bg-gray-100 text-blue-600"
            onClick={(e) => e.stopPropagation()}
          >
            Ver Archivo {idx + 1}
          </a>
        );
      })}
    </div>
  );
}
