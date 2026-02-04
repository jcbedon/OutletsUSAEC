import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/App";
import { loginUser, seedAdmin } from "@/lib/api";
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
  const [formData, setFormData] = useState({
    identifier: "",
    password: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await loginUser(formData);
      const userData = response.data;
      
      login(userData);
      toast.success(`¡Bienvenido, ${userData.name}!`);
      
      if (userData.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleSeedAdmin = async () => {
    try {
      const response = await seedAdmin();
      toast.success(`Admin creado: ${response.data.email} / ${response.data.password}`);
    } catch (error) {
      toast.info(error.response?.data?.message || "Admin ya existe");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-center">
          <img src={LOGO_URL} alt="Outlets USA EC" className="h-12 object-contain" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0 rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-red-600 to-red-700 text-white text-center pb-8 pt-6">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <CardTitle className="text-2xl font-extrabold">Iniciar Sesión</CardTitle>
            <CardDescription className="text-red-100">
              Ingresa con tu email, WhatsApp o ID de cliente
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
                    placeholder="Ej: J4582, +593..."
                    className="pl-10 h-12 rounded-xl bg-gray-50 border-gray-200 focus:ring-2 focus:ring-red-600/20"
                    value={formData.identifier}
                    onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="password"
                    data-testid="login-password-input"
                    type="password"
                    placeholder="Tu contraseña"
                    className="pl-10 h-12 rounded-xl bg-gray-50 border-gray-200 focus:ring-2 focus:ring-red-600/20"
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
                ) : (
                  "Ingresar"
                )}
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
                onClick={handleSeedAdmin}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Crear usuario Admin (demo)
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 text-center">
        <p className="text-xs text-gray-400">
          © 2024 Outlets USA EC - Compras en Vivo desde USA
        </p>
      </div>
    </div>
  );
}
