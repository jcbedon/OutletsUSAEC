import { useState, useEffect } from "react";
import { useAuth } from "@/App";
import { useNavigate, Link } from "react-router-dom";
import { getReportsSummary, getActiveLive, getBusinessStats } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Radio, 
  Users, 
  DollarSign, 
  Package, 
  TrendingUp,
  Wallet,
  Truck,
  BarChart3,
  LogOut,
  Play,
  Gift,
  Upload,
  Store,
  ShoppingCart,
  PiggyBank,
  Scale,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { uploadTenantLogo } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area
} from "recharts";

const DEFAULT_LOGO = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";

const CHART_COLORS = ["#1E3A5F", "#2ECC71", "#E74C3C", "#F39C12", "#9B59B6", "#3498DB", "#1ABC9C", "#E67E22"];

const formatMoney = (n) => "$" + (n || 0).toFixed(2);
const formatNumber = (n) => (n || 0).toLocaleString();

export default function AdminDashboard() {
  const { user, logout, updateTenantLogo } = useAuth();
  const logoUrl = user?.tenant_logo || DEFAULT_LOGO;
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [businessStats, setBusinessStats] = useState(null);
  const [activeLive, setActiveLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [summaryRes, activeLiveRes, statsRes] = await Promise.all([
        getReportsSummary(),
        getActiveLive(),
        getBusinessStats()
      ]);
      setSummary(summaryRes.data);
      setActiveLive(activeLiveRes.data);
      setBusinessStats(statsRes.data);
    } catch (error) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent"></div>
      </div>
    );
  }

  const menuItems = [
    { icon: Radio, label: "Live Shopping", path: "/admin/live", color: "#1E3A5F", description: "Gestionar ventas en vivo" },
    { icon: Users, label: "Clientes", path: "/admin/clients", color: "#2a4f7f", description: "Ver y gestionar clientes" },
    { icon: Wallet, label: "Recargas", path: "/admin/wallet", color: "#2ECC71", description: "Aprobar depósitos" },
    { icon: Truck, label: "Envíos", path: "/admin/shipments", color: "#1E3A5F", description: "Gestionar envíos" },
    { icon: Gift, label: "Referidos", path: "/admin/referrals", color: "#27ae60", description: "Configurar bonos" },
    { icon: BarChart3, label: "Reportes", path: "/admin/reports", color: "#2a4f7f", description: "Ver estadísticas" },
  ];

  const revenue = businessStats?.revenue || {};
  const wallets = businessStats?.wallets || {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg p-1">
              <img src={logoUrl} alt="Logo" className="h-12 object-contain logo-transparent" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-slate-800">{user?.tenant_name || "Outlets USA EC"}</p>
              <p className="text-xs text-gray-500">{user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer" data-testid="upload-logo-btn">
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append("file", file);
                try {
                  const res = await uploadTenantLogo(formData);
                  const fullUrl = `${process.env.REACT_APP_BACKEND_URL}${res.data.logo_url}`;
                  updateTenantLogo(fullUrl);
                  toast.success("Logo actualizado");
                } catch { toast.error("Error al subir logo"); }
              }} />
              <div className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100">
                <Upload className="h-3 w-3" /> Logo
              </div>
            </label>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout}
              data-testid="admin-logout-btn"
              className="text-gray-500"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Active Live Banner */}
        {activeLive && (
          <Card className="mb-6 text-white rounded-2xl overflow-hidden border-0" style={{ background: 'linear-gradient(135deg, #1E3A5F, #2a4f7f)' }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                  <div>
                    <p className="font-bold">LIVE ACTIVO: {activeLive.title}</p>
                    <p className="text-sm text-red-100">
                      {activeLive.purchase_count} ventas | ${activeLive.total_sales?.toFixed(2)} total
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => navigate("/admin/live")}
                  className="font-bold" style={{ background: '#2ECC71', color: 'white' }}
                  data-testid="go-to-live-btn"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Ir al Live
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs for Dashboard Views */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-3 rounded-xl h-11 bg-white border">
            <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              Panel Principal
            </TabsTrigger>
            <TabsTrigger value="stats" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              Estadísticas
            </TabsTrigger>
            <TabsTrigger value="charts" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              Gráficas
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="rounded-xl" data-testid="stat-clients">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(30,58,95,0.1)' }}>
                      <Users className="h-5 w-5" style={{ color: '#1E3A5F' }} />
                    </div>
                    <div>
                      <p className="text-2xl font-extrabold text-slate-800">{summary?.client_count || 0}</p>
                      <p className="text-xs text-gray-500">Clientes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl" data-testid="stat-sales">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(46,204,113,0.1)' }}>
                      <DollarSign className="h-5 w-5" style={{ color: '#2ECC71' }} />
                    </div>
                    <div>
                      <p className="text-2xl font-extrabold text-slate-800">
                        ${summary?.total_sales?.toFixed(0) || 0}
                      </p>
                      <p className="text-xs text-gray-500">Ventas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl" data-testid="stat-commissions">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-extrabold text-slate-800">
                        ${summary?.total_commissions?.toFixed(0) || 0}
                      </p>
                      <p className="text-xs text-gray-500">Comisiones</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl" data-testid="stat-shipments">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                      <Package className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-extrabold text-slate-800">
                        {summary?.pending_shipments || 0}
                      </p>
                      <p className="text-xs text-gray-500">Env. Pend.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Menu Grid */}
            <h2 className="text-lg font-bold text-slate-800 mb-4">Acciones Rápidas</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {menuItems.map((item) => (
                <Link key={item.path} to={item.path}>
                  <Card 
                    className="rounded-xl hover:shadow-lg transition-shadow cursor-pointer card-hover"
                    data-testid={`menu-${item.label.toLowerCase().replace(' ', '-')}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: item.color }}>
                          <item.icon className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{item.label}</p>
                          <p className="text-sm text-gray-500">{item.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {/* Top Customers */}
            {summary?.top_customers && summary.top_customers.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Mejores Clientes</h2>
                <Card className="rounded-xl">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {summary.top_customers.slice(0, 5).map((customer, index) => (
                        <div 
                          key={customer._id} 
                          className="flex items-center justify-between py-2 border-b last:border-0"
                          data-testid="top-customer-item"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                              index === 0 ? 'bg-yellow-100 text-yellow-700' :
                              index === 1 ? 'bg-gray-200 text-gray-700' :
                              index === 2 ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-bold text-slate-800">{customer.name}</p>
                              <p className="text-xs text-gray-500">#{customer._id} • {customer.purchase_count} compras</p>
                            </div>
                          </div>
                          <p className="font-bold text-green-600">${customer.total_spent.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Stats Tab - Detailed Business Statistics */}
          <TabsContent value="stats" className="mt-6">
            {/* Revenue Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="rounded-xl bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <PiggyBank className="h-5 w-5 text-green-600" />
                    <Badge className="bg-green-600 text-white text-xs">Ganancia</Badge>
                  </div>
                  <p className="text-2xl font-extrabold text-green-700">{formatMoney(revenue.gross_profit)}</p>
                  <p className="text-xs text-green-600 mt-1">Comisiones + Envíos</p>
                </CardContent>
              </Card>

              <Card className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <ShoppingCart className="h-5 w-5 text-blue-600" />
                    <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs">{revenue.purchase_count} compras</Badge>
                  </div>
                  <p className="text-2xl font-extrabold text-blue-700">{formatMoney(revenue.total_product_sales)}</p>
                  <p className="text-xs text-blue-600 mt-1">Ventas de Productos</p>
                </CardContent>
              </Card>

              <Card className="rounded-xl bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <TrendingUp className="h-5 w-5 text-yellow-600" />
                  </div>
                  <p className="text-2xl font-extrabold text-yellow-700">{formatMoney(revenue.total_commissions)}</p>
                  <p className="text-xs text-yellow-600 mt-1">Total Comisiones</p>
                </CardContent>
              </Card>

              <Card className="rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Truck className="h-5 w-5 text-purple-600" />
                    <Badge variant="outline" className="text-purple-600 border-purple-300 text-xs">{revenue.shipment_count} envíos</Badge>
                  </div>
                  <p className="text-2xl font-extrabold text-purple-700">{formatMoney(revenue.total_shipping)}</p>
                  <p className="text-xs text-purple-600 mt-1">Total Envíos</p>
                </CardContent>
              </Card>
            </div>

            {/* Financial Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Revenue Breakdown */}
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Desglose de Ingresos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Ventas de Productos</span>
                      <span className="font-bold text-slate-800">{formatMoney(revenue.total_product_sales)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Tax Cobrado</span>
                      <span className="font-bold text-slate-800">{formatMoney(revenue.total_tax_collected)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Comisiones</span>
                      <span className="font-bold text-yellow-600">{formatMoney(revenue.total_commissions)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Envíos</span>
                      <span className="font-bold text-purple-600">{formatMoney(revenue.total_shipping)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 bg-green-50 rounded-lg px-3 -mx-1">
                      <span className="font-bold text-green-800">GANANCIA TOTAL</span>
                      <span className="font-extrabold text-2xl text-green-600">{formatMoney(revenue.gross_profit)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Wallet & Client Stats */}
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-blue-600" />
                    Estado de Wallets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Depósitos Recibidos</span>
                      <span className="font-bold text-green-600">{formatMoney(wallets.total_deposits_received)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Saldo Total Clientes</span>
                      <span className="font-bold text-blue-600">{formatMoney(wallets.total_client_balance)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Clientes con Wallet</span>
                      <span className="font-bold text-slate-800">{wallets.client_count || 0}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Total Compras</span>
                      <span className="font-bold text-slate-800">{revenue.purchase_count || 0}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Total Envíos</span>
                      <span className="font-bold text-slate-800">{revenue.shipment_count || 0}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-600 flex items-center gap-1">
                        <Scale className="h-4 w-4" /> Peso Total Enviado
                      </span>
                      <span className="font-bold text-slate-800">{revenue.total_weight_shipped || 0} lbs</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sales by Store & Live */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sales by Store */}
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Store className="h-5 w-5 text-blue-600" />
                    Ventas por Tienda
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[280px]">
                    {businessStats?.sales_by_store?.length > 0 ? (
                      <div className="space-y-3">
                        {businessStats.sales_by_store.map((store, i) => (
                          <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                                {i + 1}
                              </div>
                              <div>
                                <p className="font-medium text-slate-800">{store.name}</p>
                                <p className="text-xs text-gray-500">{store.cantidad} ventas</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-slate-800">{formatMoney(store.ventas)}</p>
                              <p className="text-xs text-yellow-600">+{formatMoney(store.comisiones)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-gray-400 py-8">Sin datos de tiendas</p>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Sales by Live */}
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Radio className="h-5 w-5 text-red-600" />
                    Ventas por Live
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[280px]">
                    {businessStats?.sales_by_live?.length > 0 ? (
                      <div className="space-y-3">
                        {businessStats.sales_by_live.map((live, i) => (
                          <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-slate-800 truncate">{live.name}</p>
                                {live.status === 'active' && (
                                  <Badge className="bg-green-500 text-white text-xs px-1.5 py-0">En vivo</Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">{live.store} • {live.compras} compras</p>
                            </div>
                            <div className="text-right ml-2">
                              <p className="font-bold text-slate-800">{formatMoney(live.ventas)}</p>
                              <p className="text-xs text-yellow-600">+{formatMoney(live.comisiones)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-gray-400 py-8">Sin datos de Lives</p>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Charts Tab */}
          <TabsContent value="charts" className="mt-6">
            {/* Sales Trend Chart */}
            <Card className="rounded-xl mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Tendencia de Ventas (Últimos 30 días)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {businessStats?.sales_trend?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={businessStats.sales_trend}>
                      <defs>
                        <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1E3A5F" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#1E3A5F" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorComisiones" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2ECC71" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#2ECC71" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip 
                        formatter={(value, name) => [formatMoney(value), name === 'ventas' ? 'Ventas' : 'Comisiones']}
                        labelFormatter={(label) => `Fecha: ${label}`}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="ventas" name="Ventas" stroke="#1E3A5F" fillOpacity={1} fill="url(#colorVentas)" strokeWidth={2} />
                      <Area type="monotone" dataKey="comisiones" name="Comisiones" stroke="#2ECC71" fillOpacity={1} fill="url(#colorComisiones)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-400">
                    Sin datos de tendencia disponibles
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bar Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sales by Store Bar Chart */}
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Store className="h-5 w-5 text-blue-600" />
                    Ventas por Tienda
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {businessStats?.sales_by_store?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={businessStats.sales_by_store.slice(0, 6)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip formatter={(value) => formatMoney(value)} />
                        <Legend />
                        <Bar dataKey="ventas" name="Ventas" fill="#1E3A5F" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="comisiones" name="Comisiones" fill="#2ECC71" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[280px] flex items-center justify-center text-gray-400">
                      Sin datos de tiendas
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Revenue Distribution Pie Chart */}
              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <PiggyBank className="h-5 w-5 text-green-600" />
                    Distribución de Ganancias
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {revenue.gross_profit > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Comisiones', value: revenue.total_commissions || 0 },
                            { name: 'Envíos', value: revenue.total_shipping || 0 }
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          <Cell fill="#F39C12" />
                          <Cell fill="#9B59B6" />
                        </Pie>
                        <Tooltip formatter={(value) => formatMoney(value)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[280px] flex items-center justify-center text-gray-400">
                      Sin datos de ganancias
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
