import { useState, useEffect } from "react";
import { useAuth } from "@/App";
import { useNavigate, Link } from "react-router-dom";
import { getReportsSummary, getActiveLive } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Upload
} from "lucide-react";
import { uploadTenantLogo } from "@/lib/api";

const DEFAULT_LOGO = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";

export default function AdminDashboard() {
  const { user, logout, updateTenantLogo } = useAuth();
  const logoUrl = user?.tenant_logo || DEFAULT_LOGO;
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [activeLive, setActiveLive] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [summaryRes, activeLiveRes] = await Promise.all([
        getReportsSummary(),
        getActiveLive()
      ]);
      setSummary(summaryRes.data);
      setActiveLive(activeLiveRes.data);
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg p-1">
              <img src={logoUrl} alt="Logo" className="h-12 object-contain logo-transparent" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-slate-800">{user?.tenant_name || "Admin"}</p>
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

      <div className="max-w-4xl mx-auto px-4 py-6">
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
      </div>
    </div>
  );
}
