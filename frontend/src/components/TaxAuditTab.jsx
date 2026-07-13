import { useState, useEffect, useMemo } from "react";
import { getPurchasesWithoutTax, updatePurchase } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { AlertTriangle, DollarSign, Search, Pencil, RefreshCw } from "lucide-react";

const fmtMoney = (n) => "$" + (Number(n) || 0).toFixed(2);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * Panel de auditoría: lista de compras sin tax con edición inline por fila.
 * Endpoint: GET /admin/reports/purchases-without-tax
 */
export default function TaxAuditTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ purchases: [], summary: {} });
  const [search, setSearch] = useState("");
  const [liveFilter, setLiveFilter] = useState("");
  const [editing, setEditing] = useState(null); // purchase being edited
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ price: "", tax_rate: "0.0825", commission: "" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await getPurchasesWithoutTax();
      setData(res.data || { purchases: [], summary: {} });
    } catch (e) {
      toast.error("No se pudo cargar el reporte de tax");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data.purchases || []).filter((p) => {
      if (liveFilter && p.live_id !== liveFilter) return false;
      if (!term) return true;
      return (
        (p.item_name || "").toLowerCase().includes(term) ||
        (p.store || "").toLowerCase().includes(term) ||
        (p.customer_name || "").toLowerCase().includes(term) ||
        (p.customer_id || "").toLowerCase().includes(term)
      );
    });
  }, [data.purchases, search, liveFilter]);

  const uniqueLives = useMemo(() => {
    const seen = new Map();
    (data.purchases || []).forEach((p) => {
      if (p.live_id && !seen.has(p.live_id)) {
        seen.set(p.live_id, p.live_title || p.live_id);
      }
    });
    return Array.from(seen.entries());
  }, [data.purchases]);

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      price: String(p.price || 0),
      tax_rate: String(p.tax_rate || 0.0825),
      commission: String(p.commission || 0),
    });
  };

  const save = async () => {
    if (!editing) return;
    const price = parseFloat(form.price);
    const tax_rate = parseFloat(form.tax_rate);
    const commission = parseFloat(form.commission);
    if (isNaN(price) || price < 0) return toast.error("Precio inválido");
    if (isNaN(tax_rate) || tax_rate < 0) return toast.error("Tax rate inválido");

    setSaving(true);
    try {
      await updatePurchase(editing.id, {
        price,
        apply_tax: tax_rate > 0,
        tax_rate,
        apply_commission: commission > 0,
        commission,
      });
      toast.success(`"${editing.item_name}" actualizado`);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-4">
            <AlertTriangle className="h-5 w-5 text-orange-600 mb-2" />
            <p className="text-2xl font-extrabold text-orange-700">{data.summary?.total_purchases || 0}</p>
            <p className="text-xs text-orange-600">Compras sin tax</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
          <CardContent className="p-4">
            <DollarSign className="h-5 w-5 text-slate-600 mb-2" />
            <p className="text-2xl font-extrabold text-slate-700">{fmtMoney(data.summary?.total_amount)}</p>
            <p className="text-xs text-slate-600">Monto total</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-4">
            <DollarSign className="h-5 w-5 text-red-600 mb-2" />
            <p className="text-2xl font-extrabold text-red-700">{fmtMoney(data.summary?.total_tax_lost)}</p>
            <p className="text-xs text-red-600">Tax no cobrado (est.)</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="rounded-xl">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-end">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por artículo, tienda, cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-9"
              data-testid="tax-audit-search"
            />
          </div>
          {uniqueLives.length > 0 && (
            <select
              value={liveFilter}
              onChange={(e) => setLiveFilter(e.target.value)}
              className="h-9 border rounded-md px-2 text-sm bg-white"
              data-testid="tax-audit-live-filter"
            >
              <option value="">Todos los lives ({uniqueLives.length})</option>
              {uniqueLives.map(([id, title]) => (
                <option key={id} value={id}>{title}</option>
              ))}
            </select>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="rounded-xl border-orange-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 text-center text-gray-400 text-sm">Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-emerald-600 text-sm">
              ✓ Ninguna compra sin tax con los filtros actuales.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-orange-50/60">
                    <th className="text-left p-2 font-medium">Artículo</th>
                    <th className="text-left p-2 font-medium">Cliente</th>
                    <th className="text-left p-2 font-medium">Live</th>
                    <th className="text-right p-2 font-medium">Precio</th>
                    <th className="text-right p-2 font-medium">Tax</th>
                    <th className="text-right p-2 font-medium">Tax faltante (est.)</th>
                    <th className="text-right p-2 font-medium">Fecha</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const invoiced = !!p.invoice_id;
                    return (
                      <tr
                        key={p.id}
                        className="border-b hover:bg-orange-50/30"
                        data-testid={`tax-audit-row-${p.id}`}
                      >
                        <td className="p-2">
                          <div className="font-medium text-slate-800">{p.item_name}</div>
                          <div className="text-[11px] text-gray-500">{p.store}</div>
                        </td>
                        <td className="p-2">
                          <div>{p.customer_name}</div>
                          <Badge variant="outline" className="text-[10px]">{p.customer_id}</Badge>
                        </td>
                        <td className="p-2 text-xs">{p.live_title}</td>
                        <td className="p-2 text-right font-semibold">{fmtMoney(p.price)}</td>
                        <td className="p-2 text-right">
                          <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-bold">
                            {fmtMoney(p.tax)}
                          </span>
                        </td>
                        <td className="p-2 text-right text-red-600 font-semibold">
                          {fmtMoney(p.would_be_tax)}
                        </td>
                        <td className="p-2 text-right text-xs">{fmtDate(p.created_at)}</td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            variant={invoiced ? "outline" : "default"}
                            onClick={() => openEdit(p)}
                            disabled={invoiced}
                            title={invoiced ? "Ya facturado — anula la factura para editar" : "Editar"}
                            data-testid={`tax-audit-edit-${p.id}`}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            {invoiced ? "Facturado" : "Editar"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-2 text-xs text-gray-500 text-right">
                {filtered.length} de {data.purchases?.length || 0} resultados
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Editar compra sin tax</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-lg text-sm">
                <div className="font-semibold text-slate-800">{editing.item_name}</div>
                <div className="text-xs text-slate-500">
                  {editing.store} · {editing.customer_name} ({editing.customer_id}) · {editing.live_title}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Precio</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    data-testid="tax-edit-price"
                  />
                </div>
                <div>
                  <Label className="text-xs">Tax rate (%)</Label>
                  <select
                    value={form.tax_rate}
                    onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                    className="w-full h-10 border rounded-md px-2 text-sm bg-white"
                    data-testid="tax-edit-rate"
                  >
                    <option value="0">Sin tax (0%)</option>
                    <option value="0.0825">Illinois 8.25%</option>
                    <option value="0.06">Florida 6%</option>
                    <option value="0.07">General 7%</option>
                    <option value="0.10">10%</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Comisión</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.commission}
                    onChange={(e) => setForm({ ...form, commission: e.target.value })}
                    data-testid="tax-edit-commission"
                  />
                </div>
              </div>
              {(() => {
                const price = parseFloat(form.price) || 0;
                const rate = parseFloat(form.tax_rate) || 0;
                const commission = parseFloat(form.commission) || 0;
                const tax = price * rate;
                const total = price + tax + commission;
                return (
                  <div className="p-3 bg-slate-50 rounded-lg text-sm space-y-1">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Precio</span><span>{fmtMoney(price)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Tax</span><span className="text-red-600">{fmtMoney(tax)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Comisión</span><span>{fmtMoney(commission)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800 pt-1 border-t">
                      <span>Nuevo total</span><span>{fmtMoney(total)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} data-testid="tax-edit-save">
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
