import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { getBusinessStats } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, DollarSign, TrendingUp, Wallet, Truck, Store, Radio, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { SalesTrendChart, StoreBarChart, ProfitPieChart, LiveBarChart } from "@/components/StatsCharts";

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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("resumen");

  useEffect(() => {
    async function load() {
      try {
        const res = await getBusinessStats();
        setStats(res.data);
      } catch (e) {
        toast.error("Error al cargar estadisticas");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
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
          <TabsList className="grid w-full grid-cols-3 rounded-xl h-11 bg-white border">
            <TabsTrigger value="resumen" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              <DollarSign className="h-4 w-4 mr-1" /> Resumen
            </TabsTrigger>
            <TabsTrigger value="graficas" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              <BarChart3 className="h-4 w-4 mr-1" /> Graficas
            </TabsTrigger>
            <TabsTrigger value="detalle" className="rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              <Store className="h-4 w-4 mr-1" /> Detalle
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
