import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Loader2, Filter } from "lucide-react";
import { getClientReport } from "@/lib/api";
import { generateClientReportPDF } from "@/lib/clientReportPDF";

export default function ClientReportGenerator({ tenantName }) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("all");
  const [minInactivity, setMinInactivity] = useState("");
  const [stagnantOnly, setStagnantOnly] = useState(false);
  const [stagnantDays, setStagnantDays] = useState("15");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const buildFiltersLabel = () => {
    const parts = [];
    parts.push(status === "active" ? "Activos" : status === "inactive" ? "Inactivos" : "Todos");
    if (minInactivity) parts.push(`Inact. ≥ ${minInactivity}d`);
    if (stagnantOnly) parts.push(`Estancada ≥ ${stagnantDays || 15}d`);
    if (dateFrom || dateTo) parts.push(`Compra ${dateFrom || "…"} → ${dateTo || "…"}`);
    return parts.join(" · ");
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const params = {};
      if (status !== "all") params.status = status;
      if (minInactivity) params.min_inactivity_days = Number(minInactivity);
      if (stagnantOnly) {
        params.stagnant_only = true;
        params.stagnant_days = Number(stagnantDays) || 15;
      }
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await getClientReport(params);
      const { clients, totals } = res.data;
      if (!clients || clients.length === 0) {
        toast.error("Ningún cliente coincide con los filtros seleccionados");
        setGenerating(false);
        return;
      }
      generateClientReportPDF({
        tenantName,
        filtersLabel: buildFiltersLabel(),
        clients,
        totals,
      });
      toast.success(`Reporte generado (${clients.length} clientes)`);
      setOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al generar el reporte");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white gap-2 font-semibold shadow-sm"
          data-testid="open-client-report-btn"
        >
          <FileText className="h-4 w-4" />
          Generar Reporte PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-indigo-600" />
            Reporte de Clientes
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            Filtra los clientes y genera un PDF con nombre, WhatsApp, última compra, saldo pendiente y antigüedad de mercadería.
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs font-semibold text-slate-700">Estado del cliente</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10 rounded-lg mt-1" data-testid="report-status-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">Días de inactividad (mínimo)</Label>
            <Input
              type="number"
              min="0"
              value={minInactivity}
              onChange={(e) => setMinInactivity(e.target.value)}
              placeholder="Ej: 30 (sin compras en 30+ días)"
              className="h-10 rounded-lg mt-1"
              data-testid="report-inactivity-input"
            />
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stagnantOnly}
                onChange={(e) => setStagnantOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-amber-600"
                data-testid="report-stagnant-checkbox"
              />
              <span className="text-sm font-semibold text-amber-800">Solo mercadería estancada</span>
            </label>
            {stagnantOnly && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-amber-700">Antigüedad mínima:</span>
                <Input
                  type="number"
                  min="1"
                  value={stagnantDays}
                  onChange={(e) => setStagnantDays(e.target.value)}
                  className="h-8 w-24 rounded-lg"
                  data-testid="report-stagnant-days-input"
                />
                <span className="text-xs text-amber-700">días sin facturar</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Compra desde</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 rounded-lg mt-1"
                data-testid="report-date-from"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Compra hasta</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 rounded-lg mt-1"
                data-testid="report-date-to"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-3">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={generating}>
            Cancelar
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
            data-testid="generate-report-btn"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {generating ? "Generando..." : "Generar PDF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
