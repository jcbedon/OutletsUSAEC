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
    name: "", country: "", whatsapp: "", email: "", password: "",
    referral_code: searchParams.get("ref") || "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.tenant_slug.trim()) { toast.error("Ingresa el código del negocio"); return; }
    setLoading(true);
    try {
      const response = await registerUser(formData);
      const userData = response.data;
      login(userData);
      toast.success(`Bienvenido, ${userData.name}! Tu ID: #${userData.customer_id}`);
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al registrarse");
    } finally { setLoading(false); }
  };

  const set = (key, val) => setFormData({ ...formData, [key]: val });
  const inputCls = "pl-10 h-12 rounded-xl border-gray-200";
  const inputStyle = { background: '#F2F4F7' };

  return (
    <div className="app-bg flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 rounded-2xl overflow-hidden card-glass">
        <CardHeader className="text-center pb-6 pt-6" style={{ background: '#1E3A5F' }}>
          <CardTitle className="text-2xl font-extrabold text-white">Crear Cuenta</CardTitle>
          <CardDescription className="text-blue-200">
            Ingresa el código de tu negocio para registrarte
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-medium" style={{ color: '#2B2B2B' }}>Código del Negocio</Label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6B7280' }} />
                <Input data-testid="register-tenant-slug" placeholder="ej: outlets-usa" className={inputCls} style={inputStyle}
                  value={formData.tenant_slug} onChange={(e) => set("tenant_slug", e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-medium" style={{ color: '#2B2B2B' }}>Nombre Completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6B7280' }} />
                <Input data-testid="register-name" placeholder="Tu nombre" className={inputCls} style={inputStyle}
                  value={formData.name} onChange={(e) => set("name", e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-medium" style={{ color: '#2B2B2B' }}>País</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6B7280' }} />
                <Input data-testid="register-country" placeholder="Ecuador, Colombia..." className={inputCls} style={inputStyle}
                  value={formData.country} onChange={(e) => set("country", e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-medium" style={{ color: '#2B2B2B' }}>WhatsApp</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6B7280' }} />
                <Input data-testid="register-whatsapp" placeholder="+593..." className={inputCls} style={inputStyle}
                  value={formData.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-medium" style={{ color: '#2B2B2B' }}>Email (opcional)</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6B7280' }} />
                <Input data-testid="register-email" type="email" placeholder="tu@email.com" className={inputCls} style={inputStyle}
                  value={formData.email} onChange={(e) => set("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-medium" style={{ color: '#2B2B2B' }}>Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6B7280' }} />
                <Input data-testid="register-password" type="password" placeholder="Contraseña" className={inputCls} style={inputStyle}
                  value={formData.password} onChange={(e) => set("password", e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-medium" style={{ color: '#2B2B2B' }}>Código de Referido (opcional)</Label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6B7280' }} />
                <Input data-testid="register-referral" placeholder="Ej: J4582" className={inputCls} style={inputStyle}
                  value={formData.referral_code} onChange={(e) => set("referral_code", e.target.value)} />
              </div>
            </div>
            <Button type="submit" data-testid="register-submit-btn"
              className="w-full h-12 font-bold rounded-xl shadow-lg active:scale-95"
              style={{ background: '#1E3A5F', color: 'white' }} disabled={loading}>
              {loading ? "Registrando..." : "Crear Cuenta"}
            </Button>
          </form>
          <p className="text-sm text-center mt-4" style={{ color: '#6B7280' }}>
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="font-semibold hover:underline" style={{ color: '#1E3A5F' }}>Ingresar</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
