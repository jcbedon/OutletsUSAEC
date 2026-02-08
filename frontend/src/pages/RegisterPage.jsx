import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/App";
import { registerUser } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Lock, Phone, Globe, Mail, Tag, Building } from "lucide-react";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    tenant_slug: searchParams.get("tenant") || "",
    name: "",
    country: "",
    whatsapp: "",
    email: "",
    password: "",
    referral_code: searchParams.get("ref") || "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.tenant_slug.trim()) {
      toast.error("Ingresa el código del negocio");
      return;
    }
    setLoading(true);
    try {
      const response = await registerUser(formData);
      const userData = response.data;
      login(userData);
      toast.success(`Bienvenido, ${userData.name}! Tu ID: #${userData.customer_id}`);
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al registrarse");
    } finally {
      setLoading(false);
    }
  };

  const set = (key, val) => setFormData({ ...formData, [key]: val });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-lg font-bold text-slate-800">Registro de Cliente</h1>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0 rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-red-600 to-red-700 text-white text-center pb-6 pt-6">
            <CardTitle className="text-2xl font-extrabold">Crear Cuenta</CardTitle>
            <CardDescription className="text-red-100">
              Ingresa el código de tu negocio para registrarte
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-700 font-medium">Código del Negocio</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    data-testid="register-tenant-slug"
                    placeholder="ej: outlets-usa"
                    className="pl-10 h-12 rounded-xl bg-gray-50"
                    value={formData.tenant_slug}
                    onChange={(e) => set("tenant_slug", e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700 font-medium">Nombre Completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input data-testid="register-name" placeholder="Tu nombre" className="pl-10 h-12 rounded-xl bg-gray-50"
                    value={formData.name} onChange={(e) => set("name", e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700 font-medium">País</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input data-testid="register-country" placeholder="Ecuador, Colombia..." className="pl-10 h-12 rounded-xl bg-gray-50"
                    value={formData.country} onChange={(e) => set("country", e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700 font-medium">WhatsApp</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input data-testid="register-whatsapp" placeholder="+593..." className="pl-10 h-12 rounded-xl bg-gray-50"
                    value={formData.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700 font-medium">Email (opcional)</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input data-testid="register-email" type="email" placeholder="tu@email.com" className="pl-10 h-12 rounded-xl bg-gray-50"
                    value={formData.email} onChange={(e) => set("email", e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700 font-medium">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input data-testid="register-password" type="password" placeholder="Contraseña" className="pl-10 h-12 rounded-xl bg-gray-50"
                    value={formData.password} onChange={(e) => set("password", e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700 font-medium">Código de Referido (opcional)</Label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input data-testid="register-referral" placeholder="Ej: J4582" className="pl-10 h-12 rounded-xl bg-gray-50"
                    value={formData.referral_code} onChange={(e) => set("referral_code", e.target.value)} />
                </div>
              </div>

              <Button type="submit" data-testid="register-submit-btn"
                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 active:scale-95"
                disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                    Registrando...
                  </span>
                ) : "Crear Cuenta"}
              </Button>
            </form>

            <p className="text-sm text-gray-500 text-center mt-4">
              ¿Ya tienes cuenta?{" "}
              <Link to="/login" className="text-red-600 font-semibold hover:underline">Ingresar</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
