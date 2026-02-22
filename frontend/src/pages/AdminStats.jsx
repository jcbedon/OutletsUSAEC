import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { getBusinessStats } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft,
  DollarSign, 
  TrendingUp,
  Wallet,
  Truck,
  Store,
  Radio,
  ShoppingCart,
  PiggyBank,
  Scale
} from "lucide-react";

const CHART_COLORS = ["#1E3A5F", "#2ECC71", "#E74C3C", "#F39C12", "#9B59B6", "#3498DB", "#1ABC9C", "#E67E22"];

const formatMoney = (n) => "$" + (n || 0).toFixed(2);

export default function AdminStats() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const logoUrl = user?.tenant_logo || "";
  const [businessStats, setBusinessStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const statsRes = await getBusinessStats();
      setBusinessStats(statsRes.data);
    } catch (error) {
      toast.error("Error al cargar estadisticas");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent"></div>
      </div>
    );
  }

  const revenue = businessStats?.revenue || {};
  const wallets = businessStats?.wallets || {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {logoUrl && (
            <div className="bg-white rounded-lg p-1">
              <img src={logoUrl} alt="Logo" className="h-10 object-contain logo-transparent" />
            </div>
          )}
          <span className="font-bold text-slate-800 flex-1">Estadisticas del Negocio</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Revenue Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="rounded-xl bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <PiggyBank className="h-5 w-5 text-green-600" />
                <Badge className="bg-green-600 text-white text-xs">Ganancia</Badge>
              </div>
              <p className="text-2xl font-extrabold text-green-700">{formatMoney(revenue.gross_profit)}</p>
              <p className="text-xs text-green-600 mt-1">Comisiones + Envios</p>
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
                <Badge variant="outline" className="text-purple-600 border-purple-300 text-xs">{revenue.shipment_count} envios</Badge>
              </div>
              <p className="text-2xl font-extrabold text-purple-700">{formatMoney(revenue.total_shipping)}</p>
              <p className="text-xs text-purple-600 mt-1">Total Envios</p>
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
                  <span className="text-gray-600">Envios</span>
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
                  <span className="text-gray-600">Depositos Recibidos</span>
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
                  <span className="text-gray-600">Total Envios</span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
                          <p className="text-xs text-gray-500">{live.store} - {live.compras} compras</p>
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

        {/* Sales Trend - Simple visual bars */}
        {businessStats?.sales_trend?.length > 0 && (
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Tendencia de Ventas (Ultimos 30 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {businessStats.sales_trend.slice(-15).map((day, i) => {
                    const maxSales = Math.max(...businessStats.sales_trend.map(d => d.ventas));
                    const barWidth = maxSales > 0 ? (day.ventas / maxSales) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-16">{day.date.slice(5)}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                          <div 
                            className="h-full rounded-full flex items-center justify-end pr-2"
                            style={{ 
                              width: `${Math.max(barWidth, 5)}%`,
                              background: 'linear-gradient(90deg, #1E3A5F, #2ECC71)'
                            }}
                          >
                            <span className="text-xs text-white font-medium">${day.ventas.toFixed(0)}</span>
                          </div>
                        </div>
                        <span className="text-xs text-yellow-600 w-16 text-right">+${day.comisiones.toFixed(0)}</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
