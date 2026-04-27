import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getInvoicesWithoutShipment } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Truck, Search, ChevronRight, FileText, Users, AlertCircle,
} from "lucide-react";

export default function AdminPendingShipments() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ clients: [], invoices_count: 0, clients_count: 0 });
  const [filter, setFilter] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await getInvoicesWithoutShipment();
        setData(res.data || { clients: [], invoices_count: 0, clients_count: 0 });
      } catch (e) {
        toast.error("No se pudo cargar el reporte");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredClients = useMemo(() => {
    const code = filter.trim().toUpperCase();
    if (!code) return data.clients;
    return data.clients.filter((c) =>
      (c.customer_id || "").toUpperCase().includes(code) ||
      (c.name || "").toUpperCase().includes(code)
    );
  }, [data.clients, filter]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen pb-12">
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} data-testid="back-btn" className="rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-800">Envíos Pendientes</h1>
              <p className="text-xs text-slate-500">Facturas sin envío asignado</p>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Truck className="h-5 w-5 text-purple-600" />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card className="rounded-2xl bg-purple-50 border-purple-100" data-testid="kpi-clients">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-purple-700 text-[10px] uppercase font-bold">
                <Users className="h-3.5 w-3.5" /> Clientes
              </div>
              <p className="text-2xl font-extrabold text-purple-900 mt-1">{data.clients_count}</p>
              <p className="text-[10px] text-purple-700/70">con envíos sin cobrar</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl bg-amber-50 border-amber-100" data-testid="kpi-invoices">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-amber-700 text-[10px] uppercase font-bold">
                <FileText className="h-3.5 w-3.5" /> Facturas
              </div>
              <p className="text-2xl font-extrabold text-amber-900 mt-1">{data.invoices_count}</p>
              <p className="text-[10px] text-amber-700/70">faltan asignar envío</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <Card className="rounded-2xl mb-4">
          <CardContent className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar por código o nombre"
                className="h-10 rounded-xl pl-9 uppercase"
                data-testid="pending-shipments-filter"
              />
            </div>
          </CardContent>
        </Card>

        {/* Clients list */}
        {filteredClients.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="p-8 text-center text-slate-500">
              <AlertCircle className="h-10 w-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold">
                {data.clients_count === 0 ? "Todos los envíos están asignados ✓" : "Sin resultados para este filtro"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredClients.map((c) => (
              <Card key={c.customer_id} className="rounded-2xl" data-testid={`pending-client-${c.customer_id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="font-mono">{c.customer_id}</Badge>
                      <span className="text-sm font-bold text-slate-800 truncate">{c.name || "Sin nombre"}</span>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200">{c.invoices.length} factura(s)</Badge>
                  </div>
                  <div className="space-y-1">
                    {c.invoices.map((inv) => (
                      <button
                        key={inv.id}
                        type="button"
                        onClick={() => navigate(`/admin/invoices?invoice_id=${inv.id}&back=/admin/pending-shipments`)}
                        className="w-full flex items-center justify-between gap-2 bg-slate-50 hover:bg-slate-100 transition-colors rounded-xl px-3 py-2 text-left"
                        data-testid={`pending-invoice-${inv.invoice_number}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <span className="text-xs font-bold text-slate-700">{inv.invoice_number}</span>
                          <span className="text-[10px] text-slate-500 truncate">
                            {inv.created_at ? new Date(inv.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-extrabold text-slate-800">${Number(inv.total_a_pagar || 0).toFixed(2)}</span>
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
