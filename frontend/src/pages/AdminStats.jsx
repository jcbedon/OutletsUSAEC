import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { getBusinessStats, getClientsDebtsReport } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ArrowLeft, DollarSign, TrendingUp, TrendingDown, Wallet, Store, Radio, BarChart3, PieChart as PieChartIcon, Users, AlertTriangle, Search, Filter, ChevronDown, ChevronUp, Receipt, Image } from "lucide-react";
import { SalesTrendChart, StoreBarChart, ProfitPieChart, LiveBarChart, ClientsDebtsChart, ClientsDebtsPieChart, ClientsByDateChart } from "@/components/StatsCharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StoreProfitsReport from "@/components/StoreProfitsReport";

function formatMoney(n) {
  return "$" + (n || 0).toFixed(2);
}

function ListItem({ rank, name, count, sales, commission, color }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: color }}>
          {rank}
        </div>
        <div>
          <p className="font-medium text-slate-800">{name}</p>
          <p className="text-xs text-gray-500">{count} ventas</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-bold text-slate-800">{formatMoney(sales)}</p>
        <p className="text-xs text-yellow-600">+{formatMoney(commission)}</p>
      </div>
    </div>
  );
}

const DEFAULT_LOGO = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";

export default function AdminStats() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const logoUrl = user?.tenant_logo || DEFAULT_LOGO;
  const [stats, setStats] = useState(null);
  const [debtsData, setDebtsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("resumen");
  const [period, setPeriod] = useState("all");
  
  // Filtros para deudas
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [chartLimit, setChartLimit] = useState(15);
  const [tableLimit, setTableLimit] = useState(20);
  const [sortBy, setSortBy] = useState("debt");
  const [sortAsc, setSortAsc] = useState(false);

  const loadStats = async (p) => {
    try {
      setLoading(true);
      const [statsRes, debtsRes] = await Promise.all([
        getBusinessStats(p || period),
        getClientsDebtsReport()
      ]);
      setStats(statsRes.data);
      setDebtsData(debtsRes.data);
    } catch (e) {
      toast.error("Error al cargar estadisticas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    loadStats(newPeriod);
  };

  // Datos filtrados y ordenados
  const filteredClients = useMemo(() => {
    if (!debtsData?.clients) return [];
    
    let result = [...debtsData.clients];
    
    // Filtro de búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(term) ||
        c.customer_id.toLowerCase().includes(term) ||
        (c.whatsapp && c.whatsapp.includes(term))
      );
    }
    
    // Filtro de estado
    if (statusFilter === "with_debt") {
      result = result.filter(c => c.pending_balance < 0);
    } else if (statusFilter === "no_debt") {
      result = result.filter(c => c.pending_balance >= 0);
    }
    
    // Ordenamiento
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "debt":
          // Highest debt first: use last_invoice_amount fallback to debt_amount
          comparison = (b.last_invoice_amount || b.debt_amount || 0) - (a.last_invoice_amount || a.debt_amount || 0);
          break;
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "code":
          comparison = (a.customer_id || "").localeCompare(b.customer_id || "");
          break;
        case "date":
          comparison = new Date(b.created_at) - new Date(a.created_at);
          break;
        case "balance":
          comparison = a.pending_balance - b.pending_balance;
          break;
        case "days_unpaid": {
          // Most days without paying first.
          const dA = a.last_invoice_date ? Math.floor((Date.now() - new Date(a.last_invoice_date)) / 86400000) : -1;
          const dB = b.last_invoice_date ? Math.floor((Date.now() - new Date(b.last_invoice_date)) / 86400000) : -1;
          comparison = dB - dA;
          break;
        }
        default:
          comparison = b.debt_amount - a.debt_amount;
      }
      return sortAsc ? -comparison : comparison;
    });
    
    return result;
  }, [debtsData?.clients, searchTerm, statusFilter, sortBy, sortAsc]);

  // Resumen filtrado
  const filteredSummary = useMemo(() => {
    const clients = filteredClients;
    const withDebt = clients.filter(c => c.pending_balance < 0);
    const totalDebt = withDebt.reduce((sum, c) => sum + c.debt_amount, 0);
    
    return {
      total_clients: clients.length,
      clients_with_debt: withDebt.length,
      clients_positive_balance: clients.length - withDebt.length,
      total_debt: totalDebt
    };
  }, [filteredClients]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent"></div>
      </div>
    );
  }

  const rev = stats?.revenue || {};
  const wal = stats?.wallets || {};
  const stores = stats?.sales_by_store || [];
  const lives = stats?.sales_by_live || [];
  const trend = stats?.sales_trend || [];
  const colors = ["#1E3A5F", "#2ECC71", "#E74C3C", "#F39C12", "#9B59B6", "#3498DB"];
  
  // Debts data
  const clientsDebts = debtsData?.clients || [];
  const debtsSummary = debtsData?.summary || {};
  
  // Toggle sort
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(column);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return null;
    return sortAsc ? <ChevronUp className="h-3 w-3 inline ml-1" /> : <ChevronDown className="h-3 w-3 inline ml-1" />;
  };

  return (
    <div className="app-bg min-h-screen">
      <div className="bg-white/90 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={logoUrl} alt="Logo" className="h-10 object-contain" />
          <span className="font-bold text-slate-800">Estadisticas del Negocio</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Period Filter */}
        <div className="flex flex-wrap gap-2" data-testid="period-filter">
          {[
            { value: "today", label: "Hoy" },
            { value: "7days", label: "7 dias" },
            { value: "30days", label: "30 dias" },
            { value: "90days", label: "90 dias" },
            { value: "all", label: "Todo" }
          ].map((opt) => (
            <Button
              key={opt.value}
              variant={period === opt.value ? "default" : "outline"}
              size="sm"
              className={`rounded-xl text-sm ${period === opt.value ? '' : ''}`}
              style={period === opt.value ? { background: '#1E3A5F', color: 'white' } : {}}
              onClick={() => handlePeriodChange(opt.value)}
              data-testid={`period-${opt.value}`}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="rounded-xl bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4">
              <Badge className="bg-green-600 text-white text-xs mb-2">Ganancia</Badge>
              <p className="text-2xl font-extrabold text-green-700">{formatMoney(rev.gross_profit)}</p>
              <p className="text-xs text-green-600">Solo Comisiones</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-4">
              <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs mb-2">{rev.purchase_count} compras</Badge>
              <p className="text-2xl font-extrabold text-blue-700">{formatMoney(rev.total_product_sales)}</p>
              <p className="text-xs text-blue-600">Ventas Productos</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
            <CardContent className="p-4">
              <TrendingUp className="h-5 w-5 text-yellow-600 mb-2" />
              <p className="text-2xl font-extrabold text-yellow-700">{formatMoney(rev.total_commissions)}</p>
              <p className="text-xs text-yellow-600">Comisiones</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-4">
              <Badge variant="outline" className="text-purple-600 border-purple-300 text-xs mb-2">{rev.shipment_count} envios</Badge>
              <p className="text-2xl font-extrabold text-purple-700">{formatMoney(rev.total_shipping)}</p>
              <p className="text-xs text-purple-600">Envios</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 rounded-xl h-11 bg-white border">
            <TabsTrigger value="resumen" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white text-xs sm:text-sm">
              <DollarSign className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Resumen</span>
            </TabsTrigger>
            <TabsTrigger value="ganancias" className="rounded-lg data-[state=active]:bg-green-600 data-[state=active]:text-white text-xs sm:text-sm">
              <Receipt className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Tiendas</span>
            </TabsTrigger>
            <TabsTrigger value="deudas" className="rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white text-xs sm:text-sm">
              <AlertTriangle className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Deudas</span>
            </TabsTrigger>
            <TabsTrigger value="graficas" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Graficas</span>
            </TabsTrigger>
            <TabsTrigger value="detalle" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white text-xs sm:text-sm">
              <Store className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Detalle</span>
            </TabsTrigger>
          </TabsList>

          {/* Resumen Tab */}
          <TabsContent value="resumen" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Desglose de Ingresos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between py-2 border-b"><span className="text-gray-600">Ventas Productos</span><span className="font-bold">{formatMoney(rev.total_product_sales)}</span></div>
                  <div className="flex justify-between py-2 border-b"><span className="text-gray-600">Tax Cobrado</span><span className="font-bold">{formatMoney(rev.total_tax_collected)}</span></div>
                  <div className="flex justify-between py-2 border-b"><span className="text-gray-600">Comisiones</span><span className="font-bold text-yellow-600">{formatMoney(rev.total_commissions)}</span></div>
                  <div className="flex justify-between py-2 border-b"><span className="text-gray-600">Envios</span><span className="font-bold text-purple-600">{formatMoney(rev.total_shipping)}</span></div>
                  <div className="flex justify-between py-3 bg-green-50 rounded-lg px-3">
                    <span className="font-bold text-green-800">GANANCIA TOTAL</span>
                    <span className="font-extrabold text-2xl text-green-600">{formatMoney(rev.gross_profit)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-blue-600" />
                    Estado de Wallets
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between py-2 border-b"><span className="text-gray-600">Depositos Recibidos</span><span className="font-bold text-green-600">{formatMoney(wal.total_deposits_received)}</span></div>
                  <div className="flex justify-between py-2 border-b"><span className="text-gray-600">Saldo Clientes</span><span className="font-bold text-blue-600">{formatMoney(wal.total_client_balance)}</span></div>
                  <div className="flex justify-between py-2 border-b"><span className="text-gray-600">Clientes</span><span className="font-bold">{wal.client_count || 0}</span></div>
                  <div className="flex justify-between py-2 border-b"><span className="text-gray-600">Compras</span><span className="font-bold">{rev.purchase_count || 0}</span></div>
                  <div className="flex justify-between py-2"><span className="text-gray-600">Peso Enviado</span><span className="font-bold">{rev.total_weight_shipped || 0} lbs</span></div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Ganancias Tab - Store Profits */}
          <TabsContent value="ganancias" className="mt-6">
            <StoreProfitsReport />
          </TabsContent>

          {/* Graficas Tab */}
          <TabsContent value="graficas" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sales Trend */}
              <Card className="rounded-xl md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                    Tendencia de Ventas (30 dias)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SalesTrendChart data={trend} />
                </CardContent>
              </Card>

              {/* Store Bar Chart */}
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Store className="h-5 w-5 text-blue-600" />
                    Ventas por Tienda
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StoreBarChart data={stores} />
                </CardContent>
              </Card>

              {/* Profit Pie Chart */}
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <PieChartIcon className="h-5 w-5 text-green-600" />
                    Distribucion de Ganancias
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ProfitPieChart commissions={rev.total_commissions} shipping={rev.total_shipping} />
                </CardContent>
              </Card>

              {/* Live Bar Chart */}
              <Card className="rounded-xl md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Radio className="h-5 w-5 text-red-600" />
                    Ventas por Live
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <LiveBarChart data={lives} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Deudas Tab */}
          <TabsContent value="deudas" className="mt-6">
            <div className="space-y-6">
              {/* Filters */}
              <Card className="rounded-xl">
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row gap-4">
                    {/* Search */}
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Buscar por nombre, ID o WhatsApp..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                        data-testid="debt-search-input"
                      />
                    </div>
                    
                    {/* Status Filter */}
                    <div className="flex gap-2">
                      <Button
                        variant={statusFilter === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStatusFilter("all")}
                        className={statusFilter === "all" ? "bg-slate-800" : ""}
                        data-testid="filter-all"
                      >
                        Todos ({clientsDebts.length})
                      </Button>
                      <Button
                        variant={statusFilter === "with_debt" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStatusFilter("with_debt")}
                        className={statusFilter === "with_debt" ? "bg-red-600 hover:bg-red-700" : "text-red-600 border-red-300"}
                        data-testid="filter-with-debt"
                      >
                        Con Deuda ({debtsSummary.clients_with_debt || 0})
                      </Button>
                      <Button
                        variant={statusFilter === "no_debt" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStatusFilter("no_debt")}
                        className={statusFilter === "no_debt" ? "bg-green-600 hover:bg-green-700" : "text-green-600 border-green-300"}
                        data-testid="filter-no-debt"
                      >
                        Sin Deuda ({debtsSummary.clients_positive_balance || 0})
                      </Button>
                    </div>
                    
                    {/* Chart Limit */}
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-gray-400" />
                      <select
                        value={chartLimit}
                        onChange={(e) => setChartLimit(Number(e.target.value))}
                        className="border rounded-md px-2 py-1 text-sm bg-white"
                        data-testid="chart-limit-select"
                      >
                        <option value={10}>Top 10</option>
                        <option value={15}>Top 15</option>
                        <option value={25}>Top 25</option>
                        <option value={50}>Top 50</option>
                        <option value={100}>Top 100</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Active filters indicator */}
                  {(searchTerm || statusFilter !== "all") && (
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <span className="text-gray-500">Filtros activos:</span>
                      {searchTerm && (
                        <Badge variant="secondary" className="text-xs">
                          Búsqueda: "{searchTerm}"
                          <button onClick={() => setSearchTerm("")} className="ml-1 hover:text-red-500">×</button>
                        </Badge>
                      )}
                      {statusFilter !== "all" && (
                        <Badge variant="secondary" className="text-xs">
                          {statusFilter === "with_debt" ? "Con Deuda" : "Sin Deuda"}
                          <button onClick={() => setStatusFilter("all")} className="ml-1 hover:text-red-500">×</button>
                        </Badge>
                      )}
                      <span className="text-gray-400">|</span>
                      <span className="font-medium text-slate-700">{filteredClients.length} resultados</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Summary Cards - Using filtered data */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
                  <CardContent className="p-4">
                    <Users className="h-5 w-5 text-slate-600 mb-2" />
                    <p className="text-2xl font-extrabold text-slate-700">{filteredSummary.total_clients}</p>
                    <p className="text-xs text-slate-600">Total Clientes</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl bg-gradient-to-br from-red-50 to-red-100 border-red-200">
                  <CardContent className="p-4">
                    <AlertTriangle className="h-5 w-5 text-red-600 mb-2" />
                    <p className="text-2xl font-extrabold text-red-700">{filteredSummary.clients_with_debt}</p>
                    <p className="text-xs text-red-600">Con Deuda</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                  <CardContent className="p-4">
                    <Wallet className="h-5 w-5 text-green-600 mb-2" />
                    <p className="text-2xl font-extrabold text-green-700">{filteredSummary.clients_positive_balance}</p>
                    <p className="text-xs text-green-600">Sin Deuda</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                  <CardContent className="p-4">
                    <DollarSign className="h-5 w-5 text-orange-600 mb-2" />
                    <p className="text-2xl font-extrabold text-orange-700">{formatMoney(filteredSummary.total_debt)}</p>
                    <p className="text-xs text-orange-600">Deuda Total</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts - Using filtered data */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Debts Chart */}
                <Card className="rounded-xl md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-red-600" />
                      Balance por Cliente
                      <Badge variant="outline" className="ml-auto text-xs">{Math.min(chartLimit, filteredClients.length)} de {filteredClients.length}</Badge>
                    </CardTitle>
                    <p className="text-xs text-gray-500">Rojo = Debe | Verde = A favor</p>
                  </CardHeader>
                  <CardContent>
                    <ClientsDebtsChart data={filteredClients.slice(0, chartLimit)} />
                  </CardContent>
                </Card>

                {/* Pie Chart */}
                <Card className="rounded-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <PieChartIcon className="h-5 w-5 text-slate-600" />
                      Distribucion
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ClientsDebtsPieChart summary={filteredSummary} />
                  </CardContent>
                </Card>
              </div>

              {/* Clients by Date Chart */}
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                    Clientes por Mes de Registro
                  </CardTitle>
                  <p className="text-xs text-gray-500">Cantidad de clientes y deuda acumulada por mes</p>
                </CardHeader>
                <CardContent>
                  <ClientsByDateChart data={filteredClients} />
                </CardContent>
              </Card>

              {/* Clients Table with sortable headers */}
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5 text-slate-600" />
                      Detalle de Clientes
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="border rounded-md px-2 py-1 text-sm bg-white"
                        data-testid="debts-sort-select"
                      >
                        <option value="days_unpaid">Días sin pagar</option>
                        <option value="debt">Deuda más grande</option>
                        <option value="name">Nombre (A-Z)</option>
                        <option value="code">Código (A-Z)</option>
                      </select>
                      <span className="text-sm text-gray-500">Mostrar:</span>
                      <select
                        value={tableLimit}
                        onChange={(e) => setTableLimit(Number(e.target.value))}
                        className="border rounded-md px-2 py-1 text-sm bg-white"
                        data-testid="table-limit-select"
                      >
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                        <option value={1000}>1000</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Filtrar por código de cliente o nombre"
                        className="h-9 rounded-lg pl-9 text-sm"
                        data-testid="debts-customer-filter"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-2 font-medium">Cliente</th>
                          <th className="text-left p-2 font-medium">ID</th>
                          <th className="text-right p-2 font-medium">Última Factura</th>
                          <th className="text-right p-2 font-medium">Fecha</th>
                          <th className="text-right p-2 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredClients.slice(0, tableLimit).map((client) => {
                          // "Última factura" amount — what the user wants displayed:
                          // total_a_pagar of just the last non-annulled invoice.
                          const lastAmount = Number(client.last_invoice_amount || 0);
                          const lastDateStr = client.last_invoice_date;
                          const daysUnpaid = lastDateStr
                            ? Math.floor((Date.now() - new Date(lastDateStr)) / 86400000)
                            : null;
                          let statusLabel = "Sin factura";
                          let statusClass = "text-slate-400";
                          if (daysUnpaid !== null && lastAmount > 0) {
                            if (daysUnpaid > 5) {
                              statusLabel = `Más de 5 días sin pagar — LIQUIDAR (${daysUnpaid}d)`;
                              statusClass = "text-red-600 font-bold";
                            } else if (daysUnpaid > 2) {
                              statusLabel = `Más de 2 días sin pagar (${daysUnpaid}d)`;
                              statusClass = "text-orange-600 font-semibold";
                            } else {
                              statusLabel = `Menos de 2 días sin pagar (${daysUnpaid}d)`;
                              statusClass = "text-green-600 font-semibold";
                            }
                          } else if (daysUnpaid !== null && lastAmount === 0) {
                            statusLabel = "Al día";
                            statusClass = "text-green-600 font-semibold";
                          }
                          return (
                            <tr key={client.id} className={`border-b hover:bg-gray-50 ${lastAmount > 0 && daysUnpaid !== null && daysUnpaid > 5 ? 'bg-red-50/50' : ''}`} data-testid={`debts-row-${client.customer_id}`}>
                              <td className="p-2">
                                <div className="font-medium text-slate-800">{client.name}</div>
                                <div className="text-xs text-gray-500">{client.whatsapp}</div>
                              </td>
                              <td className="p-2">
                                <Badge variant="outline" className="text-xs">{client.customer_id}</Badge>
                              </td>
                              <td className="p-2 text-right">
                                <span className={`font-bold ${lastAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {formatMoney(lastAmount)}
                                </span>
                                {client.last_invoice_number && (
                                  <div className="text-[10px] text-gray-400">{client.last_invoice_number}</div>
                                )}
                              </td>
                              <td className="p-2 text-right text-gray-600">
                                {lastDateStr ? new Date(lastDateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                              </td>
                              <td className={`p-2 text-right text-xs ${statusClass}`} data-testid={`debts-status-${client.customer_id}`}>
                                {statusLabel}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredClients.length > tableLimit && (
                      <div className="text-center py-3 space-y-2">
                        <p className="text-gray-500 text-sm">Mostrando {tableLimit} de {filteredClients.length} clientes</p>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setTableLimit(Math.min(tableLimit + 50, filteredClients.length))}
                        >
                          Cargar más
                        </Button>
                      </div>
                    )}
                    {filteredClients.length === 0 && (
                      <p className="text-center text-gray-400 py-8">No se encontraron clientes con los filtros aplicados</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Detalle Tab */}
          <TabsContent value="detalle" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Store className="h-5 w-5 text-blue-600" />
                    Ranking Tiendas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stores.length > 0 ? stores.map((s, i) => (
                    <ListItem key={i} rank={i + 1} name={s.name} count={s.cantidad} sales={s.ventas} commission={s.comisiones} color={colors[i % colors.length]} />
                  )) : <p className="text-center text-gray-400 py-4">Sin datos</p>}
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Radio className="h-5 w-5 text-red-600" />
                    Ranking Lives
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {lives.length > 0 ? lives.slice(0, 8).map((l, i) => (
                    <ListItem key={i} rank={i + 1} name={l.name} count={l.compras} sales={l.ventas} commission={l.comisiones} color={colors[i % colors.length]} />
                  )) : <p className="text-center text-gray-400 py-4">Sin datos</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
