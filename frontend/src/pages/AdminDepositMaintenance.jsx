import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Search, Wrench, Link2, Lock, AlertTriangle, RefreshCw } from "lucide-react";
import { reviewClientDeposits, reassignDepositMaintenance, getClientInvoices } from "@/lib/api";

const fmtMoney = (v) => `$${Number(v || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-EC", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

export default function AdminDepositMaintenance() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [searched, setSearched] = useState(false);
  // customer_id -> [{invoice_number}]
  const [clientInvoices, setClientInvoices] = useState({});
  // deposit_id -> chosen invoice_number (pending)
  const [pending, setPending] = useState({});
  const [savingId, setSavingId] = useState(null);

  const runSearch = async (e) => {
    e?.preventDefault?.();
    const q = query.trim();
    if (!q) {
      toast.error("Escribe un nombre o ID de cliente");
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await reviewClientDeposits(q);
      const found = res.data.matches || [];
      setMatches(found);
      // Load each matched client's live invoices for the reassign dropdown.
      const invMap = {};
      await Promise.all(
        found.map(async (m) => {
          try {
            const iv = await getClientInvoices(m.customer_id);
            const list = Array.isArray(iv.data) ? iv.data : iv.data.invoices || [];
            invMap[m.customer_id] = list
              .filter((i) => !i.is_annulled)
              .map((i) => ({ id: i.id, invoice_number: i.invoice_number }))
              .sort((a, b) => (a.invoice_number > b.invoice_number ? 1 : -1));
          } catch {
            invMap[m.customer_id] = [];
          }
        })
      );
      setClientInvoices(invMap);
      if (found.length === 0) toast.info("Sin coincidencias");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al buscar (¿desplegaste la última versión?)");
    } finally {
      setLoading(false);
    }
  };

  const doReassign = async (dep) => {
    const invNum = pending[dep.id];
    if (!invNum) {
      toast.error("Elige la factura destino");
      return;
    }
    if (invNum === dep.assigned_invoice_number) {
      toast.info("La recarga ya está en esa factura");
      return;
    }
    setSavingId(dep.id);
    try {
      const res = await reassignDepositMaintenance(dep.id, invNum);
      toast.success(res.data.message || "Recarga reasignada y bloqueada");
      await runSearch();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al reasignar");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="app-bg min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-slate-50 pb-12">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="text-white hover:bg-white/10" data-testid="back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <Wrench className="h-6 w-6" />
              Mantenimiento de Recargas
            </h1>
            <p className="text-xs text-indigo-200">Revisa a qué factura está vinculada cada recarga y corrígela. El vínculo queda permanente y auditado.</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-3">
        {/* Search */}
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <form onSubmit={runSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o ID de cliente (ej: Gioconda, FG6, N7N)"
                  className="pl-9 h-11 rounded-xl"
                  data-testid="maintenance-search-input"
                />
              </div>
              <Button type="submit" disabled={loading} className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="maintenance-search-btn">
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Buscar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Results */}
        {searched && !loading && matches.length === 0 && (
          <p className="text-center text-slate-500 mt-8 text-sm" data-testid="maintenance-no-results">Sin coincidencias para “{query}”.</p>
        )}

        {matches.map((m) => (
          <div key={m.customer_id} className="mt-5" data-testid={`client-block-${m.customer_id}`}>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-lg font-bold text-slate-800">{m.name}</h2>
              <Badge variant="outline" className="border-indigo-200 text-indigo-700 font-mono">{m.customer_id}</Badge>
              <span className="text-xs text-slate-400">{m.deposits.length} recarga(s)</span>
            </div>

            <div className="space-y-2">
              {m.deposits.length === 0 && (
                <Card className="rounded-xl"><CardContent className="py-6 text-center text-slate-400 text-sm">Sin recargas aprobadas</CardContent></Card>
              )}
              {m.deposits.map((dep) => (
                <Card key={dep.id} className="rounded-xl border-slate-200" data-testid={`deposit-row-${dep.id.slice(0, 8)}`}>
                  <CardContent className="p-3 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-extrabold text-slate-900">{fmtMoney(dep.amount)}</span>
                        {dep.assigned_invoice_number ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 gap-1">
                            <Lock className="h-3 w-3" /> {dep.assigned_invoice_number}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 gap-1">
                            <AlertTriangle className="h-3 w-3" /> Sin vínculo fijo
                          </Badge>
                        )}
                        {dep.assigned_invoice_annulled && (
                          <Badge className="bg-red-50 text-red-700 border border-red-200">Factura anulada</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {fmtDate(dep.created_at)} · {dep.description || "—"}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{dep.id}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={pending[dep.id] || dep.assigned_invoice_number || ""}
                        onValueChange={(v) => setPending((p) => ({ ...p, [dep.id]: v }))}
                      >
                        <SelectTrigger className="h-10 w-44 rounded-lg" data-testid={`invoice-select-${dep.id.slice(0, 8)}`}>
                          <SelectValue placeholder="Factura destino" />
                        </SelectTrigger>
                        <SelectContent>
                          {(clientInvoices[m.customer_id] || []).map((inv) => (
                            <SelectItem key={inv.id} value={inv.invoice_number} data-testid={`invoice-opt-${inv.invoice_number}`}>
                              {inv.invoice_number}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => doReassign(dep)}
                        disabled={savingId === dep.id}
                        className="h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white gap-1"
                        data-testid={`reassign-btn-${dep.id.slice(0, 8)}`}
                      >
                        <Link2 className="h-4 w-4" />
                        {savingId === dep.id ? "..." : "Fijar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
