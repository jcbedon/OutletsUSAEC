import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getAllShipments, getTenantSettings } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Package, Search, Users, Layers, DollarSign,
} from "lucide-react";

// Week boundary helper: Monday 12:00 local → next Monday 11:59:59 local.
// Returns an ISO date string of the start-Monday at noon, used as a stable bucket key.
function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const daysSinceMonday = (day - 1 + 7) % 7;
  const candidate = new Date(d);
  candidate.setDate(d.getDate() - daysSinceMonday);
  candidate.setHours(12, 0, 0, 0);
  if (candidate > d) candidate.setDate(candidate.getDate() - 7);
  return candidate.toISOString().slice(0, 10);
}

function getWeekLabel(weekKey) {
  // weekKey is an ISO date (yyyy-mm-dd) for the start-Monday.
  const start = new Date(`${weekKey}T12:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const fmt = (dt) => dt.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${fmt(start)} 12:00 → ${fmt(end)} 12:00`;
}

export default function AdminPackagesReport() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [shipments, setShipments] = useState([]);
  const [categories, setCategories] = useState([]); // [{key, label, value_packages, value_pounds}]
  const [shippingMode, setShippingMode] = useState("packages");
  const [weekFilter, setWeekFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    (async () => {
      try {
        const [shipsRes, tenantRes] = await Promise.all([
          getAllShipments(),
          getTenantSettings(),
        ]);
        setShipments(shipsRes.data || []);
        const cats = (tenantRes.data?.shipping_categories || []).map((c) => ({
          ...c,
          value_packages: c.value_packages ?? c.value ?? 0,
          value_pounds: c.value_pounds ?? c.value ?? 0,
        }));
        setCategories(cats);
        setShippingMode(tenantRes.data?.shipping_mode === "pounds" ? "pounds" : "packages");
      } catch (e) {
        toast.error("No se pudo cargar el reporte de paquetes");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Derive every week present in the data, sorted desc.
  const weekOptions = useMemo(() => {
    const set = new Set();
    shipments.forEach((s) => set.add(getWeekKey(s.created_at)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [shipments]);

  // Filtered list (week + customer + category)
  const filtered = useMemo(() => {
    let rows = shipments;
    if (weekFilter !== "all") rows = rows.filter((s) => getWeekKey(s.created_at) === weekFilter);
    const code = customerFilter.trim().toUpperCase();
    if (code) rows = rows.filter((s) => (s.customer_id || "").toUpperCase().includes(code));
    if (categoryFilter !== "all") rows = rows.filter((s) => (s.shipping_category || "").toUpperCase() === categoryFilter);
    return rows;
  }, [shipments, weekFilter, customerFilter, categoryFilter]);

  // Aggregations
  const summary = useMemo(() => {
    const byCustomer = {}; // customer_id -> { name, total_qty, total_cost, by_cat: { key: { qty, cost } } }
    const byCategory = {}; // category_key -> { label, qty, cost, customers_set }
    let grandQty = 0;
    let grandCost = 0;

    filtered.forEach((s) => {
      const custId = (s.customer_id || "—").toUpperCase();
      const custName = s.customer_name || "";
      const catKey = (s.shipping_category || "OTHER").toUpperCase();
      const cat = categories.find((c) => c.key === catKey);
      const qty = Number(s.package_count) || 0;
      const cost = Number(s.shipping_cost) || 0;
      grandQty += qty;
      grandCost += cost;

      // by customer
      if (!byCustomer[custId]) byCustomer[custId] = { customer_id: custId, name: custName, total_qty: 0, total_cost: 0, by_cat: {} };
      byCustomer[custId].total_qty += qty;
      byCustomer[custId].total_cost += cost;
      if (!byCustomer[custId].by_cat[catKey]) byCustomer[custId].by_cat[catKey] = { qty: 0, cost: 0, label: cat?.label || catKey };
      byCustomer[custId].by_cat[catKey].qty += qty;
      byCustomer[custId].by_cat[catKey].cost += cost;
      // also keep most recent name
      if (custName && !byCustomer[custId].name) byCustomer[custId].name = custName;

      // by category
      if (!byCategory[catKey]) byCategory[catKey] = { key: catKey, label: cat?.label || catKey, qty: 0, cost: 0, customers: new Set() };
      byCategory[catKey].qty += qty;
      byCategory[catKey].cost += cost;
      byCategory[catKey].customers.add(custId);
    });

    return {
      grandQty,
      grandCost,
      byCustomer: Object.values(byCustomer).sort((a, b) => b.total_qty - a.total_qty),
      byCategory: Object.values(byCategory).map((c) => ({ ...c, customer_count: c.customers.size })).sort((a, b) => b.qty - a.qty),
    };
  }, [filtered, categories]);

  const isPounds = shippingMode === "pounds";
  const unitLabel = isPounds ? "lb" : "paq.";
  const fmtQty = (q) => Number(q).toFixed(isPounds ? 1 : 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen pb-12">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} data-testid="back-btn" className="rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-800">Detalle de Paquetes</h1>
              <p className="text-xs text-slate-500">Corte semanal: lunes 12:00 → lunes 12:00</p>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <Package className="h-5 w-5 text-orange-600" />
          </div>
        </div>

        {/* Filters */}
        <Card className="rounded-2xl border-slate-100 mb-4">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Semana</label>
                <Select value={weekFilter} onValueChange={setWeekFilter}>
                  <SelectTrigger className="h-10 rounded-xl bg-white" data-testid="week-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las semanas</SelectItem>
                    {weekOptions.map((wk) => (
                      <SelectItem key={wk} value={wk}>{getWeekLabel(wk)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Cliente</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={customerFilter}
                    onChange={(e) => setCustomerFilter(e.target.value)}
                    placeholder="Código de cliente"
                    className="h-10 rounded-xl pl-9 uppercase"
                    data-testid="customer-filter"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Categoría</label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-10 rounded-xl bg-white" data-testid="category-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                    <SelectItem value="OTHER">Otra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="rounded-2xl bg-orange-50 border-orange-100" data-testid="kpi-total-qty">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-orange-700 text-[10px] uppercase font-bold">
                <Package className="h-3.5 w-3.5" /> Total {unitLabel}
              </div>
              <p className="text-xl font-extrabold text-orange-900 mt-1">{fmtQty(summary.grandQty)}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl bg-purple-50 border-purple-100" data-testid="kpi-total-cost">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-purple-700 text-[10px] uppercase font-bold">
                <DollarSign className="h-3.5 w-3.5" /> Total a Cobrar
              </div>
              <p className="text-xl font-extrabold text-purple-900 mt-1">${summary.grandCost.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl bg-blue-50 border-blue-100" data-testid="kpi-customers">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-blue-700 text-[10px] uppercase font-bold">
                <Users className="h-3.5 w-3.5" /> Clientes
              </div>
              <p className="text-xl font-extrabold text-blue-900 mt-1">{summary.byCustomer.length}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl bg-slate-50 border-slate-100" data-testid="kpi-shipments">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-slate-600 text-[10px] uppercase font-bold">
                <Layers className="h-3.5 w-3.5" /> Envíos
              </div>
              <p className="text-xl font-extrabold text-slate-800 mt-1">{filtered.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* By Category */}
        <Card className="rounded-2xl mb-4">
          <CardContent className="p-4">
            <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4" /> Resumen por Categoría
            </h2>
            {summary.byCategory.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">Sin datos para esta semana.</p>
            ) : (
              <div className="space-y-2">
                {summary.byCategory.map((cat) => (
                  <div key={cat.key} className="grid grid-cols-12 gap-2 items-center bg-slate-50 rounded-xl px-3 py-2 text-xs" data-testid={`cat-row-${cat.key}`}>
                    <div className="col-span-5 min-w-0">
                      <Badge variant="outline" className="font-mono mr-1">{cat.key}</Badge>
                      <span className="text-slate-700 font-semibold truncate">{cat.label}</span>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-[9px] uppercase text-slate-500">Cant.</p>
                      <p className="font-extrabold text-slate-800">{fmtQty(cat.qty)}</p>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-[9px] uppercase text-slate-500">Clientes</p>
                      <p className="font-extrabold text-slate-800">{cat.customer_count}</p>
                    </div>
                    <div className="col-span-3 text-right">
                      <p className="text-[9px] uppercase text-slate-500">Total</p>
                      <p className="font-extrabold text-purple-700">${cat.cost.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By Customer */}
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" /> Detalle por Cliente
            </h2>
            {summary.byCustomer.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">Sin datos para esta semana.</p>
            ) : (
              <div className="space-y-3">
                {summary.byCustomer.map((cust) => (
                  <div key={cust.customer_id} className="rounded-xl border border-slate-100 bg-white" data-testid={`cust-row-${cust.customer_id}`}>
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-t-xl">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="font-mono">{cust.customer_id}</Badge>
                        <span className="text-xs font-semibold text-slate-700 truncate">{cust.name || ""}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-bold text-slate-500">Total</p>
                        <p className="text-sm font-extrabold text-purple-700">${cust.total_cost.toFixed(2)} · {fmtQty(cust.total_qty)} {unitLabel}</p>
                      </div>
                    </div>
                    <div className="px-3 py-2 space-y-1.5">
                      {Object.entries(cust.by_cat).map(([catKey, c]) => (
                        <div key={catKey} className="flex items-center justify-between text-xs" data-testid={`cust-${cust.customer_id}-cat-${catKey}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className="font-mono text-[10px]">{catKey}</Badge>
                            <span className="text-slate-600 truncate">{c.label}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-slate-700 font-bold">{fmtQty(c.qty)} {unitLabel}</span>
                            <span className="text-purple-700 font-extrabold">${c.cost.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
