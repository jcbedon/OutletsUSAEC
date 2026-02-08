import { useState, useEffect } from "react";
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

export default function AdminReports() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const logoUrl = user?.tenant_logo || "https://customer-assets.emergentagent.com/job_compraenvivo/artifacts/qvyfsb43_WhatsApp%20Image%202026-02-03%20at%208.05.08%20PM.jpeg";
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
    const fetchData = async () => {
      try {
        const [res1, res2] = await Promise.all([getReportsSummary(), getLives()]);
        setSummary(res1.data);
        setLives(res2.data);
      } catch { toast.error("Error al cargar datos"); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedLiveId) {
      getLiveReport(selectedLiveId).then(res => setLiveReport(res.data)).catch(() => toast.error("Error"));
    }
  }, [selectedLiveId]);

  const loadClientsReport = async () => {
    if (clientsReport.length > 0) return;
    try {
      const res = await getClientsPurchasesReport();
      setClientsReport(res.data);
    } catch { toast.error("Error al cargar reporte"); }
  };

  const loadAllPurchases = async () => {
    if (allPurchases.length > 0) return;
    try {
      const res = await getAllPurchasesReport();
      setAllPurchases(res.data);
    } catch { toast.error("Error al cargar compras"); }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "clientes") loadClientsReport();
    if (tab === "compras") loadAllPurchases();
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "N/A";
  const fmtMoney = (n) => `$${(n || 0).toFixed(2)}`;

  // ===== EXPORT PDF =====
  const exportPDF = (title, headers, rows, filename) => {
    const doc = new jsPDF({ orientation: rows[0]?.length > 6 ? "landscape" : "portrait" });
    doc.setFontSize(16);
    doc.text(title, 14, 18);
    doc.setFontSize(9);
    doc.text(`${user?.tenant_name || "Outlets USA EC"} - ${new Date().toLocaleDateString("es-ES")}`, 14, 25);
    autoTable(doc, {
      startY: 30, head: [headers], body: rows,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });
    doc.save(filename);
    toast.success("PDF exportado");
  };

  // ===== EXPORT XLS =====
  const exportXLS = (title, headers, rows, filename) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
    XLSX.writeFile(wb, filename);
    toast.success("Excel exportado");
  };

  // === Export: Compras por Live ===
  const exportLiveReport = (type) => {
    if (!liveReport || !liveReport.purchases?.length) { toast.error("Sin datos"); return; }
    const title = `Reporte Live - ${liveReport.live?.title || ""}`;
    const headers = ["Cliente", "ID", "Producto", "Tienda", "Precio", "Tax", "Comisión", "Total", "Fecha"];
    const rows = liveReport.purchases.map(p => [
      p.customer_id, p.id?.slice(0, 8), p.item_name, p.store,
      fmtMoney(p.price), fmtMoney(p.tax), fmtMoney(p.commission), fmtMoney(p.total), fmtDate(p.created_at)
    ]);
    rows.push(["", "", "", "TOTALES", fmtMoney(liveReport.total_sales), "",
      fmtMoney(liveReport.total_commissions), "", ""]);
    if (type === "pdf") exportPDF(title, headers, rows, `reporte_live_${selectedLiveId?.slice(0,8)}.pdf`);
    else exportXLS(title, headers, rows, `reporte_live_${selectedLiveId?.slice(0,8)}.xlsx`);
  };

  // === Export: Compras por Cliente ===
  const exportClientReport = (client, type) => {
    const data = clientsReport.find(c => c.client.id === client.id);
    if (!data || !data.purchases.length) { toast.error("Sin compras"); return; }
    const title = `Compras - ${data.client.name} (${data.client.customer_id})`;
    const headers = ["Producto", "Tienda", "Precio", "Tax", "Comisión", "Total", "Fecha"];
    const rows = data.purchases.map(p => [
      p.item_name, p.store, fmtMoney(p.price), fmtMoney(p.tax),
      fmtMoney(p.commission), fmtMoney(p.total), fmtDate(p.created_at)
    ]);
    rows.push(["", "TOTALES", fmtMoney(data.total_spent - data.total_commission),
      "", fmtMoney(data.total_commission), fmtMoney(data.total_spent), ""]);
    if (type === "pdf") exportPDF(title, headers, rows, `compras_${data.client.customer_id}.pdf`);
    else exportXLS(title, headers, rows, `compras_${data.client.customer_id}.xlsx`);
  };

  // === Export: Todas las compras ===
  const exportAllPurchases = (type) => {
    if (!allPurchases.length) { toast.error("Sin datos"); return; }
    const title = "Todas las Compras";
    const headers = ["Cliente", "ID Cliente", "Producto", "Tienda", "Precio", "Tax", "Comisión", "Total", "Live", "Fecha"];
    const rows = allPurchases.map(p => [
      p.client_name, p.customer_id, p.item_name, p.store,
      fmtMoney(p.price), fmtMoney(p.tax), fmtMoney(p.commission), fmtMoney(p.total),
      p.live_title, fmtDate(p.created_at)
    ]);
    const totPrice = allPurchases.reduce((s, p) => s + (p.price || 0), 0);
    const totTax = allPurchases.reduce((s, p) => s + (p.tax || 0), 0);
    const totComm = allPurchases.reduce((s, p) => s + (p.commission || 0), 0);
    const totTotal = allPurchases.reduce((s, p) => s + (p.total || 0), 0);
    rows.push(["", "TOTALES", "", "", fmtMoney(totPrice), fmtMoney(totTax),
      fmtMoney(totComm), fmtMoney(totTotal), "", ""]);
    if (type === "pdf") exportPDF(title, headers, rows, "todas_las_compras.pdf");
    else exportXLS(title, headers, rows, "todas_las_compras.xlsx");
  };

  // === Export: Reporte por clientes (resumen) ===
  const exportClientsResumen = (type) => {
    if (!clientsReport.length) { toast.error("Sin datos"); return; }
    const title = "Reporte por Clientes";
    const headers = ["ID", "Nombre", "WhatsApp", "País", "Comisión/compra", "Compras", "Total Gastado", "Total Comisiones", "Saldo"];
    const rows = clientsReport.map(c => [
      c.client.customer_id, c.client.name, c.client.whatsapp, c.client.country,
      fmtMoney(c.client.commission_fee), c.purchase_count,
      fmtMoney(c.total_spent), fmtMoney(c.total_commission), fmtMoney(c.wallet_balance)
    ]);
    if (type === "pdf") exportPDF(title, headers, rows, "reporte_clientes.pdf");
    else exportXLS(title, headers, rows, "reporte_clientes.xlsx");
  };

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
          <div className="bg-white rounded-lg p-1">
            <img src={logoUrl} alt="Logo" className="h-10 object-contain logo-transparent" />
          </div>
          <span className="font-bold text-slate-800 flex-1">Reportes</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Summary Cards */}
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="w-full grid grid-cols-3 rounded-xl h-11 mb-4">
            <TabsTrigger value="resumen" className="rounded-lg" data-testid="tab-resumen">Por Live</TabsTrigger>
            <TabsTrigger value="clientes" className="rounded-lg" data-testid="tab-clientes">Por Cliente</TabsTrigger>
            <TabsTrigger value="compras" className="rounded-lg" data-testid="tab-compras">Todas las Compras</TabsTrigger>
          </TabsList>

          {/* === TAB: POR LIVE === */}
          <TabsContent value="resumen">
            <Card className="rounded-xl">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1">
                    <Select onValueChange={setSelectedLiveId}>
                      <SelectTrigger className="h-12 rounded-xl" data-testid="select-live-report">
                        <SelectValue placeholder="Seleccionar Live" />
                      </SelectTrigger>
                      <SelectContent>
                        {lives.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.title} - {l.status === "active" ? "En vivo" : l.status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {liveReport && liveReport.purchases?.length > 0 && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => exportLiveReport("pdf")} className="rounded-lg" data-testid="export-live-pdf">
                        <FileText className="h-4 w-4 mr-1 text-red-600" /> PDF
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportLiveReport("xls")} className="rounded-lg" data-testid="export-live-xls">
                        <FileSpreadsheet className="h-4 w-4 mr-1 text-green-600" /> Excel
                      </Button>
                    </div>
                  )}
                </div>

                {!liveReport ? (
                  <div className="text-center py-12 text-gray-400">
                    <Radio className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p>Selecciona un Live para ver su reporte</p>
                  </div>
                ) : (
                  <>
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
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <th className="text-left p-2 font-semibold text-gray-600">Cliente</th>
                            <th className="text-left p-2 font-semibold text-gray-600">Producto</th>
                            <th className="text-left p-2 font-semibold text-gray-600">Tienda</th>
                            <th className="text-right p-2 font-semibold text-gray-600">Precio</th>
                            <th className="text-right p-2 font-semibold text-gray-600">Tax</th>
                            <th className="text-right p-2 font-semibold text-gray-600">Comisión</th>
                            <th className="text-right p-2 font-semibold text-gray-600">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {liveReport.purchases?.map((p, i) => (
                            <tr key={i} className="border-b hover:bg-gray-50">
                              <td className="p-2 font-medium">#{p.customer_id}</td>
                              <td className="p-2">{p.item_name}</td>
                              <td className="p-2">{p.store}</td>
                              <td className="p-2 text-right">{fmtMoney(p.price)}</td>
                              <td className="p-2 text-right text-gray-500">{fmtMoney(p.tax)}</td>
                              <td className="p-2 text-right text-yellow-600">{fmtMoney(p.commission)}</td>
                              <td className="p-2 text-right font-bold">{fmtMoney(p.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* === TAB: POR CLIENTE === */}
          <TabsContent value="clientes">
            <div className="flex justify-end gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={() => exportClientsResumen("pdf")} className="rounded-lg" data-testid="export-clients-pdf">
                <FileText className="h-4 w-4 mr-1 text-red-600" /> Resumen PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportClientsResumen("xls")} className="rounded-lg" data-testid="export-clients-xls">
                <FileSpreadsheet className="h-4 w-4 mr-1 text-green-600" /> Resumen Excel
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-380px)]">
              {clientsReport.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p>Cargando clientes...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {clientsReport.map((cr) => (
                    <Card key={cr.client.id} className="rounded-xl" data-testid="client-report-item">
                      <CardContent className="p-4">
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedClient(expandedClient === cr.client.id ? null : cr.client.id)}
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-bold text-red-600 border-red-200">
                              #{cr.client.customer_id}
                            </Badge>
                            <div>
                              <p className="font-bold text-slate-800">{cr.client.name}</p>
                              <p className="text-xs text-gray-500">{cr.client.whatsapp} - {cr.client.country}</p>
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
                            {expandedClient === cr.client.id ? (
                              <ChevronUp className="h-5 w-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-gray-400" />
                            )}
                          </div>
                        </div>

                        {expandedClient === cr.client.id && (
                          <div className="mt-4 border-t pt-4">
                            <div className="flex justify-between items-center mb-3">
                              <p className="text-sm font-semibold text-gray-600">
                                Detalle de compras ({cr.purchases.length})
                              </p>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => exportClientReport(cr.client, "pdf")}
                                  className="rounded-lg text-xs h-8" data-testid={`export-client-pdf-${cr.client.customer_id}`}>
                                  <FileText className="h-3 w-3 mr-1 text-red-600" /> PDF
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => exportClientReport(cr.client, "xls")}
                                  className="rounded-lg text-xs h-8" data-testid={`export-client-xls-${cr.client.customer_id}`}>
                                  <FileSpreadsheet className="h-3 w-3 mr-1 text-green-600" /> Excel
                                </Button>
                              </div>
                            </div>
                            {cr.purchases.length === 0 ? (
                              <p className="text-center text-gray-400 py-4">Sin compras</p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b bg-gray-50">
                                    <th className="text-left p-2 text-gray-600 font-semibold">Producto</th>
                                    <th className="text-left p-2 text-gray-600 font-semibold">Tienda</th>
                                    <th className="text-right p-2 text-gray-600 font-semibold">Precio</th>
                                    <th className="text-right p-2 text-gray-600 font-semibold">Tax</th>
                                    <th className="text-right p-2 text-gray-600 font-semibold">Comisión</th>
                                    <th className="text-right p-2 text-gray-600 font-semibold">Total</th>
                                    <th className="text-right p-2 text-gray-600 font-semibold">Fecha</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cr.purchases.map((p, i) => (
                                    <tr key={i} className="border-b hover:bg-gray-50">
                                      <td className="p-2">{p.item_name}</td>
                                      <td className="p-2">{p.store}</td>
                                      <td className="p-2 text-right">{fmtMoney(p.price)}</td>
                                      <td className="p-2 text-right text-gray-500">{fmtMoney(p.tax)}</td>
                                      <td className="p-2 text-right text-yellow-600">{fmtMoney(p.commission)}</td>
                                      <td className="p-2 text-right font-bold">{fmtMoney(p.total)}</td>
                                      <td className="p-2 text-right text-gray-500 text-xs">{fmtDate(p.created_at)}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-gray-50 font-bold">
                                    <td className="p-2" colSpan="2">TOTALES</td>
                                    <td className="p-2 text-right">{fmtMoney(cr.purchases.reduce((s, p) => s + (p.price || 0), 0))}</td>
                                    <td className="p-2 text-right">{fmtMoney(cr.purchases.reduce((s, p) => s + (p.tax || 0), 0))}</td>
                                    <td className="p-2 text-right text-yellow-600">{fmtMoney(cr.total_commission)}</td>
                                    <td className="p-2 text-right">{fmtMoney(cr.total_spent)}</td>
                                    <td></td>
                                  </tr>
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* === TAB: TODAS LAS COMPRAS === */}
          <TabsContent value="compras">
            <Card className="rounded-xl">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="font-bold text-slate-800">{allPurchases.length} compras registradas</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportAllPurchases("pdf")} className="rounded-lg" data-testid="export-all-pdf">
                      <FileText className="h-4 w-4 mr-1 text-red-600" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => exportAllPurchases("xls")} className="rounded-lg" data-testid="export-all-xls">
                      <FileSpreadsheet className="h-4 w-4 mr-1 text-green-600" /> Excel
                    </Button>
                  </div>
                </div>
                <ScrollArea className="max-h-[500px]">
                  {allPurchases.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <Download className="h-12 w-12 mx-auto mb-3 opacity-40" />
                      <p>Cargando compras...</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 sticky top-0">
                          <th className="text-left p-2 font-semibold text-gray-600">Cliente</th>
                          <th className="text-left p-2 font-semibold text-gray-600">Producto</th>
                          <th className="text-left p-2 font-semibold text-gray-600">Tienda</th>
                          <th className="text-right p-2 font-semibold text-gray-600">Precio</th>
                          <th className="text-right p-2 font-semibold text-gray-600">Tax</th>
                          <th className="text-right p-2 font-semibold text-gray-600">Comisión</th>
                          <th className="text-right p-2 font-semibold text-gray-600">Total</th>
                          <th className="text-left p-2 font-semibold text-gray-600">Live</th>
                          <th className="text-right p-2 font-semibold text-gray-600">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPurchases.map((p, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="p-2">
                              <span className="font-medium">#{p.customer_id}</span>
                              <br /><span className="text-xs text-gray-500">{p.client_name}</span>
                            </td>
                            <td className="p-2">{p.item_name}</td>
                            <td className="p-2">{p.store}</td>
                            <td className="p-2 text-right">{fmtMoney(p.price)}</td>
                            <td className="p-2 text-right text-gray-500">{fmtMoney(p.tax)}</td>
                            <td className="p-2 text-right text-yellow-600">{fmtMoney(p.commission)}</td>
                            <td className="p-2 text-right font-bold">{fmtMoney(p.total)}</td>
                            <td className="p-2 text-xs">{p.live_title}</td>
                            <td className="p-2 text-right text-xs text-gray-500">{fmtDate(p.created_at)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-bold">
                          <td className="p-2" colSpan="3">TOTALES ({allPurchases.length} compras)</td>
                          <td className="p-2 text-right">{fmtMoney(allPurchases.reduce((s, p) => s + (p.price || 0), 0))}</td>
                          <td className="p-2 text-right">{fmtMoney(allPurchases.reduce((s, p) => s + (p.tax || 0), 0))}</td>
                          <td className="p-2 text-right text-yellow-600">{fmtMoney(allPurchases.reduce((s, p) => s + (p.commission || 0), 0))}</td>
                          <td className="p-2 text-right">{fmtMoney(allPurchases.reduce((s, p) => s + (p.total || 0), 0))}</td>
                          <td colSpan="2"></td>
                        </tr>
                      </tbody>
                    </table>
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
