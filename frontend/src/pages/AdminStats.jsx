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

export default function AdminStats() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const logoUrl = user?.tenant_logo || "";
  const [stats, setStats] = useState(null);
  const [debtsData, setDebtsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("resumen");
  
  // Filtros para deudas
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [chartLimit, setChartLimit] = useState(15);
  const [tableLimit, setTableLimit] = useState(20);
  const [sortBy, setSortBy] = useState("debt");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, debtsRes] = await Promise.all([
          getBusinessStats(),
          getClientsDebtsReport()
        ]);
        setStats(statsRes.data);
        setDebtsData(debtsRes.data);
      } catch (e) {
        toast.error("Error al cargar estadisticas");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
          comparison = b.debt_amount - a.debt_amount;
          break;
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "date":
          comparison = new Date(b.created_at) - new Date(a.created_at);
          break;
        case "balance":
          comparison = a.pending_balance - b.pending_balance;
          break;
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
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 object-contain" />}
          <span className="font-bold text-slate-800">Estadisticas del Negocio</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="rounded-xl bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4">
              <Badge className="bg-green-600 text-white text-xs mb-2">Ganancia</Badge>
              <p className="text-2xl font-extrabold text-green-700">{formatMoney(rev.gross_profit)}</p>
              <p className="text-xs text-green-600">Comisiones + Envios</p>
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
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5 text-slate-600" />
                      Detalle de Clientes
                    </CardTitle>
                    <div className="flex items-center gap-2">
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
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th 
                            className="text-left p-2 font-medium cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort("name")}
                          >
                            Cliente <SortIcon column="name" />
                          </th>
                          <th className="text-left p-2 font-medium">ID</th>
                          <th 
                            className="text-left p-2 font-medium hidden md:table-cell cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort("date")}
                          >
                            Registrado <SortIcon column="date" />
                          </th>
                          <th className="text-right p-2 font-medium">Wallet</th>
                          <th className="text-right p-2 font-medium">Envios</th>
                          <th 
                            className="text-right p-2 font-medium cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort("balance")}
                          >
                            Balance <SortIcon column="balance" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredClients.slice(0, tableLimit).map((client) => (
                          <tr key={client.id} className={`border-b hover:bg-gray-50 ${client.debt_amount > 0 ? 'bg-red-50/50' : ''}`}>
                            <td className="p-2">
                              <div className="font-medium text-slate-800">{client.name}</div>
                              <div className="text-xs text-gray-500">{client.whatsapp}</div>
                            </td>
                            <td className="p-2">
                              <Badge variant="outline" className="text-xs">{client.customer_id}</Badge>
                            </td>
                            <td className="p-2 text-gray-600 hidden md:table-cell">
                              {client.created_at ? new Date(client.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                            </td>
                            <td className="p-2 text-right font-medium text-blue-600">{formatMoney(client.wallet_balance)}</td>
                            <td className="p-2 text-right font-medium text-purple-600">{formatMoney(client.total_shipping)}</td>
                            <td className="p-2 text-right">
                              <span className={`font-bold ${client.pending_balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {client.pending_balance < 0 ? `-${formatMoney(Math.abs(client.pending_balance))}` : formatMoney(client.pending_balance)}
                              </span>
                            </td>
                          </tr>
                        ))}
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

        {/* Image Preview Dialog */}
        <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2" style={{ color: "#1E3A5F" }}>
                <Receipt className="h-5 w-5" />
                Factura de Tienda
              </DialogTitle>
            </DialogHeader>
            {selectedImage && (
              <img src={selectedImage} alt="Factura" className="w-full rounded-xl" />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
