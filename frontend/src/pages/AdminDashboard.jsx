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
  Gift
} from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/2n5fsvku_outlets.jpg";

export default function AdminDashboard() {
  const { user, logout } = useAuth();
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
    { 
      icon: Radio, 
      label: "Live Shopping", 
      path: "/admin/live", 
      color: "bg-red-600",
      description: "Gestionar ventas en vivo"
    },
    { 
      icon: Users, 
      label: "Clientes", 
      path: "/admin/clients", 
      color: "bg-blue-600",
      description: "Ver y gestionar clientes"
    },
    { 
      icon: Wallet, 
      label: "Recargas", 
      path: "/admin/wallet", 
      color: "bg-green-600",
      description: "Aprobar depósitos"
    },
    { 
      icon: Truck, 
      label: "Envíos", 
      path: "/admin/shipments", 
      color: "bg-purple-600",
      description: "Gestionar envíos"
    },
    { 
      icon: Gift, 
      label: "Referidos", 
      path: "/admin/referrals", 
      color: "bg-emerald-600",
      description: "Configurar bonos"
    },
    { 
      icon: BarChart3, 
      label: "Reportes", 
      path: "/admin/reports", 
      color: "bg-orange-600",
      description: "Ver estadísticas"
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={LOGO_URL} alt="Outlets USA EC" className="h-10 object-contain" />
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 hidden sm:block">
              Admin: {user?.name}
            </span>
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
          <Card className="mb-6 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-2xl overflow-hidden border-0">
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
                  className="bg-white text-red-600 hover:bg-gray-100 font-bold"
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
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
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
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-600" />
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
                    <div className={`w-12 h-12 ${item.color} rounded-xl flex items-center justify-center`}>
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
                          <p className="font-bold text-slate-800">#{customer._id}</p>
                          <p className="text-xs text-gray-500">{customer.purchase_count} compras</p>
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
