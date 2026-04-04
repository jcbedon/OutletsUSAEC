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
      else if (userData.role === "admin" || userData.role === "employee") navigate("/admin");
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
      toast.success(`Superadmin creado: ${response.data.email}`);
    } catch (error) {
      toast.info(error.response?.data?.message || "Superadmin ya existe");
    }
  };

  return (
    <div className="app-bg flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 rounded-2xl overflow-hidden card-glass">
        <CardHeader className="text-center pb-8 pt-8" style={{ background: '#1E3A5F' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(46,204,113,0.2)' }}>
            <ShoppingBag className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-extrabold text-white">Iniciar Sesión</CardTitle>
          <CardDescription className="text-blue-200">
            Plataforma de Gestión - Personal Shoppers
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier" className="font-medium" style={{ color: '#2B2B2B' }}>
                Email, WhatsApp o ID de Cliente
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6B7280' }} />
                <Input
                  id="identifier"
                  data-testid="login-identifier-input"
                  type="text"
                  placeholder="Ej: admin@email.com, J4582..."
                  className="pl-10 h-12 rounded-xl border-gray-200"
                  style={{ background: '#F2F4F7' }}
                  value={formData.identifier}
                  onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="font-medium" style={{ color: '#2B2B2B' }}>Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6B7280' }} />
                <Input
                  id="password"
                  data-testid="login-password-input"
                  type="password"
                  placeholder="Tu contraseña"
                  className="pl-10 h-12 rounded-xl border-gray-200"
                  style={{ background: '#F2F4F7' }}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              data-testid="login-submit-btn"
              className="w-full h-12 font-bold rounded-xl shadow-lg transition-all active:scale-95"
              style={{ background: '#1E3A5F', color: 'white' }}
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
            <p className="text-sm" style={{ color: '#6B7280' }}>
              ¿No tienes cuenta?{" "}
              <Link to="/register" className="font-semibold hover:underline" style={{ color: '#1E3A5F' }}>
                Regístrate aquí
              </Link>
            </p>
            <button
              onClick={handleSeedSuperadmin}
              data-testid="seed-superadmin-btn"
              className="text-xs underline" style={{ color: '#9CA3AF' }}
            >
              Crear Superadmin (demo)
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
