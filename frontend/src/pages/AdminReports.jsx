import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import {
  getReportsSummary, getLives, getLiveReport,
  getClientsPurchasesReport, getAllPurchasesReport
} from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, DollarSign, Users, TrendingUp, Radio,
  FileSpreadsheet, FileText, Download, ChevronDown, ChevronUp
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "N/A";
const fmtMoney = (n) => "$" + (n || 0).toFixed(2);

function doExportPDF(title, subtitle, headers, rows, filename) {
  const doc = new jsPDF({ orientation: rows[0] && rows[0].length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.text(subtitle + " - " + new Date().toLocaleDateString("es-ES"), 14, 25);
  autoTable(doc, {
    startY: 30, head: [headers], body: rows,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
  });
  doc.save(filename);
  toast.success("PDF exportado");
}

function doExportXLS(title, headers, rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
  XLSX.writeFile(wb, filename);
  toast.success("Excel exportado");
}

function ExportBtns({ onPdf, onXls, pdfId, xlsId }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={onPdf} className="rounded-lg" data-testid={pdfId}>
        <FileText className="h-4 w-4 mr-1 text-red-600" /> PDF
      </Button>
      <Button variant="outline" size="sm" onClick={onXls} className="rounded-lg" data-testid={xlsId}>
        <FileSpreadsheet className="h-4 w-4 mr-1 text-green-600" /> Excel
      </Button>
    </div>
  );
}

function PurchaseTable({ purchases, showClient, showLive }) {
  const totP = purchases.reduce((s, p) => s + (p.price || 0), 0);
  const totT = purchases.reduce((s, p) => s + (p.tax || 0), 0);
  const totC = purchases.reduce((s, p) => s + (p.commission || 0), 0);
  const totA = purchases.reduce((s, p) => s + (p.total || 0), 0);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-gray-50">
          {showClient && <th className="text-left p-2 font-semibold text-gray-600">Cliente</th>}
          <th className="text-left p-2 font-semibold text-gray-600">Producto</th>
          <th className="text-left p-2 font-semibold text-gray-600">Tienda</th>
          <th className="text-right p-2 font-semibold text-gray-600">Precio</th>
          <th className="text-right p-2 font-semibold text-gray-600">Tax</th>
          <th className="text-right p-2 font-semibold text-gray-600">Comisión</th>
          <th className="text-right p-2 font-semibold text-gray-600">Total</th>
          {showLive && <th className="text-left p-2 font-semibold text-gray-600">Live</th>}
          <th className="text-right p-2 font-semibold text-gray-600">Fecha</th>
        </tr>
      </thead>
      <tbody>
        {purchases.map((p, i) => (
          <tr key={i} className="border-b hover:bg-gray-50">
            {showClient && <td className="p-2 font-medium">#{p.customer_id}</td>}
            <td className="p-2">{p.item_name}</td>
            <td className="p-2">{p.store}</td>
            <td className="p-2 text-right">{fmtMoney(p.price)}</td>
            <td className="p-2 text-right text-gray-500">{fmtMoney(p.tax)}</td>
            <td className="p-2 text-right text-yellow-600">{fmtMoney(p.commission)}</td>
            <td className="p-2 text-right font-bold">{fmtMoney(p.total)}</td>
            {showLive && <td className="p-2 text-xs">{p.live_title || "N/A"}</td>}
            <td className="p-2 text-right text-xs text-gray-500">{fmtDate(p.created_at)}</td>
          </tr>
        ))}
        <tr className="bg-gray-50 font-bold">
          <td className="p-2" colSpan={showClient ? 3 : 2}>TOTALES</td>
          <td className="p-2 text-right">{fmtMoney(totP)}</td>
          <td className="p-2 text-right">{fmtMoney(totT)}</td>
          <td className="p-2 text-right text-yellow-600">{fmtMoney(totC)}</td>
          <td className="p-2 text-right">{fmtMoney(totA)}</td>
          {showLive && <td></td>}
          <td></td>
        </tr>
      </tbody>
    </table>
  );
}

function ClientRow({ cr, isExpanded, onToggle, onExport }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-bold text-red-600 border-red-200">
              #{cr.client.customer_id}
            </Badge>
            <div>
              <p className="font-bold text-slate-800">{cr.client.name}</p>
              <p className="text-xs text-gray-500">{cr.client.whatsapp}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-500">{cr.purchase_count} compras</p>
              <p className="font-bold text-green-600">{fmtMoney(cr.total_spent)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Comisiones</p>
              <p className="font-bold text-yellow-600">{fmtMoney(cr.total_commission)}</p>
            </div>
            {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
          </div>
        </div>
        {isExpanded && (
          <div className="mt-4 border-t pt-4">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-gray-600">Detalle ({cr.purchases.length})</p>
              <ExportBtns
                onPdf={() => onExport(cr.client, "pdf")}
                onXls={() => onExport(cr.client, "xls")}
                pdfId={"export-client-pdf-" + cr.client.customer_id}
                xlsId={"export-client-xls-" + cr.client.customer_id}
              />
            </div>
            {cr.purchases.length > 0 ? (
              <PurchaseTable purchases={cr.purchases} showClient={false} showLive={false} />
            ) : (
              <p className="text-center text-gray-400 py-4">Sin compras</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminReports() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const logoUrl = user?.tenant_logo || "";
  const tenantName = user?.tenant_name || "Outlets USA EC";
  const [summary, setSummary] = useState(null);
  const [lives, setLives] = useState([]);
  const [selectedLiveId, setSelectedLiveId] = useState(null);
  const [liveReport, setLiveReport] = useState(null);
  const [clientsReport, setClientsReport] = useState([]);
  const [allPurchases, setAllPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState(null);
  const [activeTab, setActiveTab] = useState("resumen");

  useEffect(() => {
    Promise.all([getReportsSummary(), getLives()])
      .then(([r1, r2]) => { setSummary(r1.data); setLives(r2.data); })
      .catch(() => toast.error("Error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedLiveId) {
      getLiveReport(selectedLiveId).then(r => setLiveReport(r.data)).catch(() => {});
    }
  }, [selectedLiveId]);

  const handleTab = (tab) => {
    setActiveTab(tab);
    if (tab === "clientes" && clientsReport.length === 0) {
      getClientsPurchasesReport().then(r => setClientsReport(r.data)).catch(() => toast.error("Error"));
    }
    if (tab === "compras" && allPurchases.length === 0) {
      getAllPurchasesReport().then(r => setAllPurchases(r.data)).catch(() => toast.error("Error"));
    }
  };

  const exportLive = useCallback((type) => {
    if (!liveReport?.purchases?.length) return;
    const t = "Reporte Live - " + (liveReport.live?.title || "");
    const h = ["Cliente", "Producto", "Tienda", "Precio", "Tax", "Comisión", "Total", "Fecha"];
    const r = liveReport.purchases.map(p => [p.customer_id, p.item_name, p.store, fmtMoney(p.price), fmtMoney(p.tax), fmtMoney(p.commission), fmtMoney(p.total), fmtDate(p.created_at)]);
    r.push(["TOTALES", "", "", fmtMoney(liveReport.total_sales), "", fmtMoney(liveReport.total_commissions), "", ""]);
    if (type === "pdf") doExportPDF(t, tenantName, h, r, "reporte_live.pdf");
    else doExportXLS(t, h, r, "reporte_live.xlsx");
  }, [liveReport, tenantName]);

  const exportClient = useCallback((client, type) => {
    const data = clientsReport.find(c => c.client.id === client.id);
    if (!data?.purchases?.length) return;
    const t = "Compras - " + data.client.name;
    const h = ["Producto", "Tienda", "Precio", "Tax", "Comisión", "Total", "Fecha"];
    const r = data.purchases.map(p => [p.item_name, p.store, fmtMoney(p.price), fmtMoney(p.tax), fmtMoney(p.commission), fmtMoney(p.total), fmtDate(p.created_at)]);
    r.push(["TOTALES", "", fmtMoney(data.total_spent - data.total_commission), "", fmtMoney(data.total_commission), fmtMoney(data.total_spent), ""]);
    if (type === "pdf") doExportPDF(t, tenantName, h, r, "compras_" + data.client.customer_id + ".pdf");
    else doExportXLS(t, h, r, "compras_" + data.client.customer_id + ".xlsx");
  }, [clientsReport, tenantName]);

  const exportClientsResumen = useCallback((type) => {
    if (!clientsReport.length) return;
    const h = ["ID", "Nombre", "WhatsApp", "País", "Comisión", "Compras", "Total", "Comisiones", "Saldo"];
    const r = clientsReport.map(c => [c.client.customer_id, c.client.name, c.client.whatsapp, c.client.country, fmtMoney(c.client.commission_fee), c.purchase_count, fmtMoney(c.total_spent), fmtMoney(c.total_commission), fmtMoney(c.wallet_balance)]);
    if (type === "pdf") doExportPDF("Reporte Clientes", tenantName, h, r, "reporte_clientes.pdf");
    else doExportXLS("Reporte Clientes", h, r, "reporte_clientes.xlsx");
  }, [clientsReport, tenantName]);

  const exportAll = useCallback((type) => {
    if (!allPurchases.length) return;
    const h = ["Cliente", "ID", "Producto", "Tienda", "Precio", "Tax", "Comisión", "Total", "Live", "Fecha"];
    const r = allPurchases.map(p => [p.client_name, p.customer_id, p.item_name, p.store, fmtMoney(p.price), fmtMoney(p.tax), fmtMoney(p.commission), fmtMoney(p.total), p.live_title, fmtDate(p.created_at)]);
    const tP = allPurchases.reduce((s, p) => s + (p.price || 0), 0);
    const tC = allPurchases.reduce((s, p) => s + (p.commission || 0), 0);
    const tT = allPurchases.reduce((s, p) => s + (p.total || 0), 0);
    r.push(["TOTALES", "", "", "", fmtMoney(tP), "", fmtMoney(tC), fmtMoney(tT), "", ""]);
    if (type === "pdf") doExportPDF("Todas las Compras", tenantName, h, r, "todas_compras.pdf");
    else doExportXLS("Todas Compras", h, r, "todas_compras.xlsx");
  }, [allPurchases, tenantName]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {logoUrl && (
            <div className="bg-white rounded-lg p-1">
              <img src={logoUrl} alt="Logo" className="h-10 object-contain logo-transparent" />
            </div>
          )}
          <span className="font-bold text-slate-800 flex-1">Reportes</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <SummaryCards summary={summary} />

        <Tabs value={activeTab} onValueChange={handleTab}>
          <TabsList className="w-full grid grid-cols-3 rounded-xl h-11 mb-4">
            <TabsTrigger value="resumen" className="rounded-lg">Por Live</TabsTrigger>
            <TabsTrigger value="clientes" className="rounded-lg">Por Cliente</TabsTrigger>
            <TabsTrigger value="compras" className="rounded-lg">Todas</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen">
            <LiveTab lives={lives} liveReport={liveReport} onSelectLive={setSelectedLiveId} onExport={exportLive} />
          </TabsContent>

          <TabsContent value="clientes">
            <div className="flex justify-end gap-2 mb-4">
              <ExportBtns onPdf={() => exportClientsResumen("pdf")} onXls={() => exportClientsResumen("xls")} pdfId="export-clients-pdf" xlsId="export-clients-xls" />
            </div>
            <ScrollArea className="h-[calc(100vh-380px)]">
              <div className="space-y-3">
                {clientsReport.map((cr) => (
                  <ClientRow key={cr.client.id} cr={cr}
                    isExpanded={expandedClient === cr.client.id}
                    onToggle={() => setExpandedClient(expandedClient === cr.client.id ? null : cr.client.id)}
                    onExport={exportClient} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="compras">
            <Card className="rounded-xl">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="font-bold text-slate-800">{allPurchases.length} compras</p>
                  <ExportBtns onPdf={() => exportAll("pdf")} onXls={() => exportAll("xls")} pdfId="export-all-pdf" xlsId="export-all-xls" />
                </div>
                <ScrollArea className="max-h-[500px]">
                  {allPurchases.length > 0 ? (
                    <PurchaseTable purchases={allPurchases} showClient={true} showLive={true} />
                  ) : (
                    <p className="text-center py-12 text-gray-400">Cargando...</p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SummaryCards({ summary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <DollarSign className="h-5 w-5 text-green-600 mb-1" />
          <p className="text-2xl font-extrabold">{fmtMoney(summary?.total_sales)}</p>
          <p className="text-xs text-gray-500">Ventas</p>
        </CardContent>
      </Card>
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <TrendingUp className="h-5 w-5 text-yellow-600 mb-1" />
          <p className="text-2xl font-extrabold">{fmtMoney(summary?.total_commissions)}</p>
          <p className="text-xs text-gray-500">Comisiones</p>
        </CardContent>
      </Card>
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <Users className="h-5 w-5 text-blue-600 mb-1" />
          <p className="text-2xl font-extrabold">{summary?.client_count || 0}</p>
          <p className="text-xs text-gray-500">Clientes</p>
        </CardContent>
      </Card>
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <Radio className="h-5 w-5 text-red-600 mb-1" />
          <p className="text-2xl font-extrabold">{summary?.live_count || 0}</p>
          <p className="text-xs text-gray-500">Lives</p>
        </CardContent>
      </Card>
    </div>
  );
}

function LiveTab({ lives, liveReport, onSelectLive, onExport }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <Select onValueChange={onSelectLive}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Seleccionar Live" />
              </SelectTrigger>
              <SelectContent>
                {lives.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {liveReport?.purchases?.length > 0 && (
            <ExportBtns onPdf={() => onExport("pdf")} onXls={() => onExport("xls")} pdfId="export-live-pdf" xlsId="export-live-xls" />
          )}
        </div>
        {!liveReport ? (
          <div className="text-center py-12 text-gray-400">
            <Radio className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Selecciona un Live</p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Ventas</p>
                <p className="text-lg font-bold text-green-600">{fmtMoney(liveReport.total_sales)}</p>
              </div>
              <div className="bg-yellow-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Comisiones</p>
                <p className="text-lg font-bold text-yellow-600">{fmtMoney(liveReport.total_commissions)}</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Compras</p>
                <p className="text-lg font-bold text-blue-600">{liveReport.purchase_count}</p>
              </div>
            </div>
            <ScrollArea className="max-h-[400px]">
              <PurchaseTable purchases={liveReport.purchases || []} showClient={true} showLive={false} />
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
