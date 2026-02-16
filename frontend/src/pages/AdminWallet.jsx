import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { getPendingDeposits, approveDeposit, rejectDeposit, getAllDeposits, adminBalanceAdjustment, getAllClients } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CheckCircle, Clock, Image, ZoomIn, XCircle, History, Minus, DollarSign, Search } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function AdminWallet() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const logoUrl = user?.tenant_logo || "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";
  
  const [pendingDeposits, setPendingDeposits] = useState([]);
  const [allDeposits, setAllDeposits] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  
  // Ajuste de balance state
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  useEffect(() => { 
    loadData(); 
  }, []);

  const loadData = async () => {
    try {
      const [pendingRes, allRes, clientsRes] = await Promise.all([
        getPendingDeposits(),
        getAllDeposits(),
        getAllClients()
      ]);
      setPendingDeposits(pendingRes.data);
      setAllDeposits(allRes.data);
      setClients(clientsRes.data);
    } catch (error) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (transactionId) => {
    setApproving(transactionId);
    try {
      await approveDeposit(transactionId);
      toast.success("Depósito aprobado");
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al aprobar");
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (transactionId) => {
    setRejecting(transactionId);
    try {
      await rejectDeposit(transactionId);
      toast.success("Depósito rechazado");
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al rechazar");
    } finally {
      setRejecting(null);
    }
  };

  const handleBalanceAdjustment = async () => {
    if (!selectedClient || !adjustAmount || !adjustReason) {
      toast.error("Completa todos los campos");
      return;
    }
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("El monto debe ser mayor a 0");
      return;
    }
    setAdjusting(true);
    try {
      await adminBalanceAdjustment({
        user_id: selectedClient,
        amount: amount,
        description: adjustReason
      });
      toast.success("Ajuste realizado exitosamente");
      setAdjustDialogOpen(false);
      setSelectedClient("");
      setAdjustAmount("");
      setAdjustReason("");
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al realizar ajuste");
    } finally {
      setAdjusting(false);
    }
  };

  const getProofUrl = (deposit) => {
    if (!deposit.proof_url) return null;
    if (deposit.proof_url.startsWith("http")) return deposit.proof_url;
    return `${BACKEND_URL}${deposit.proof_url}`;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-700 border-green-200">Aprobado</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-700 border-red-200">Rechazado</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pendiente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredHistory = allDeposits.filter(d => {
    const matchesFilter = historyFilter === "all" || d.status === historyFilter;
    const matchesSearch = historySearch === "" || 
      d.user_name?.toLowerCase().includes(historySearch.toLowerCase()) ||
      d.customer_id?.toLowerCase().includes(historySearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredClients = clients
    .filter(c => 
      clientSearch === "" || 
      c.name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.customer_id?.toLowerCase().includes(clientSearch.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

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
          <span className="font-bold text-slate-800">Gestión de Recargas</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="rounded-xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-800">{pendingDeposits.length}</p>
                <p className="text-xs text-gray-500">Pendientes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-800">{allDeposits.filter(d => d.status === "approved").length}</p>
                <p className="text-xs text-gray-500">Aprobados</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-800">{allDeposits.filter(d => d.status === "rejected").length}</p>
                <p className="text-xs text-gray-500">Rechazados</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-6">
          <Button 
            variant={!showHistory ? "default" : "outline"}
            onClick={() => setShowHistory(false)}
            className="flex-1 rounded-xl"
            data-testid="show-pending-btn"
          >
            <Clock className="h-4 w-4 mr-2" />
            Pendientes ({pendingDeposits.length})
          </Button>
          <Button 
            variant={showHistory ? "default" : "outline"}
            onClick={() => setShowHistory(true)}
            className="flex-1 rounded-xl"
            data-testid="show-history-btn"
          >
            <History className="h-4 w-4 mr-2" />
            Historial
          </Button>
          <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-xl border-red-200 text-red-600 hover:bg-red-50" data-testid="adjust-balance-btn">
                <Minus className="h-4 w-4 mr-2" />
                Ajuste
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-red-600" />
                  Ajuste de Balance
                </DialogTitle>
                <DialogDescription>
                  Restar dinero del wallet de un cliente con un motivo personalizado.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input 
                      placeholder="Buscar cliente..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="pl-9 rounded-xl mb-2"
                      data-testid="client-search-input"
                    />
                  </div>
                  <Select value={selectedClient} onValueChange={setSelectedClient}>
                    <SelectTrigger className="rounded-xl" data-testid="select-client-trigger">
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {filteredClients.map(client => (
                        <SelectItem key={client.id} value={client.id} data-testid={`client-option-${client.customer_id}`}>
                          <span className="font-medium">{client.name}</span>
                          <span className="text-gray-500 ml-2">#{client.customer_id}</span>
                          <span className="text-green-600 ml-2">${client.wallet_balance?.toFixed(2)}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Monto a restar ($)</Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    className="rounded-xl"
                    data-testid="adjust-amount-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Motivo del ajuste</Label>
                  <Textarea 
                    placeholder="Escribe el motivo del ajuste..."
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="rounded-xl min-h-[80px]"
                    data-testid="adjust-reason-input"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-xl">Cancelar</Button>
                </DialogClose>
                <Button 
                  onClick={handleBalanceAdjustment}
                  disabled={adjusting || !selectedClient || !adjustAmount || !adjustReason}
                  className="rounded-xl bg-red-600 hover:bg-red-700"
                  data-testid="confirm-adjustment-btn"
                >
                  {adjusting ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                      Procesando...
                    </span>
                  ) : (
                    <>
                      <Minus className="h-4 w-4 mr-2" />
                      Confirmar Ajuste
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* History Filters */}
        {showHistory && (
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                placeholder="Buscar por nombre o ID..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="pl-9 rounded-xl"
                data-testid="history-search-input"
              />
            </div>
            <Select value={historyFilter} onValueChange={setHistoryFilter}>
              <SelectTrigger className="w-40 rounded-xl" data-testid="history-filter-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="approved">Aprobados</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="rejected">Rechazados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <ScrollArea className="h-[calc(100vh-400px)]">
          {!showHistory ? (
            // Pending Deposits View
            pendingDeposits.length === 0 ? (
              <Card className="rounded-2xl border-dashed border-2 border-gray-200">
                <CardContent className="p-8 text-center">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No hay solicitudes pendientes</p>
                  <p className="text-gray-400 text-sm mt-1">Todas las recargas han sido procesadas</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingDeposits.map((deposit) => {
                  const proofUrl = getProofUrl(deposit);
                  return (
                    <Card key={deposit.id} className="rounded-xl border-yellow-200 bg-yellow-50/50" data-testid="pending-deposit-item">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="font-bold">#{deposit.customer_id}</Badge>
                              <span className="font-bold text-slate-800">{deposit.user_name}</span>
                            </div>
                            <p className="text-sm text-gray-500">{deposit.description}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(deposit.created_at).toLocaleDateString('es-ES', {
                                day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
                              })}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="bg-white px-4 py-2 rounded-xl shadow-sm">
                              <p className="text-xs text-gray-500">Monto</p>
                              <p className="text-2xl font-extrabold text-green-600">${deposit.amount.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>

                        {proofUrl ? (
                          <div className="mb-3">
                            <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                              <Image className="h-3 w-3" /> Comprobante de pago
                            </p>
                            <Dialog>
                              <DialogTrigger asChild>
                                <div className="relative cursor-pointer group rounded-xl overflow-hidden border border-gray-200 bg-white">
                                  <img src={proofUrl} alt="Comprobante" className="w-full max-h-48 object-contain" />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 bg-white rounded-full p-2 shadow-lg transition-opacity">
                                      <ZoomIn className="h-5 w-5 text-gray-700" />
                                    </div>
                                  </div>
                                </div>
                              </DialogTrigger>
                              <DialogContent className="rounded-2xl max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Comprobante - #{deposit.customer_id} - ${deposit.amount.toFixed(2)}</DialogTitle>
                                </DialogHeader>
                                <div className="mt-2">
                                  <img src={proofUrl} alt="Comprobante" className="w-full rounded-xl" />
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        ) : (
                          <div className="mb-3 p-3 bg-gray-100 rounded-xl text-center">
                            <p className="text-sm text-gray-400 flex items-center justify-center gap-2">
                              <Image className="h-4 w-4" /> Sin comprobante adjunto
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleApprove(deposit.id)}
                            disabled={approving === deposit.id || rejecting === deposit.id}
                            className="flex-1 h-12 font-bold rounded-xl"
                            data-testid={`approve-deposit-${deposit.id}`}
                            style={{ background: '#2ECC71', color: 'white' }}
                          >
                            {approving === deposit.id ? (
                              <span className="flex items-center gap-2">
                                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                                Aprobando...
                              </span>
                            ) : (
                              <>
                                <CheckCircle className="h-5 w-5 mr-2" />
                                Aprobar
                              </>
                            )}
                          </Button>
                          <Button
                            onClick={() => handleReject(deposit.id)}
                            disabled={approving === deposit.id || rejecting === deposit.id}
                            variant="outline"
                            className="flex-1 h-12 font-bold rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                            data-testid={`reject-deposit-${deposit.id}`}
                          >
                            {rejecting === deposit.id ? (
                              <span className="flex items-center gap-2">
                                <span className="animate-spin rounded-full h-4 w-4 border-2 border-red-600 border-t-transparent"></span>
                                Rechazando...
                              </span>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 mr-2" />
                                Rechazar
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )
          ) : (
            // History View
            filteredHistory.length === 0 ? (
              <Card className="rounded-2xl border-dashed border-2 border-gray-200">
                <CardContent className="p-8 text-center">
                  <History className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No hay registros</p>
                  <p className="text-gray-400 text-sm mt-1">No se encontraron recargas con los filtros aplicados</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredHistory.map((deposit) => {
                  const proofUrl = getProofUrl(deposit);
                  return (
                    <Card key={deposit.id} className="rounded-xl" data-testid="history-deposit-item">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="font-bold text-xs">#{deposit.customer_id}</Badge>
                              <span className="font-semibold text-slate-800">{deposit.user_name}</span>
                              {getStatusBadge(deposit.status)}
                            </div>
                            <p className="text-sm text-gray-500">{deposit.description}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(deposit.created_at).toLocaleDateString('es-ES', {
                                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}
                            </p>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            {proofUrl && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                                    <Image className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="rounded-2xl max-w-2xl">
                                  <DialogHeader>
                                    <DialogTitle>Comprobante - #{deposit.customer_id}</DialogTitle>
                                  </DialogHeader>
                                  <img src={proofUrl} alt="Comprobante" className="w-full rounded-xl" />
                                </DialogContent>
                              </Dialog>
                            )}
                            <div className="bg-gray-50 px-3 py-1 rounded-lg">
                              <p className={`text-xl font-bold ${deposit.status === 'approved' ? 'text-green-600' : deposit.status === 'rejected' ? 'text-red-600' : 'text-yellow-600'}`}>
                                ${deposit.amount.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
