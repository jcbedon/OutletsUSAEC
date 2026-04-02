import { useState, useEffect } from "react";
import { useAuth } from "@/App";
import { useNavigate } from "react-router-dom";
import { listTenants, createTenant, updateTenantStatus, getSuperadminStats, updateTenantTaxOptionsSuperadmin } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building, Users, Shield, Plus, LogOut, Power, UserPlus, Settings, Percent, X } from "lucide-react";

export default function SuperadminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    business_name: "", slug: "", owner_name: "", email: "",
    admin_name: "", admin_email: "", admin_password: "", admin_whatsapp: "", admin_country: ""
  });
  
  // Tax options configuration state
  const [taxDialogOpen, setTaxDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [taxOptions, setTaxOptions] = useState([]);
  const [newTaxValue, setNewTaxValue] = useState("");
  const [newTaxLabel, setNewTaxLabel] = useState("");

  const DEFAULT_TAX_OPTIONS = [
    { value: "8.25", label: "8.25%" },
    { value: "10", label: "10%" },
    { value: "15", label: "15%" },
    { value: "0", label: "Sin Taxes" },
    { value: "other", label: "Otro" }
  ];

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [tenantsRes, statsRes] = await Promise.all([listTenants(), getSuperadminStats()]);
      setTenants(tenantsRes.data);
      setStats(statsRes.data);
    } catch (error) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async () => {
    if (!form.business_name || !form.slug || !form.admin_email || !form.admin_password) {
      toast.error("Completa los campos obligatorios");
      return;
    }
    setSubmitting(true);
    try {
      await createTenant(form);
      toast.success("Tenant y admin creados exitosamente");
      setDialogOpen(false);
      setForm({ business_name: "", slug: "", owner_name: "", email: "",
        admin_name: "", admin_email: "", admin_password: "", admin_whatsapp: "", admin_country: "" });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear tenant");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (tenantId, currentStatus) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    try {
      await updateTenantStatus(tenantId, newStatus);
      toast.success(`Tenant ${newStatus === "active" ? "activado" : "suspendido"}`);
      loadData();
    } catch (error) {
      toast.error("Error al actualizar estado");
    }
  };

  const handleLogout = () => { logout(); navigate("/login"); };
  const set = (key, val) => setForm({ ...form, [key]: val });

  const openTaxDialog = (tenant) => {
    setSelectedTenant(tenant);
    setTaxOptions(tenant.tax_options || DEFAULT_TAX_OPTIONS);
    setNewTaxValue("");
    setNewTaxLabel("");
    setTaxDialogOpen(true);
  };

  const handleAddTaxOption = () => {
    if (!newTaxValue || !newTaxLabel) {
      toast.error("Ingresa valor y etiqueta");
      return;
    }
    const otherIndex = taxOptions.findIndex(opt => opt.value === "other");
    const newOption = { value: newTaxValue, label: newTaxLabel };
    if (otherIndex >= 0) {
      const newOptions = [...taxOptions];
      newOptions.splice(otherIndex, 0, newOption);
      setTaxOptions(newOptions);
    } else {
      setTaxOptions([...taxOptions, newOption]);
    }
    setNewTaxValue("");
    setNewTaxLabel("");
  };

  const handleRemoveTaxOption = (index) => {
    const opt = taxOptions[index];
    if (opt.value === "0" || opt.value === "other") {
      toast.error("No se puede eliminar esta opción");
      return;
    }
    setTaxOptions(taxOptions.filter((_, i) => i !== index));
  };

  const handleSaveTaxOptions = async () => {
    if (!selectedTenant) return;
    try {
      await updateTenantTaxOptionsSuperadmin(selectedTenant.id, taxOptions);
      toast.success("Opciones de impuestos actualizadas");
      setTaxDialogOpen(false);
      loadData();
    } catch (error) {
      toast.error("Error al guardar");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="app-bg">
      <div className="sticky top-0 z-50" style={{ background: '#1E3A5F' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#2ECC71' }}>
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-sm">Panel Superadmin</p>
              <p className="text-xs text-slate-400">{user?.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-300 hover:text-white" data-testid="superadmin-logout-btn">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="rounded-xl" data-testid="stat-tenants">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(30,58,95,0.1)' }}>
                <Building className="h-5 w-5" style={{ color: '#1E3A5F' }} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-800">{stats?.tenant_count || 0}</p>
                <p className="text-xs text-gray-500">Tenants</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl" data-testid="stat-active-tenants">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(46,204,113,0.1)' }}>
                <Power className="h-5 w-5" style={{ color: '#2ECC71' }} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-800">{stats?.active_tenants || 0}</p>
                <p className="text-xs text-gray-500">Activos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl" data-testid="stat-admins">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(30,58,95,0.1)' }}>
                <UserPlus className="h-5 w-5" style={{ color: '#1E3A5F' }} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-800">{stats?.total_admins || 0}</p>
                <p className="text-xs text-gray-500">Admins</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl" data-testid="stat-total-clients">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(46,204,113,0.1)' }}>
                <Users className="h-5 w-5" style={{ color: '#2ECC71' }} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-800">{stats?.total_clients || 0}</p>
                <p className="text-xs text-gray-500">Clientes</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Negocios (Tenants)</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl" data-testid="create-tenant-btn" style={{ background: '#2ECC71', color: 'white' }}>
                <Plus className="h-4 w-4 mr-2" /> Nuevo Tenant
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crear Nuevo Tenant + Admin</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-sm font-semibold text-slate-600">Datos del Negocio</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nombre del Negocio *</Label>
                    <Input data-testid="tenant-business-name" placeholder="Mi Tienda" className="rounded-xl mt-1"
                      value={form.business_name} onChange={(e) => set("business_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Slug (URL) *</Label>
                    <Input data-testid="tenant-slug" placeholder="mi-tienda" className="rounded-xl mt-1"
                      value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Propietario</Label>
                    <Input placeholder="Nombre" className="rounded-xl mt-1" value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Email Negocio</Label>
                    <Input type="email" placeholder="contacto@..." className="rounded-xl mt-1" value={form.email} onChange={(e) => set("email", e.target.value)} />
                  </div>
                </div>

                <hr />
                <p className="text-sm font-semibold text-slate-600">Admin del Tenant</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nombre Admin *</Label>
                    <Input data-testid="tenant-admin-name" placeholder="Admin" className="rounded-xl mt-1"
                      value={form.admin_name} onChange={(e) => set("admin_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Email Admin *</Label>
                    <Input data-testid="tenant-admin-email" type="email" placeholder="admin@..." className="rounded-xl mt-1"
                      value={form.admin_email} onChange={(e) => set("admin_email", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Contraseña Admin *</Label>
                    <Input data-testid="tenant-admin-password" type="password" placeholder="******" className="rounded-xl mt-1"
                      value={form.admin_password} onChange={(e) => set("admin_password", e.target.value)} />
                  </div>
                  <div>
                    <Label>WhatsApp Admin</Label>
                    <Input placeholder="+593..." className="rounded-xl mt-1" value={form.admin_whatsapp} onChange={(e) => set("admin_whatsapp", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>País Admin</Label>
                  <Input placeholder="Ecuador" className="rounded-xl mt-1" value={form.admin_country} onChange={(e) => set("admin_country", e.target.value)} />
                </div>

                <Button onClick={handleCreateTenant} disabled={submitting} data-testid="submit-create-tenant-btn"
                  className="w-full h-12 font-bold rounded-xl" style={{ background: '#1E3A5F', color: 'white' }}>
                  {submitting ? "Creando..." : "Crear Tenant + Admin"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="h-[calc(100vh-360px)]">
          {tenants.length === 0 ? (
            <Card className="rounded-2xl border-dashed border-2 border-gray-200">
              <CardContent className="p-8 text-center">
                <Building className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No hay tenants creados</p>
                <p className="text-gray-400 text-sm mt-1">Crea el primer negocio para comenzar</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {tenants.map((tenant) => (
                <Card key={tenant.id} className="rounded-xl hover:shadow-md transition-shadow" data-testid="tenant-item">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-slate-800 text-lg">{tenant.business_name}</p>
                          <Badge className={tenant.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                            {tenant.status === "active" ? "Activo" : "Suspendido"}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500">Slug: <span className="font-mono font-medium" style={{ color: '#1E3A5F' }}>{tenant.slug}</span></p>
                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                          <span>{tenant.owner_name || "Sin propietario"}</span>
                          <span>{tenant.admin_count || 0} admins</span>
                          <span>{tenant.client_count || 0} clientes</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline" size="sm"
                          className="rounded-lg border-blue-200 text-blue-600 hover:bg-blue-50"
                          onClick={() => openTaxDialog(tenant)}
                          data-testid={`config-taxes-${tenant.id}`}
                        >
                          <Percent className="h-4 w-4 mr-1" />
                          Taxes
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          className={`rounded-lg ${tenant.status === "active" ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
                          onClick={() => handleToggleStatus(tenant.id, tenant.status)}
                          data-testid={`toggle-tenant-${tenant.id}`}
                        >
                          <Power className="h-4 w-4 mr-1" />
                          {tenant.status === "active" ? "Suspender" : "Activar"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Tax Options Configuration Dialog */}
        <Dialog open={taxDialogOpen} onOpenChange={setTaxDialogOpen}>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-blue-600" />
                Configurar Impuestos - {selectedTenant?.business_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-gray-500">
                Configura las opciones de impuestos que estarán disponibles para este Personal Shopper.
              </p>
              
              {/* Current tax options */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Opciones Actuales</Label>
                {taxOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-800">{opt.label}</Badge>
                      <span className="text-xs text-gray-500">valor: {opt.value}%</span>
                    </div>
                    {opt.value !== "0" && opt.value !== "other" && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemoveTaxOption(idx)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add new option */}
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold">Agregar Nueva Opción</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Valor (ej: 12.5)"
                    value={newTaxValue}
                    onChange={(e) => setNewTaxValue(e.target.value)}
                    className="w-28 rounded-lg"
                  />
                  <Input
                    placeholder="Etiqueta (ej: 12.5%)"
                    value={newTaxLabel}
                    onChange={(e) => setNewTaxLabel(e.target.value)}
                    className="flex-1 rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddTaxOption}
                    className="rounded-lg"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleSaveTaxOptions}
                className="w-full h-11 font-bold rounded-xl"
                style={{ background: '#1E3A5F', color: 'white' }}
              >
                Guardar Configuración
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
