import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getAuditLogs, getAuditUsers, getAuditActions } from "@/lib/api";
import { toast } from "sonner";
import { FileText, Search, User, Calendar, Filter, ChevronLeft, ChevronRight, Clock, Activity } from "lucide-react";

const ACTION_COLORS = {
  login: "bg-blue-100 text-blue-700",
  create_client: "bg-green-100 text-green-700",
  update_client: "bg-yellow-100 text-yellow-700",
  delete_client: "bg-red-100 text-red-700",
  create_purchase: "bg-green-100 text-green-700",
  update_purchase: "bg-yellow-100 text-yellow-700",
  delete_purchase: "bg-red-100 text-red-700",
  approve_recharge: "bg-emerald-100 text-emerald-700",
  reject_recharge: "bg-red-100 text-red-700",
  adjust_wallet: "bg-orange-100 text-orange-700",
  create_shipment: "bg-purple-100 text-purple-700",
  update_shipment: "bg-purple-100 text-purple-700",
  delete_shipment: "bg-red-100 text-red-700",
  create_invoice: "bg-indigo-100 text-indigo-700",
  approve_invoice: "bg-emerald-100 text-emerald-700",
  reopen_invoice: "bg-yellow-100 text-yellow-700",
  create_live: "bg-pink-100 text-pink-700",
  start_live: "bg-pink-100 text-pink-700",
  end_live: "bg-pink-100 text-pink-700",
  create_employee: "bg-cyan-100 text-cyan-700",
  update_employee: "bg-cyan-100 text-cyan-700",
  delete_employee: "bg-red-100 text-red-700"
};

export default function AdminAuditLog() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({
    user_id: "",
    action: "",
    start_date: "",
    end_date: ""
  });
  const limit = 20;

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [page, filters]);

  const loadInitialData = async () => {
    try {
      const [usersRes, actionsRes] = await Promise.all([
        getAuditUsers(),
        getAuditActions()
      ]);
      setUsers(usersRes.data);
      setActions(actionsRes.data);
    } catch (error) {
      console.error("Error loading initial data:", error);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = {
        limit,
        skip: page * limit,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== "" && v !== "all")
        )
      };
      const response = await getAuditLogs(params);
      setLogs(response.data.logs);
      setTotal(response.data.total);
    } catch (error) {
      toast.error("Error al cargar registros de auditoría");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(0);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const getActionLabel = (actionKey) => {
    const action = actions.find(a => a.value === actionKey);
    return action?.label || actionKey;
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Registro de Auditoría</h1>
        <p className="text-slate-500">Historial completo de acciones en el sistema</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Usuario</label>
              <Select
                value={filters.user_id}
                onValueChange={(value) => handleFilterChange("user_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los usuarios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los usuarios</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.user_name} ({user.user_role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Acción</label>
              <Select
                value={filters.action}
                onValueChange={(value) => handleFilterChange("action", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas las acciones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las acciones</SelectItem>
                  {actions.map((action) => (
                    <SelectItem key={action.value} value={action.value}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Desde</label>
              <Input
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange("start_date", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Hasta</label>
              <Input
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange("end_date", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Activity className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Registros</p>
                <p className="text-2xl font-bold text-slate-800">{total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <User className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Usuarios Activos</p>
                <p className="text-2xl font-bold text-slate-800">{users.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <FileText className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Página</p>
                <p className="text-2xl font-bold text-slate-800">{page + 1} de {totalPages || 1}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Logs List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Registros de Actividad
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>No hay registros de auditoría</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 bg-slate-50 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={ACTION_COLORS[log.action] || "bg-slate-100 text-slate-700"}>
                            {getActionLabel(log.action)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {log.user_role === "admin" ? "Admin" : "Empleado"}
                          </Badge>
                        </div>
                        
                        <p className="font-medium text-slate-800">
                          <span className="text-blue-600">{log.user_name}</span>
                          {" "}
                          <span className="text-slate-500 font-normal">realizó</span>
                          {" "}
                          {getActionLabel(log.action).toLowerCase()}
                          {log.entity_name && (
                            <>
                              {" "}
                              <span className="text-slate-500 font-normal">en</span>
                              {" "}
                              <span className="text-emerald-600">{log.entity_name}</span>
                            </>
                          )}
                        </p>

                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="mt-2 text-sm text-slate-500">
                            <details className="cursor-pointer">
                              <summary className="hover:text-slate-700">Ver detalles</summary>
                              <pre className="mt-2 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                      </div>
                      
                      <div className="text-right text-sm text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(log.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-slate-500">
                Mostrando {page * limit + 1} - {Math.min((page + 1) * limit, total)} de {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
