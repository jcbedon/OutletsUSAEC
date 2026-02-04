import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getReportsSummary, getLives, getLiveReport } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, BarChart3, DollarSign, Users, TrendingUp, Radio } from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/2n5fsvku_outlets.jpg";

const StatCard = ({ icon: Icon, color, value, label, testId }) => (
  <Card className="rounded-xl" data-testid={testId}>
    <CardContent className="p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-extrabold text-slate-800">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

const CustomerRow = ({ customer, index }) => {
  const bgColor = index === 0 ? "bg-yellow-100 text-yellow-700" :
                  index === 1 ? "bg-gray-200 text-gray-700" :
                  index === 2 ? "bg-orange-100 text-orange-700" :
                  "bg-gray-100 text-gray-600";
  
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0" data-testid="top-customer-row">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${bgColor}`}>
          {index + 1}
        </div>
        <div>
          <p className="font-bold text-slate-800">#{customer._id}</p>
          <p className="text-xs text-gray-500">{customer.purchase_count} compras</p>
        </div>
      </div>
      <p className="text-xl font-bold text-green-600">${customer.total_spent.toFixed(2)}</p>
    </div>
  );
};

export default function AdminReports() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [lives, setLives] = useState([]);
  const [selectedLiveId, setSelectedLiveId] = useState(null);
  const [liveReport, setLiveReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res1 = await getReportsSummary();
      const res2 = await getLives();
      setSummary(res1.data);
      setLives(res2.data);
    } catch (err) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveReport = async (id) => {
    try {
      const res = await getLiveReport(id);
      setLiveReport(res.data);
    } catch (err) {
      toast.error("Error al cargar reporte");
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedLiveId) fetchLiveReport(selectedLiveId);
  }, [selectedLiveId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  const sales = summary && summary.total_sales ? summary.total_sales.toFixed(0) : "0";
  const comms = summary && summary.total_commissions ? summary.total_commissions.toFixed(0) : "0";
  const clients = summary ? summary.client_count : 0;
  const livesCnt = summary ? summary.live_count : 0;
  const topCust = summary && summary.top_customers ? summary.top_customers : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={LOGO_URL} alt="Outlets USA EC" className="h-8 object-contain" />
          <span className="font-bold text-slate-800">Reportes</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Resumen General</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={DollarSign} color="bg-green-100 text-green-600" value={`$${sales}`} label="Ventas Totales" testId="report-total-sales" />
          <StatCard icon={TrendingUp} color="bg-yellow-100 text-yellow-600" value={`$${comms}`} label="Comisiones" testId="report-commissions" />
          <StatCard icon={Users} color="bg-blue-100 text-blue-600" value={clients} label="Clientes" testId="report-clients" />
          <StatCard icon={Radio} color="bg-red-100 text-red-600" value={livesCnt} label="Lives" testId="report-lives" />
        </div>

        <h2 className="text-lg font-bold text-slate-800 mb-4">Top 10 Clientes</h2>
        <Card className="rounded-xl mb-8">
          <CardContent className="p-4">
            {topCust.length > 0 ? (
              <div className="space-y-3">
                {topCust.map((c, i) => <CustomerRow key={c._id} customer={c} index={i} />)}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">Sin datos de clientes</p>
            )}
          </CardContent>
        </Card>

        <h2 className="text-lg font-bold text-slate-800 mb-4">Reporte por Live</h2>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <Select onValueChange={setSelectedLiveId}>
              <SelectTrigger className="h-12 rounded-xl mb-4" data-testid="select-live-report">
                <SelectValue placeholder="Seleccionar Live" />
              </SelectTrigger>
              <SelectContent>
                {lives.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.title} - {new Date(l.created_at).toLocaleDateString("es-ES")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {liveReport ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-500">Ventas</p>
                    <p className="text-2xl font-extrabold text-green-600">${liveReport.total_sales.toFixed(2)}</p>
                  </div>
                  <div className="bg-yellow-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-500">Comisiones</p>
                    <p className="text-2xl font-extrabold text-yellow-600">${liveReport.total_commissions.toFixed(2)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-500">Compras</p>
                    <p className="text-2xl font-extrabold text-blue-600">{liveReport.purchase_count}</p>
                  </div>
                </div>

                {liveReport.purchases && liveReport.purchases.length > 0 && (
                  <ScrollArea className="h-60">
                    <div className="space-y-2">
                      {liveReport.purchases.map((p) => (
                        <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                          <div>
                            <Badge variant="outline" className="text-xs">#{p.customer_id}</Badge>
                            <span className="font-medium ml-2">{p.item_name}</span>
                          </div>
                          <span className="font-bold text-red-600">${p.total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            ) : (
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
