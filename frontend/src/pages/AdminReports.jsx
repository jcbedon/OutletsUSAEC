import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getReportsSummary, getLives, getLiveReport } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowLeft, 
  BarChart3, 
  DollarSign, 
  Users, 
  TrendingUp,
  Package,
  Radio,
  ShoppingBag
} from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/2n5fsvku_outlets.jpg";

export default function AdminReports() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [lives, setLives] = useState([]);
  const [selectedLiveId, setSelectedLiveId] = useState(null);
  const [liveReport, setLiveReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedLiveId) {
      loadLiveReport(selectedLiveId);
    }
  }, [selectedLiveId]);

  const loadData = async () => {
    try {
      const [summaryRes, livesRes] = await Promise.all([
        getReportsSummary(),
        getLives()
      ]);
      setSummary(summaryRes.data);
      setLives(livesRes.data);
    } catch (error) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const loadLiveReport = async (liveId) => {
    try {
      const response = await getLiveReport(liveId);
      setLiveReport(response.data);
    } catch (error) {
      toast.error("Error al cargar reporte del Live");
    }
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
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate("/admin")}
            data-testid="back-btn"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={LOGO_URL} alt="Outlets USA EC" className="h-8 object-contain" />
          <span className="font-bold text-slate-800">Reportes</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Summary Stats */}
        <h2 className="text-lg font-bold text-slate-800 mb-4">Resumen General</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="rounded-xl" data-testid="report-total-sales">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-slate-800">
                    ${summary?.total_sales?.toFixed(0) || 0}
                  </p>
                  <p className="text-xs text-gray-500">Ventas Totales</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl" data-testid="report-commissions">
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

          <Card className="rounded-xl" data-testid="report-clients">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-slate-800">
                    {summary?.client_count || 0}
                  </p>
                  <p className="text-xs text-gray-500">Clientes</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl" data-testid="report-lives">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <Radio className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-slate-800">
                    {summary?.live_count || 0}
                  </p>
                  <p className="text-xs text-gray-500">Lives</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Customers */}
        <h2 className="text-lg font-bold text-slate-800 mb-4">Top 10 Clientes</h2>
        <Card className="rounded-xl mb-8">
          <CardContent className="p-4">
            {summary?.top_customers && summary.top_customers.length > 0 ? (
              <div className="space-y-3">
                {summary.top_customers.map((customer, index) => (
                  <div 
                    key={customer._id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                    data-testid="top-customer-row"
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
                        <p className="font-bold text-slate-800">#{customer._id}</p>
                        <p className="text-xs text-gray-500">{customer.purchase_count} compras</p>
                      </div>
                    </div>
                    <p className="text-xl font-bold text-green-600">${customer.total_spent.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">Sin datos de clientes</p>
            )}
          </CardContent>
        </Card>

        {/* Live Report */}
        <h2 className="text-lg font-bold text-slate-800 mb-4">Reporte por Live</h2>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <Select onValueChange={(value) => setSelectedLiveId(value)}>
              <SelectTrigger className="h-12 rounded-xl mb-4" data-testid="select-live-report">
                <SelectValue placeholder="Seleccionar Live" />
              </SelectTrigger>
              <SelectContent>
                {lives.map((live) => (
                  <SelectItem key={live.id} value={live.id}>
                    {live.title} - {new Date(live.created_at).toLocaleDateString('es-ES')}
                    {live.status === 'active' && ' (EN VIVO)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {liveReport && (
              <div className="space-y-4">
                {/* Live Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-500">Ventas</p>
                    <p className="text-2xl font-extrabold text-green-600">
                      ${liveReport.total_sales.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-yellow-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-500">Comisiones</p>
                    <p className="text-2xl font-extrabold text-yellow-600">
                      ${liveReport.total_commissions.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-500">Compras</p>
                    <p className="text-2xl font-extrabold text-blue-600">
                      {liveReport.purchase_count}
                    </p>
                  </div>
                </div>

                {/* Customer Summary */}
                {Object.keys(liveReport.customer_summary).length > 0 && (
                  <div>
                    <h3 className="font-bold text-slate-800 mb-3">Ventas por Cliente</h3>
                    <div className="space-y-2">
                      {Object.entries(liveReport.customer_summary)
                        .sort((a, b) => b[1].total - a[1].total)
                        .map(([customerId, data]) => (
                          <div 
                            key={customerId}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-bold">#{customerId}</Badge>
                              <span className="text-sm text-gray-500">{data.count} compras</span>
                            </div>
                            <span className="font-bold text-green-600">${data.total.toFixed(2)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Purchases List */}
                {liveReport.purchases.length > 0 && (
                  <div>
                    <h3 className="font-bold text-slate-800 mb-3">Detalle de Compras</h3>
                    <ScrollArea className="h-60">
                      <div className="space-y-2">
                        {liveReport.purchases.map((purchase) => (
                          <div 
                            key={purchase.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">#{purchase.customer_id}</Badge>
                                <span className="font-medium">{purchase.item_name}</span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">{purchase.store}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-red-600">${purchase.total.toFixed(2)}</p>
                              <p className="text-xs text-gray-400">
                                {new Date(purchase.created_at).toLocaleTimeString('es-ES', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}

            {!liveReport && !selectedLiveId && (
              <div className="text-center py-8 text-gray-400">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Selecciona un Live para ver el reporte</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
