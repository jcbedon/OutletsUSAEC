import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/App";
import { loginUser, seedSuperadmin } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Lock, ShoppingBag } from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ identifier: "", password: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await loginUser(formData);
      const userData = response.data;
      login(userData);
      toast.success(`Bienvenido, ${userData.name}!`);
      if (userData.role === "superadmin") navigate("/superadmin");
      else if (userData.role === "admin") navigate("/admin");
      else navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleSeedSuperadmin = async () => {
    try {
      const response = await seedSuperadmin();
      toast.success(`Superadmin creado: ${response.data.email} / ${response.data.password}`);
    } catch (error) {
      toast.info(error.response?.data?.message || "Superadmin ya existe");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-center">
          <div className="bg-white rounded-xl p-3">
            <img src={LOGO_URL} alt="Outlets USA EC" className="h-16 object-contain logo-transparent" />
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0 rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-red-600 to-red-700 text-white text-center pb-8 pt-6">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <CardTitle className="text-2xl font-extrabold">Iniciar Sesión</CardTitle>
            <CardDescription className="text-red-100">
              Plataforma SaaS - Live Shopping
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-slate-700 font-medium">
                  Email, WhatsApp o ID de Cliente
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="identifier"
                    data-testid="login-identifier-input"
                    type="text"
                    placeholder="Ej: admin@email.com, J4582..."
                    className="pl-10 h-12 rounded-xl bg-gray-50 border-gray-200"
                    value={formData.identifier}
                    onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="password"
                    data-testid="login-password-input"
                    type="password"
                    placeholder="Tu contraseña"
                    className="pl-10 h-12 rounded-xl bg-gray-50 border-gray-200"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                data-testid="login-submit-btn"
                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 transition-all active:scale-95"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                    Ingresando...
                  </span>
                ) : "Ingresar"}
              </Button>
            </form>

            <div className="text-center space-y-3">
              <p className="text-sm text-gray-500">
                ¿No tienes cuenta?{" "}
                <Link to="/register" className="text-red-600 font-semibold hover:underline">
                  Regístrate aquí
                </Link>
              </p>
              <button
                onClick={handleSeedSuperadmin}
                data-testid="seed-superadmin-btn"
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Crear Superadmin (demo)
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white border-t border-gray-100 px-4 py-3 text-center">
        <p className="text-xs text-gray-400">
          Outlets USA EC - Plataforma SaaS de Compras en Vivo
        </p>
      </div>
    </div>
  );
}
