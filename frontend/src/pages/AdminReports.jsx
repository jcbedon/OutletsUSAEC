import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getReportsSummary, getLives, getLiveReport } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, BarChart3, DollarSign, Users, TrendingUp, Radio } from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";

export default function AdminReports() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [lives, setLives] = useState([]);
  const [selectedLiveId, setSelectedLiveId] = useState(null);
  const [liveReport, setLiveReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedLiveId) {
      getLiveReport(selectedLiveId).then(res => setLiveReport(res.data)).catch(() => toast.error("Error"));
    }
  }, [selectedLiveId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

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
          <Card className="rounded-xl" data-testid="report-total-sales">
            <CardContent className="p-4">
              <DollarSign className="h-6 w-6 text-green-600 mb-2" />
              <p className="text-2xl font-extrabold">${summary ? summary.total_sales.toFixed(0) : 0}</p>
              <p className="text-xs text-gray-500">Ventas</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl" data-testid="report-commissions">
            <CardContent className="p-4">
              <TrendingUp className="h-6 w-6 text-yellow-600 mb-2" />
              <p className="text-2xl font-extrabold">${summary ? summary.total_commissions.toFixed(0) : 0}</p>
              <p className="text-xs text-gray-500">Comisiones</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl" data-testid="report-clients">
            <CardContent className="p-4">
              <Users className="h-6 w-6 text-blue-600 mb-2" />
              <p className="text-2xl font-extrabold">{summary ? summary.client_count : 0}</p>
              <p className="text-xs text-gray-500">Clientes</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl" data-testid="report-lives">
            <CardContent className="p-4">
              <Radio className="h-6 w-6 text-red-600 mb-2" />
              <p className="text-2xl font-extrabold">{summary ? summary.live_count : 0}</p>
              <p className="text-xs text-gray-500">Lives</p>
            </CardContent>
          </Card>
        </div>

        <h2 className="text-lg font-bold text-slate-800 mb-4">Top Clientes</h2>
        <Card className="rounded-xl mb-8">
          <CardContent className="p-4">
            <TopCustomersList customers={summary ? summary.top_customers : []} />
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
                <LiveOptions lives={lives} />
              </SelectContent>
            </Select>
            <LiveReportDisplay report={liveReport} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TopCustomersList({ customers }) {
  if (!customers || customers.length === 0) {
    return <p className="text-center text-gray-500 py-8">Sin datos</p>;
  }
  return (
    <div className="space-y-3">
      {customers.slice(0, 5).map((c, i) => (
        <div key={c._id} className="flex justify-between items-center py-2 border-b last:border-0">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold">{i+1}</span>
            <span className="font-bold">#{c._id}</span>
          </div>
          <span className="text-green-600 font-bold">${c.total_spent.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function LiveOptions({ lives }) {
  return lives.map((l) => (
    <SelectItem key={l.id} value={l.id}>
      {l.title}
    </SelectItem>
  ));
}

function LiveReportDisplay({ report }) {
  if (!report) {
    return (
      <div className="text-center py-8 text-gray-400">
        <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Selecciona un Live</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-green-50 rounded-xl p-4 text-center">
        <p className="text-xs text-gray-500">Ventas</p>
        <p className="text-xl font-bold text-green-600">${report.total_sales.toFixed(2)}</p>
      </div>
      <div className="bg-yellow-50 rounded-xl p-4 text-center">
        <p className="text-xs text-gray-500">Comisiones</p>
        <p className="text-xl font-bold text-yellow-600">${report.total_commissions.toFixed(2)}</p>
      </div>
      <div className="bg-blue-50 rounded-xl p-4 text-center">
        <p className="text-xs text-gray-500">Compras</p>
        <p className="text-xl font-bold text-blue-600">{report.purchase_count}</p>
      </div>
    </div>
  );
}
