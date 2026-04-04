import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, getEmployeeDetail } from "@/lib/api";
import { toast } from "sonner";
import { Users, Plus, Edit, Trash2, Eye, EyeOff, Shield, UserCheck, UserX } from "lucide-react";

const PERMISSIONS = [
  { key: "manage_clients", label: "Gestionar Clientes", description: "Crear, editar y eliminar clientes" },
  { key: "manage_purchases", label: "Gestionar Compras", description: "Crear, editar y eliminar compras" },
  { key: "manage_lives", label: "Gestionar Lives", description: "Crear, iniciar y cerrar sesiones live" },
  { key: "approve_recharges", label: "Aprobar Recargas", description: "Aprobar o rechazar solicitudes de recarga" },
  { key: "manage_shipments", label: "Gestionar Envíos", description: "Crear y administrar envíos" },
  { key: "manage_invoices", label: "Gestionar Facturas", description: "Generar y aprobar facturas" },
  { key: "view_reports", label: "Ver Reportes", description: "Acceder a los reportes del sistema" },
  { key: "adjust_wallet", label: "Ajustar Saldos", description: "Realizar ajustes de saldo en wallets" },
  { key: "view_statistics", label: "Ver Estadísticas", description: "Acceder al panel de estadísticas" }
];

export default function AdminEmployees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [showPassword, setShowPassword] = useState({});
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    whatsapp: "",
    password: "",
    permissions: {},
    status: "active"
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const response = await getEmployees();
      setEmployees(response.data);
    } catch (error) {
      toast.error("Error al cargar empleados");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (employee = null) => {
    if (employee) {
      setEditingEmployee(employee);
      setFormData({
        name: employee.name,
        email: employee.email,
        whatsapp: employee.whatsapp || "",
        password: employee.password_plain || "",
        permissions: employee.permissions || {},
        status: employee.status
      });
    } else {
      setEditingEmployee(null);
      setFormData({
        name: "",
        email: "",
        whatsapp: "",
        password: "",
        permissions: {},
        status: "active"
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.email) {
      toast.error("Nombre y email son requeridos");
      return;
    }
    if (!editingEmployee && !formData.password) {
      toast.error("La contraseña es requerida para nuevos empleados");
      return;
    }

    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, formData);
        toast.success("Empleado actualizado");
      } else {
        await createEmployee(formData);
        toast.success("Empleado creado");
      }
      setDialogOpen(false);
      loadEmployees();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al guardar empleado");
    }
  };

  const handleDelete = async (employee) => {
    if (!confirm(`¿Eliminar a ${employee.name}?`)) return;
    try {
      await deleteEmployee(employee.id);
      toast.success("Empleado eliminado");
      loadEmployees();
    } catch (error) {
      toast.error("Error al eliminar empleado");
    }
  };

  const handleToggleStatus = async (employee) => {
    const newStatus = employee.status === "active" ? "inactive" : "active";
    try {
      await updateEmployee(employee.id, { status: newStatus });
      toast.success(`Empleado ${newStatus === "active" ? "activado" : "desactivado"}`);
      loadEmployees();
    } catch (error) {
      toast.error("Error al cambiar estado");
    }
  };

  const toggleShowPassword = (id) => {
    setShowPassword(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePermissionChange = (key, checked) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: checked
      }
    }));
  };

  const countActivePermissions = (permissions) => {
    return Object.values(permissions || {}).filter(Boolean).length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Empleados</h1>
          <p className="text-slate-500">Gestiona los empleados y sus permisos</p>
        </div>
        <Button onClick={() => handleOpenDialog()} data-testid="add-employee-btn">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Empleado
        </Button>
      </div>

      {employees.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No hay empleados registrados</p>
            <Button className="mt-4" onClick={() => handleOpenDialog()}>
              Crear primer empleado
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {employees.map((employee) => (
            <Card key={employee.id} className={employee.status === "inactive" ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${employee.status === "active" ? "bg-green-100" : "bg-slate-100"}`}>
                      {employee.status === "active" ? (
                        <UserCheck className="h-5 w-5 text-green-600" />
                      ) : (
                        <UserX className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{employee.name}</CardTitle>
                      <p className="text-sm text-slate-500">{employee.email}</p>
                    </div>
                  </div>
                  <Badge variant={employee.status === "active" ? "default" : "secondary"}>
                    {employee.status === "active" ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {employee.whatsapp && (
                  <p className="text-sm text-slate-600">WhatsApp: {employee.whatsapp}</p>
                )}
                
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Contraseña:</span>
                  <code className="bg-slate-100 px-2 py-1 rounded text-sm font-mono">
                    {showPassword[employee.id] ? employee.password_plain : "••••••••"}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleShowPassword(employee.id)}
                  >
                    {showPassword[employee.id] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-600">
                    {countActivePermissions(employee.permissions)} permisos activos
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={employee.status === "active"}
                      onCheckedChange={() => handleToggleStatus(employee)}
                    />
                    <span className="text-sm text-slate-500">
                      {employee.status === "active" ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDialog(employee)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(employee)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editingEmployee ? "Editar Empleado" : "Nuevo Empleado"}
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Nombre completo"
                    data-testid="employee-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="email@ejemplo.com"
                    data-testid="employee-email-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>WhatsApp</Label>
                  <Input
                    value={formData.whatsapp}
                    onChange={(e) => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
                    placeholder="+593999999999"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contraseña {!editingEmployee && "*"}</Label>
                  <div className="relative">
                    <Input
                      type={showPassword.form ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder={editingEmployee ? "Dejar vacío para mantener" : "Contraseña"}
                      data-testid="employee-password-input"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={() => setShowPassword(prev => ({ ...prev, form: !prev.form }))}
                    >
                      {showPassword.form ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-base font-semibold">Permisos</Label>
                <div className="grid gap-3">
                  {PERMISSIONS.map((perm) => (
                    <div
                      key={perm.key}
                      className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                    >
                      <Checkbox
                        id={perm.key}
                        checked={formData.permissions[perm.key] || false}
                        onCheckedChange={(checked) => handlePermissionChange(perm.key, checked)}
                        data-testid={`permission-${perm.key}`}
                      />
                      <div className="flex-1">
                        <Label htmlFor={perm.key} className="font-medium cursor-pointer">
                          {perm.label}
                        </Label>
                        <p className="text-sm text-slate-500">{perm.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} data-testid="save-employee-btn">
              {editingEmployee ? "Guardar Cambios" : "Crear Empleado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
