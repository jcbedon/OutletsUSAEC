import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { getPendingDeposits, approveDeposit } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, CheckCircle, Clock, Image, ZoomIn } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function AdminWallet() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const logoUrl = user?.tenant_logo || "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";
  const [pendingDeposits, setPendingDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);

  useEffect(() => { loadPendingDeposits(); }, []);

  const loadPendingDeposits = async () => {
    try {
      const response = await getPendingDeposits();
      setPendingDeposits(response.data);
    } catch (error) {
      toast.error("Error al cargar solicitudes");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (transactionId) => {
    setApproving(transactionId);
    try {
      await approveDeposit(transactionId);
      toast.success("Depósito aprobado");
      loadPendingDeposits();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al aprobar");
    } finally {
      setApproving(null);
    }
  };

  const getProofUrl = (deposit) => {
    if (!deposit.proof_url) return null;
    if (deposit.proof_url.startsWith("http")) return deposit.proof_url;
    return `${BACKEND_URL}${deposit.proof_url}`;
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
            <img src={logoUrl} alt="Logo" className="h-10 object-contain logo-transparent" />
          </div>
          <span className="font-bold text-slate-800">Recargas Pendientes</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <Card className="rounded-xl mb-6">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-slate-800">{pendingDeposits.length}</p>
              <p className="text-sm text-gray-500">Solicitudes pendientes</p>
            </div>
          </CardContent>
        </Card>

        <ScrollArea className="h-[calc(100vh-280px)]">
          {pendingDeposits.length === 0 ? (
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

                      <Button
                        onClick={() => handleApprove(deposit.id)}
                        disabled={approving === deposit.id}
                        className="w-full h-12 bg-green-600 hover:bg-green-700 font-bold rounded-xl"
                        data-testid={`approve-deposit-${deposit.id}`}
                      >
                        {approving === deposit.id ? (
                          <span className="flex items-center gap-2">
                            <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                            Aprobando...
                          </span>
                        ) : (
                          <>
                            <CheckCircle className="h-5 w-5 mr-2" />
                            Aprobar Recarga
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
