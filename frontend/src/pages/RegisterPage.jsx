import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/App";
import { registerUser, loginUser } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Phone, Mail, Lock, Globe, UserPlus, Gift } from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";

const COUNTRIES = [
  "Ecuador", "Colombia", "Perú", "México", "Argentina", "Chile", 
  "Venezuela", "Bolivia", "Paraguay", "Uruguay", "Panamá", "Costa Rica"
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    country: "",
    whatsapp: "",
    email: "",
    password: "",
    confirmPassword: "",
    whatsapp_consent: false,
    referral_code: "",
  });

  // Get referral code from URL if present
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      setFormData(prev => ({ ...prev, referral_code: refCode.toUpperCase() }));
      toast.success(`¡Código de referido ${refCode.toUpperCase()} aplicado!`);
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    if (!formData.whatsapp_consent) {
      toast.error("Debes aceptar recibir notificaciones por WhatsApp");
      return;
    }

    setLoading(true);

    try {
      const { confirmPassword, ...registerData } = formData;
      const response = await registerUser(registerData);
      
      toast.success(`¡Registro exitoso! Tu ID de cliente es #${response.data.customer_id}`);
      
      // Auto login
      const loginResponse = await loginUser({
        identifier: formData.whatsapp,
        password: formData.password,
      });
      
      login(loginResponse.data);
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al registrarse");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-center">
          <div className="bg-white rounded-xl p-3">
            <img src={LOGO_URL} alt="Outlets USA EC" className="h-16 object-contain logo-transparent" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4 py-8">
        <Card className="w-full max-w-md shadow-xl border-0 rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-red-600 to-red-700 text-white text-center pb-6 pt-6">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-8 h-8" />
            </div>
            <CardTitle className="text-2xl font-extrabold">Crear Cuenta</CardTitle>
            <CardDescription className="text-red-100">
              Únete a las compras en vivo desde USA
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-700 font-medium">
                  Nombre Completo *
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="name"
                    data-testid="register-name-input"
                    type="text"
                    placeholder="Tu nombre"
                    className="pl-10 h-12 rounded-xl bg-gray-50 border-gray-200"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Country */}
              <div className="space-y-2">
                <Label className="text-slate-700 font-medium">País *</Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => setFormData({ ...formData, country: value })}
                  required
                >
                  <SelectTrigger 
                    data-testid="register-country-select" 
                    className="h-12 rounded-xl bg-gray-50 border-gray-200"
                  >
                    <Globe className="h-5 w-5 text-gray-400 mr-2" />
                    <SelectValue placeholder="Selecciona tu país" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* WhatsApp */}
              <div className="space-y-2">
                <Label htmlFor="whatsapp" className="text-slate-700 font-medium">
                  WhatsApp * (con código de país)
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="whatsapp"
                    data-testid="register-whatsapp-input"
                    type="tel"
                    inputMode="tel"
                    placeholder="+593 999 999 999"
                    className="pl-10 h-12 rounded-xl bg-gray-50 border-gray-200"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium">
                  Email (opcional)
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="email"
                    data-testid="register-email-input"
                    type="email"
                    inputMode="email"
                    placeholder="tu@email.com"
                    className="pl-10 h-12 rounded-xl bg-gray-50 border-gray-200"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">
                  Contraseña *
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="password"
                    data-testid="register-password-input"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    className="pl-10 h-12 rounded-xl bg-gray-50 border-gray-200"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={6}
                  />
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-700 font-medium">
                  Confirmar Contraseña *
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    data-testid="register-confirm-password-input"
                    type="password"
                    placeholder="Repite tu contraseña"
                    className="pl-10 h-12 rounded-xl bg-gray-50 border-gray-200"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* WhatsApp Consent */}
              <div className="flex items-start space-x-3 p-4 bg-red-50 rounded-xl border border-red-100">
                <Checkbox
                  id="whatsapp_consent"
                  data-testid="register-consent-checkbox"
                  checked={formData.whatsapp_consent}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, whatsapp_consent: checked })
                  }
                  className="mt-0.5"
                />
                <Label htmlFor="whatsapp_consent" className="text-sm text-slate-600 leading-tight cursor-pointer">
                  Acepto recibir notificaciones por WhatsApp sobre mis compras, 
                  saldo de wallet y estado de envíos. *
                </Label>
              </div>

              {/* Referral Code */}
              <div className="space-y-2">
                <Label htmlFor="referral_code" className="text-slate-700 font-medium">
                  Código de Referido (opcional)
                </Label>
                <div className="relative">
                  <Gift className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
                  <Input
                    id="referral_code"
                    data-testid="register-referral-input"
                    type="text"
                    placeholder="Ej: J4582"
                    className="pl-10 h-12 rounded-xl bg-green-50 border-green-200 uppercase"
                    value={formData.referral_code}
                    onChange={(e) => setFormData({ ...formData, referral_code: e.target.value.toUpperCase() })}
                  />
                </div>
                {formData.referral_code && (
                  <p className="text-xs text-green-600 font-medium">
                    ¡Ambos ganarán saldo al registrarte!
                  </p>
                )}
              </div>

              <Button
                type="submit"
                data-testid="register-submit-btn"
                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 transition-all active:scale-95 mt-6"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                    Creando cuenta...
                  </span>
                ) : (
                  "Crear Cuenta"
                )}
              </Button>
            </form>

            <div className="text-center mt-6">
              <p className="text-sm text-gray-500">
                ¿Ya tienes cuenta?{" "}
                <Link to="/login" className="text-red-600 font-semibold hover:underline">
                  Inicia sesión
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
