import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { getPendingPurchases, createInvoice, getInvoiceDetail, approveInvoice, getClientInvoices, removeItemFromInvoice, reopenInvoice, generateAccessToken, getClientPendingBalance, getClientAvailableDeposits, annulInvoice, updateInvoiceSaldoPendiente } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { FileText, Download, CheckCircle, Clock, AlertCircle, History, Trash2, Edit, RefreshCw, Loader2, Package, ArrowRight, Info } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

// Helper function to load image with proper dimensions
const loadImageWithDimensions = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        const dataURL = canvas.toDataURL("image/png");
        resolve({
          dataURL,
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio: img.naturalWidth / img.naturalHeight
        });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
};

export default function InvoiceDialog({ open, onOpenChange, client, tenantInfo, existingInvoice = null }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [viewMode, setViewMode] = useState("create"); // create, view, history
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [showShipmentPrompt, setShowShipmentPrompt] = useState(false);
  const [saldoPendiente, setSaldoPendiente] = useState("");
  const [autoPendingBalance, setAutoPendingBalance] = useState(0);
  const [pendingDetails, setPendingDetails] = useState([]);
  const [availableDeposits, setAvailableDeposits] = useState([]);
  const [annulDialogOpen, setAnnulDialogOpen] = useState(false);
  const [annulTargetId, setAnnulTargetId] = useState(null);
  const [annulPassword, setAnnulPassword] = useState("");
  const [annulling, setAnnulling] = useState(false);
  const [editSaldoPendiente, setEditSaldoPendiente] = useState("");
  const invoiceRef = useRef(null);

  // Sync editSaldoPendiente when currentInvoice changes
  useEffect(() => {
    if (currentInvoice) {
      setEditSaldoPendiente(currentInvoice.saldo_pendiente > 0 ? currentInvoice.saldo_pendiente.toFixed(2) : "");
    }
  }, [currentInvoice?.id, currentInvoice?.saldo_pendiente]);

  useEffect(() => {
    if (open) {
      // If opening with an existing invoice, load it directly in view mode
      if (existingInvoice) {
        loadExistingInvoice(existingInvoice);
      } else if (client) {
        loadPendingPurchases();
        loadInvoices();
        loadPendingBalance();
        setShowShipmentPrompt(false);
        setViewMode("create");
      }
    }
  }, [open, client, existingInvoice]);

  const [isFirstInvoice, setIsFirstInvoice] = useState(true);

  const loadPendingBalance = async () => {
    try {
      const [balRes, depRes] = await Promise.all([
        getClientPendingBalance(client.customer_id),
        getClientAvailableDeposits(client.customer_id)
      ]);
      const isFirst = balRes.data.is_first_invoice !== false;
      setIsFirstInvoice(isFirst);
      setAutoPendingBalance(balRes.data.total_pending || 0);
      setPendingDetails(balRes.data.details || []);
      setSaldoPendiente(balRes.data.total_pending > 0 ? balRes.data.total_pending.toFixed(2) : "");
      setAvailableDeposits(depRes.data || []);
    } catch {
      setAutoPendingBalance(0);
      setIsFirstInvoice(true);
      setSaldoPendiente("");
      setAvailableDeposits([]);
    }
  };

  const loadExistingInvoice = async (invoice) => {
    try {
      setLoading(true);
      // Load full invoice details if we only have basic info
      if (invoice.id) {
        const res = await getInvoiceDetail(invoice.id);
        setCurrentInvoice(res.data);
      } else {
        setCurrentInvoice(invoice);
      }
      setViewMode("view");
    } catch (error) {
      toast.error("Error al cargar la factura");
    } finally {
      setLoading(false);
    }
  };

  const loadPendingPurchases = async () => {
    try {
      setLoading(true);
      const res = await getPendingPurchases(client.customer_id);
      setPendingPurchases(res.data);
      setSelectedPurchases(res.data.map(p => p.id));
    } catch (error) {
      toast.error("Error al cargar compras pendientes");
    } finally {
      setLoading(false);
    }
  };

  const loadInvoices = async () => {
    try {
      const res = await getClientInvoices(client.customer_id, true);
      setInvoices(res.data);
    } catch (error) {
      console.error("Error loading invoices:", error);
    }
  };

  const handleCreateInvoice = async () => {
    if (selectedPurchases.length === 0) {
      toast.error("Selecciona al menos una compra");
      return;
    }
    
    try {
      setLoading(true);
      const res = await createInvoice({
        customer_id: client.customer_id,
        purchase_ids: selectedPurchases,
        saldo_pendiente: parseFloat(saldoPendiente) || 0
      });
      toast.success(`Factura ${res.data.invoice_number} creada`);
      
      // Load the created invoice
      const invoiceRes = await getInvoiceDetail(res.data.invoice_id);
      setCurrentInvoice(invoiceRes.data);
      setViewMode("view");
      setShowShipmentPrompt(true); // Show shipment creation prompt
      loadPendingPurchases();
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear factura");
    } finally {
      setLoading(false);
    }
  };

  const handleGoToCreateShipment = () => {
    // Store invoice data in sessionStorage for the shipment page
    sessionStorage.setItem('shipmentFromInvoice', JSON.stringify({
      invoice_id: currentInvoice.id,
      invoice_number: currentInvoice.invoice_number,
      customer_id: client.customer_id,
      client_name: client.name,
      client: client,
      purchases: currentInvoice.purchases,
      subtotal: currentInvoice.subtotal,
      total_tax: currentInvoice.total_tax,
      total: currentInvoice.total
    }));
    onOpenChange(false);
    navigate('/admin/shipments?from_invoice=true');
  };

  const handleApproveInvoice = async () => {
    if (!currentInvoice) return;
    
    try {
      setLoading(true);
      await approveInvoice(currentInvoice.id);
      toast.success("Factura aprobada - Compras movidas al historial");
      
      // Reload invoice
      const invoiceRes = await getInvoiceDetail(currentInvoice.id);
      setCurrentInvoice(invoiceRes.data);
      loadPendingPurchases();
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al aprobar factura");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (purchaseId) => {
    if (!currentInvoice) return;
    
    if (currentInvoice.purchases?.length <= 1) {
      toast.error("No puedes quitar el último artículo");
      return;
    }
    
    try {
      setLoading(true);
      await removeItemFromInvoice(currentInvoice.id, purchaseId);
      toast.success("Artículo removido de la factura");
      
      // Reload invoice
      const invoiceRes = await getInvoiceDetail(currentInvoice.id);
      setCurrentInvoice(invoiceRes.data);
      loadPendingPurchases();
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al remover artículo");
    } finally {
      setLoading(false);
    }
  };

  const handleReopenInvoice = async () => {
    if (!currentInvoice) return;
    
    try {
      setLoading(true);
      await reopenInvoice(currentInvoice.id);
      toast.success("Factura reabierta para modificaciones");
      
      // Reload invoice
      const invoiceRes = await getInvoiceDetail(currentInvoice.id);
      setCurrentInvoice(invoiceRes.data);
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al reabrir factura");
    } finally {
      setLoading(false);
    }
  };

  const openAnnulDialog = (invoiceId, e) => {
    if (e) e.stopPropagation();
    setAnnulTargetId(invoiceId);
    setAnnulPassword("");
    setAnnulDialogOpen(true);
  };

  const handleAnnulInvoice = async () => {
    if (!annulPassword) {
      toast.error("Ingresa tu contraseña");
      return;
    }
    setAnnulling(true);
    try {
      await annulInvoice(annulTargetId, annulPassword);
      toast.success("Factura eliminada exitosamente");
      setAnnulDialogOpen(false);
      setAnnulTargetId(null);
      setAnnulPassword("");
      loadInvoices();
      if (currentInvoice?.id === annulTargetId) {
        setCurrentInvoice(null);
        setViewMode("history");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al eliminar factura");
    } finally {
      setAnnulling(false);
    }
  };

  const handleSaveSaldoPendiente = async () => {
    if (!currentInvoice) return;
    const newSaldo = parseFloat(editSaldoPendiente) || 0;
    try {
      await updateInvoiceSaldoPendiente(currentInvoice.id, newSaldo);
      toast.success("Saldo pendiente actualizado");
      const invoiceRes = await getInvoiceDetail(currentInvoice.id);
      setCurrentInvoice(invoiceRes.data);
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al actualizar");
    }
  };

  const handleViewInvoice = async (invoice) => {
    try {
      setLoading(true);
      const res = await getInvoiceDetail(invoice.id);
      setCurrentInvoice(res.data);
      setViewMode("view");
    } catch (error) {
      toast.error("Error al cargar factura");
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!currentInvoice) return;
    
    setGeneratingPDF(true);
    
    try {
      const doc = new jsPDF();
      // Always prioritize current tenantInfo (fetched live) over stored tenant data
      const tenant = { 
        ...(currentInvoice.tenant || {}), 
        ...tenantInfo, // tenantInfo overrides with fresh data
        logo_url: tenantInfo?.logo_url || currentInvoice.tenant?.logo_url // Explicitly use fresh logo
      };
      const inv = currentInvoice;
      const cli = currentInvoice.client || client;
      const shipment = inv.shipment;
      
      // ========== MODERN SAAS COLOR PALETTE ==========
      const colors = {
        background: [248, 250, 252],     // #F8FAFC
        textPrimary: [15, 23, 42],        // #0F172A
        textSecondary: [100, 116, 139],   // #64748B
        divider: [226, 232, 240],         // #E2E8F0
        white: [255, 255, 255],
        // Status colors
        paid: { bg: [220, 252, 231], text: [22, 101, 52] },       // #DCFCE7, #166534
        pending: { bg: [254, 243, 199], text: [161, 98, 7] },     // #FEF3C7, #A16207
        cancelled: { bg: [254, 226, 226], text: [185, 28, 28] }   // #FEE2E2, #B91C1C
      };
      
      const pageWidth = 210;
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);
      
      // ========== BACKGROUND ==========
      doc.setFillColor(...colors.background);
      doc.rect(0, 0, pageWidth, 297, "F");
      
      // ========== WHITE CONTAINER WITH SHADOW EFFECT ==========
      const containerX = 12;
      const containerY = 12;
      const containerWidth = pageWidth - 24;
      
      // Subtle shadow effect
      doc.setFillColor(200, 200, 200);
      doc.roundedRect(containerX + 1, containerY + 1, containerWidth, 297 - containerY * 2, 6, 6, "F");
      
      // White container - full page height
      doc.setFillColor(...colors.white);
      doc.roundedRect(containerX, containerY, containerWidth, 297 - containerY * 2, 6, 6, "F");
      
      let currentY = containerY + 20;
      
      // ========== HEADER SECTION ==========
      // Load and add logo with proper proportions - prioritize fresh tenantInfo logo
      let logoUrl = tenantInfo?.logo_url || tenant?.logo_url;
      let logoEndX = margin;
      
      if (logoUrl) {
        // Ensure full URL
        if (logoUrl.startsWith('/')) {
          const baseUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
          logoUrl = baseUrl + logoUrl;
        }
        
        try {
          const logoData = await loadImageWithDimensions(logoUrl);
          const targetHeight = 14; // ~40px in mm
          const logoWidth = targetHeight * logoData.aspectRatio;
          
          // Determine image format from URL
          const isJpg = logoUrl.toLowerCase().includes('.jpg') || logoUrl.toLowerCase().includes('.jpeg');
          const format = isJpg ? 'JPEG' : 'PNG';
          
          // Add logo maintaining exact proportions (object-fit: contain)
          doc.addImage(logoData.dataURL, format, margin, currentY - 4, logoWidth, targetHeight);
          logoEndX = margin + logoWidth + 5; // spacing after logo
        } catch (e) {
          console.log("Could not load logo:", e);
          // Continue without logo
        }
      }
      
      // Company name and email (left side, after logo)
      doc.setTextColor(...colors.textPrimary);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(tenant?.business_name || tenantInfo?.business_name || "Outlets USA EC", logoEndX, currentY + 2);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textSecondary);
      // Use tenant's business email, not admin email
      const tenantEmail = tenantInfo?.email || tenant?.email || "";
      if (tenantEmail && !tenantEmail.startsWith("admin@")) {
        doc.text(tenantEmail, logoEndX, currentY + 8);
      }
      
      // Invoice info (right side)
      const rightX = pageWidth - margin;
      
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("DETALLE DE COMPRA", rightX, currentY - 2, { align: "right" });
      
      doc.setTextColor(...colors.textPrimary);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(inv.invoice_number, rightX, currentY + 6, { align: "right" });
      
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const invoiceDate = new Date(inv.created_at).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
      doc.text(invoiceDate, rightX, currentY + 12, { align: "right" });
      
      // Status badge (pill shape)
      const statusConfig = inv.status === "approved" ? colors.paid : 
                          inv.status === "cancelled" ? colors.cancelled : colors.pending;
      const statusText = inv.status === "approved" ? "PAGADA" : 
                        inv.status === "cancelled" ? "CANCELADA" : "PENDIENTE";
      const statusIcon = inv.status === "approved" ? " ✓" : "";
      
      const badgeText = statusText + statusIcon;
      const badgeWidth = doc.getTextWidth(badgeText) + 8;
      const badgeX = rightX - badgeWidth;
      
      doc.setFillColor(...statusConfig.bg);
      doc.roundedRect(badgeX, currentY + 16, badgeWidth, 7, 3, 3, "F");
      
      doc.setTextColor(...statusConfig.text);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(badgeText, badgeX + badgeWidth / 2, currentY + 21, { align: "center" });
      
      currentY += 36;
      
      // ========== DIVIDER ==========
      doc.setDrawColor(...colors.divider);
      doc.setLineWidth(0.3);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      
      currentY += 12;
      
      // ========== CLIENT AND DETAILS SECTION (2 columns) ==========
      const colWidth = (contentWidth - 10) / 2;
      
      // Column 1: Cliente
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("CLIENTE", margin, currentY);
      
      currentY += 6;
      doc.setTextColor(...colors.textPrimary);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(cli?.name || "", margin, currentY);
      
      currentY += 5;
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`ID: ${cli?.customer_id || ""}`, margin, currentY);
      
      currentY += 4;
      doc.text(`WhatsApp: ${cli?.whatsapp || ""}`, margin, currentY);
      
      // Column 2: Detalles (right side, same Y level)
      const col2X = margin + colWidth + 10;
      let detailY = currentY - 15;
      
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("DETALLES", col2X, detailY);
      
      detailY += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Fecha: ${new Date(inv.created_at).toLocaleDateString("es-ES")}`, col2X, detailY);
      
      detailY += 4;
      doc.text(`Items: ${inv.purchases?.length || 0}`, col2X, detailY);
      
      if (inv.approved_at) {
        detailY += 4;
        doc.setTextColor(...colors.paid.text);
        doc.text(`Aprobada: ${new Date(inv.approved_at).toLocaleDateString("es-ES")}`, col2X, detailY);
      }
      
      currentY += 12;
      
      // ========== PRODUCTS TABLE ==========
      // Build table data - CANTIDAD, DETALLE, COSTO, TIENDA, COMISION, TOTAL
      const tableData = (inv.purchases || []).map((p) => {
        return [
          "1",
          p.item_name,
          `$${p.price.toFixed(2)}`,
          p.store || "",
          `$${(p.commission || 0).toFixed(2)}`,
          `$${(p.price + (p.commission || 0)).toFixed(2)}`
        ];
      });
      
      const tableHeaders = [["CANTIDAD", "DETALLE", "COSTO", "TIENDA", "COMISION", "TOTAL"]];
      
      const columnStyles = {
        0: { cellWidth: 18, halign: "center" },
        1: { cellWidth: 50 },
        2: { cellWidth: 22, halign: "right" },
        3: { cellWidth: 30 },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 25, halign: "right", fontStyle: "bold" }
      };
      
      autoTable(doc, {
        startY: currentY,
        head: tableHeaders,
        body: tableData,
        theme: "plain",
        headStyles: {
          fillColor: [241, 245, 249], // Gris muy claro
          textColor: colors.textSecondary,
          fontStyle: "bold",
          fontSize: 8,
          cellPadding: 4
        },
        bodyStyles: {
          fontSize: 8,
          textColor: colors.textPrimary,
          cellPadding: 3
        },
        alternateRowStyles: {
          fillColor: colors.white
        },
        columnStyles: columnStyles,
        margin: { left: margin, right: margin },
        styles: {
          lineColor: colors.divider,
          lineWidth: 0.2
        },
        didDrawPage: function(data) {
          // Draw bottom border for header
          doc.setDrawColor(...colors.divider);
          doc.setLineWidth(0.3);
        }
      });
      
      // ========== SUMMARY STATS (Total articulos, Total Etiqueta, Peso) ==========
      let finalY = doc.lastAutoTable.finalY + 8;
      
      const totalArticulos = inv.purchases?.length || 0;
      const totalEtiqueta = inv.subtotal || 0; // sum of COSTO (base prices)
      const weightPounds = shipment?.weight_pounds || 0;
      
      // Draw summary stats row
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(margin, finalY - 2, contentWidth, 14, 2, 2, "F");
      
      const statWidth = contentWidth / 3;
      
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.textSecondary);
      doc.text("Total de articulos", margin + statWidth * 0.5, finalY + 3, { align: "center" });
      doc.text("Total Etiqueta", margin + statWidth * 1.5, finalY + 3, { align: "center" });
      doc.text("Peso en Libras", margin + statWidth * 2.5, finalY + 3, { align: "center" });
      
      doc.setFontSize(9);
      doc.setTextColor(...colors.textPrimary);
      doc.text(totalArticulos.toString(), margin + statWidth * 0.5, finalY + 9, { align: "center" });
      doc.text(`$${totalEtiqueta.toFixed(2)}`, margin + statWidth * 1.5, finalY + 9, { align: "center" });
      doc.text(`${weightPounds} lbs`, margin + statWidth * 2.5, finalY + 9, { align: "center" });
      
      finalY += 18;
      
      // ========== FINANCIAL SUMMARY (right aligned) ==========
      const totalsX = pageWidth - margin - 70;
      const totalsWidth = 70;
      
      // Calculate all financial values
      const displaySubtotal = (inv.subtotal || 0) + (inv.total_commission || 0);
      const taxes = inv.total_tax || 0;
      const shippingCost = shipment?.shipping_cost || 0;
      const saldoPend = currentInvoice.saldo_pendiente || 0;
      const grandTotal = displaySubtotal + taxes + shippingCost + saldoPend;
      const appliedDeposits = currentInvoice.applied_deposits || [];
      const depositsApplied = currentInvoice.deposits_applied || 0;
      const totalAPagar = Math.max(0, grandTotal - depositsApplied);
      
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      // Subtotal
      doc.text("Subtotal:", totalsX, finalY);
      doc.setTextColor(...colors.textPrimary);
      doc.text(`$${displaySubtotal.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
      
      // Taxes
      if (taxes > 0) {
        finalY += 6;
        doc.setTextColor(...colors.textSecondary);
        doc.text("Taxes:", totalsX, finalY);
        doc.setTextColor(...colors.textPrimary);
        doc.text(`$${taxes.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
      }
      
      // Envio
      if (shippingCost > 0) {
        finalY += 6;
        doc.setTextColor(...colors.textSecondary);
        doc.text("Envio:", totalsX, finalY);
        doc.setTextColor(...colors.textPrimary);
        doc.text(`$${shippingCost.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
      }
      
      // Saldo Pendiente
      if (saldoPend > 0) {
        finalY += 6;
        doc.setTextColor(194, 65, 12); // orange-700
        doc.text("Saldo Pendiente:", totalsX, finalY);
        doc.text(`$${saldoPend.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
      }
      
      // Divider line before Total
      finalY += 4;
      doc.setDrawColor(...colors.divider);
      doc.setLineWidth(0.3);
      doc.line(totalsX, finalY, pageWidth - margin, finalY);
      
      // TOTAL
      finalY += 8;
      doc.setTextColor(...colors.textPrimary);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Total:", totalsX, finalY);
      doc.setFontSize(13);
      doc.text(`$${grandTotal.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
      
      // ========== ABONOS assigned to THIS invoice ==========
      if (appliedDeposits.length > 0) {
        finalY += 8;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        
        appliedDeposits.forEach((dep, idx) => {
          doc.setTextColor(...colors.textSecondary);
          doc.text(`Abono ${idx + 1}:`, totalsX, finalY);
          doc.setTextColor(22, 101, 52);
          doc.text(`-$${dep.amount_applied.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
          finalY += 5;
        });
      }
      
      // Divider before Total a pagar
      finalY += 2;
      doc.setDrawColor(...colors.textPrimary);
      doc.setLineWidth(0.5);
      doc.line(totalsX, finalY, pageWidth - margin, finalY);
      
      // TOTAL A PAGAR
      finalY += 8;
      doc.setTextColor(totalAPagar > 0 ? 185 : 22, totalAPagar > 0 ? 28 : 101, totalAPagar > 0 ? 28 : 52);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Total a pagar:", totalsX, finalY);
      doc.setFontSize(14);
      doc.text(`$${totalAPagar.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });
      
      // ========== FOOTER SECTION (dynamic position) ==========
      // Ensure footer is below content with some padding
      const minFooterY = finalY + 20;
      const pageBottom = containerY + 273 - 25;
      let footerY;
      
      if (minFooterY > pageBottom - 5) {
        // Content overflows - add new page
        // First, extend the white container on current page to cover full area
        doc.setFillColor(...colors.white);
        doc.roundedRect(containerX, containerY + 273, containerWidth, 0, 0, 0, "F");
        
        doc.addPage();
        // Background for new page
        doc.setFillColor(...colors.background);
        doc.rect(0, 0, pageWidth, 297, "F");
        // White container for new page
        doc.setFillColor(...colors.white);
        doc.roundedRect(containerX, 12, containerWidth, 50, 6, 6, "F");
        footerY = 30;
      } else {
        footerY = pageBottom;
      }
      
      // Divider before footer
      doc.setDrawColor(...colors.divider);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 8, pageWidth - margin, footerY - 8);
      
      // Footer text (left side)
      doc.setTextColor(...colors.textPrimary);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Gracias por su compra", margin, footerY);
      
      doc.setTextColor(...colors.textSecondary);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`${tenant?.business_name || "Outlets USA EC"} – Compras en USA → Entregas en Ecuador`, margin, footerY + 5);
      
      // Generation timestamp (bottom left)
      const genDate = new Date().toLocaleString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      doc.setFontSize(7);
      doc.text(`Generado: ${genDate}`, margin, footerY + 12);
      
      // QR Code (bottom right) - Links to client dashboard with temporary token
      try {
        // Generate temporary access token
        const tokenResponse = await generateAccessToken({
          customer_id: cli?.customer_id,
          invoice_id: inv.id
        });
        
        // QR data: URL to client dashboard with temporary token
        const portalUrl = `https://outletsusaec.shop/access/${tokenResponse.data.token}`;
        const qrDataUrl = await QRCode.toDataURL(portalUrl, {
          width: 200,
          margin: 1,
          color: {
            dark: '#0F172A',
            light: '#FFFFFF'
          }
        });
        doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - 22, footerY - 6, 22, 22);
        
        // Small text below QR
        doc.setFontSize(6);
        doc.setTextColor(...colors.textSecondary);
        doc.text("Escanea para ver tu portal", pageWidth - margin - 11, footerY + 18, { align: "center" });
      } catch (e) {
        console.log("Could not generate QR with token:", e);
        // Fallback: Generate QR with just the login page
        try {
          const fallbackUrl = `https://outletsusaec.shop/login?user=${encodeURIComponent(cli?.customer_id || "")}`;
          const qrDataUrl = await QRCode.toDataURL(fallbackUrl, {
            width: 200,
            margin: 1,
            color: {
              dark: '#0F172A',
              light: '#FFFFFF'
            }
          });
          doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - 22, footerY - 6, 22, 22);
          doc.setFontSize(6);
          doc.setTextColor(...colors.textSecondary);
          doc.text("Escanea para ver tu portal", pageWidth - margin - 11, footerY + 18, { align: "center" });
        } catch (e2) {
          console.log("Could not generate fallback QR:", e2);
        }
      }
      
      // Save PDF
      doc.save(`Factura_${inv.invoice_number}_${cli?.customer_id || ""}.pdf`);
      toast.success("PDF descargado exitosamente");
      
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Error al generar PDF");
    } finally {
      setGeneratingPDF(false);
    }
  };

  const togglePurchase = (purchaseId) => {
    setSelectedPurchases(prev => 
      prev.includes(purchaseId) 
        ? prev.filter(id => id !== purchaseId)
        : [...prev, purchaseId]
    );
  };

  const selectAll = () => {
    setSelectedPurchases(pendingPurchases.map(p => p.id));
  };

  const deselectAll = () => {
    setSelectedPurchases([]);
  };

  // Calculate totals for selected purchases
  const selectedTotals = pendingPurchases
    .filter(p => selectedPurchases.includes(p.id))
    .reduce((acc, p) => ({
      subtotal: acc.subtotal + p.price,
      tax: acc.tax + (p.tax || 0),
      commission: acc.commission + (p.commission || 0),
      total: acc.total + p.total
    }), { subtotal: 0, tax: 0, commission: 0, total: 0 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(30,58,95,0.1)' }}>
              <FileText className="h-5 w-5" style={{ color: '#1E3A5F' }} />
            </div>
            Facturación - {client?.name}
            <Badge className="ml-2 bg-blue-100 text-blue-800">#{client?.customer_id}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Tab buttons */}
        <div className="flex gap-2 border-b pb-3">
          <Button
            variant={viewMode === "create" ? "default" : "outline"}
            size="sm"
            onClick={() => { setViewMode("create"); setCurrentInvoice(null); }}
            className="rounded-lg"
            style={viewMode === "create" ? { background: '#1E3A5F' } : {}}
          >
            <FileText className="h-4 w-4 mr-2" />
            Nueva Factura
            {pendingPurchases.length > 0 && (
              <Badge className="ml-2 bg-red-500 text-white">{pendingPurchases.length}</Badge>
            )}
          </Button>
          <Button
            variant={viewMode === "history" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("history")}
            className="rounded-lg"
            style={viewMode === "history" ? { background: '#1E3A5F' } : {}}
          >
            <History className="h-4 w-4 mr-2" />
            Historial ({invoices.length})
          </Button>
        </div>

        <ScrollArea className="h-[60vh] pr-4">
          {/* CREATE MODE */}
          {viewMode === "create" && (
            <div className="space-y-4">
              {pendingPurchases.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-16 w-16 text-green-300 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-600">No hay compras pendientes</p>
                  <p className="text-sm text-gray-400 mt-2">Todas las compras han sido facturadas</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">{selectedPurchases.length} de {pendingPurchases.length} compras seleccionadas</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={selectAll} className="rounded-lg text-xs">
                        Seleccionar todo
                      </Button>
                      <Button variant="outline" size="sm" onClick={deselectAll} className="rounded-lg text-xs">
                        Deseleccionar
                      </Button>
                    </div>
                  </div>

                  {/* Purchases list */}
                  <div className="space-y-2">
                    {pendingPurchases.map((purchase) => (
                      <div
                        key={purchase.id}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          selectedPurchases.includes(purchase.id)
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                        onClick={() => togglePurchase(purchase.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedPurchases.includes(purchase.id)}
                            onCheckedChange={() => {}}
                            onClick={(e) => e.stopPropagation()}
                            className="data-[state=checked]:bg-blue-600 pointer-events-none"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-gray-800">{purchase.item_name}</p>
                              <p className="font-bold text-lg" style={{ color: '#1E3A5F' }}>${(purchase.price + (purchase.commission || 0)).toFixed(2)}</p>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                              <span>{purchase.store}</span>
                              <span>Costo: ${purchase.price.toFixed(2)}</span>
                              {purchase.commission > 0 && <span>Com: ${purchase.commission.toFixed(2)}</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(purchase.created_at).toLocaleDateString("es-ES")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Saldo Pendiente Field */}
                  {selectedPurchases.length > 0 && (
                    <div className="p-3 rounded-xl border border-orange-200 bg-orange-50/50" data-testid="saldo-pendiente-section">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-orange-800">Saldo Pendiente</p>
                          <p className="text-xs text-orange-600">
                            {!isFirstInvoice ? 'Total a pagar de factura anterior' : 'Deuda anterior (editable)'}
                          </p>
                        </div>
                        <div className="w-32">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={saldoPendiente}
                            onChange={(e) => setSaldoPendiente(e.target.value)}
                            className={`h-9 text-right font-bold rounded-lg ${!isFirstInvoice ? 'text-orange-700 bg-orange-100 cursor-not-allowed' : 'text-orange-700'}`}
                            data-testid="saldo-pendiente-input"
                            onWheel={(e) => e.target.blur()}
                            disabled={!isFirstInvoice}
                          />
                        </div>
                      </div>
                      {pendingDetails.length > 0 && (
                        <div className="text-xs text-orange-600 space-y-0.5 border-t border-orange-200 pt-2 mt-1">
                          {pendingDetails.map((d, i) => (
                            <div key={i} className="flex justify-between">
                              <span>{d.invoice_number}: Total a pagar</span>
                              <span>${(d.total_a_pagar || d.remaining || 0).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Totals and Create button */}
                  {selectedPurchases.length > 0 && (
                    <div className="bg-white pt-4 border-t">
                      <div className="p-4 rounded-xl" style={{ background: 'rgba(30,58,95,0.05)' }}>
                        {(() => {
                          const subtotal = selectedTotals.subtotal + selectedTotals.commission;
                          const saldo = parseFloat(saldoPendiente) || 0;
                          const grandTotal = subtotal + saldo;
                          const totalAbonos = availableDeposits.reduce((s, d) => s + d.amount, 0);
                          const totalAPagar = Math.max(0, grandTotal - totalAbonos);

                          return (
                            <>
                              <div className="space-y-2 mb-3">
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-600">Subtotal:</span>
                                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                                </div>
                                {saldo > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-orange-600">Saldo Pendiente:</span>
                                    <span className="font-medium text-orange-600">${saldo.toFixed(2)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between border-t pt-2">
                                  <span className="font-bold">Total:</span>
                                  <span className="font-bold text-xl" style={{ color: '#1E3A5F' }}>${grandTotal.toFixed(2)}</span>
                                </div>
                              </div>

                              {/* Abonos (recargas disponibles) */}
                              {availableDeposits.length > 0 && (
                                <div className="space-y-1 mb-3 p-3 rounded-lg bg-green-50 border border-green-200" data-testid="create-abonos-section">
                                  <p className="text-xs font-semibold text-green-800 mb-1">Abonos (Recargas del cliente)</p>
                                  {availableDeposits.map((dep, idx) => (
                                    <div key={dep.id} className="flex justify-between text-sm">
                                      <span className="text-green-700">Abono {idx + 1}:</span>
                                      <span className="font-bold text-green-700">-${dep.amount.toFixed(2)}</span>
                                    </div>
                                  ))}
                                  <div className="border-t border-green-300 pt-1 mt-1 flex justify-between text-sm font-bold text-green-800">
                                    <span>Total Abonos:</span>
                                    <span>-${totalAbonos.toFixed(2)}</span>
                                  </div>
                                </div>
                              )}

                              {/* Total a pagar o Saldo a favor */}
                              <div className="flex justify-between items-center mb-4 p-2 rounded-lg" style={{ background: totalAPagar > 0 ? 'rgba(220,38,38,0.05)' : 'rgba(22,163,74,0.05)' }}>
                                <span className="font-extrabold text-lg">{totalAPagar > 0 ? 'Total a pagar:' : 'Total a pagar:'}</span>
                                <span className="font-extrabold text-2xl" style={{ color: totalAPagar > 0 ? '#DC2626' : '#16A34A' }}>
                                  ${totalAPagar.toFixed(2)}
                                </span>
                              </div>
                              {totalAbonos > grandTotal && (
                                <div className="p-3 rounded-lg bg-green-100 border border-green-300 mb-4 text-center" data-testid="saldo-favor-msg">
                                  <p className="text-sm font-bold text-green-800">
                                    Saldo disponible a favor: ${(totalAbonos - grandTotal).toFixed(2)}
                                  </p>
                                  <p className="text-xs text-green-600">Este saldo queda disponible para futuras facturas</p>
                                </div>
                              )}
                            </>
                          );
                        })()}
                        <Button
                          onClick={handleCreateInvoice}
                          disabled={loading}
                          className="w-full h-12 text-lg font-bold rounded-xl"
                          style={{ background: '#2ECC71' }}
                        >
                          {loading ? "Creando..." : `Crear Factura (${selectedPurchases.length} items)`}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* VIEW MODE - Invoice detail */}
          {viewMode === "view" && currentInvoice && (
            <div className="space-y-4" ref={invoiceRef}>
              {/* Invoice Header */}
              <div className="p-6 rounded-2xl text-white" style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2c5282 100%)' }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    {(tenantInfo?.logo_url || currentInvoice.tenant?.logo_url) ? (
                      <img 
                        src={`${process.env.REACT_APP_BACKEND_URL || ''}${tenantInfo?.logo_url || currentInvoice.tenant?.logo_url}`}
                        alt="Logo"
                        className="w-16 h-16 rounded-2xl object-contain bg-white p-1"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className="w-16 h-16 rounded-2xl items-center justify-center" style={{ background: '#2ECC71', display: (tenantInfo?.logo_url || currentInvoice.tenant?.logo_url) ? 'none' : 'flex' }}>
                      <span className="text-2xl font-bold text-white">
                        {(tenantInfo?.business_name || currentInvoice.tenant?.business_name)?.substring(0, 2)?.toUpperCase() || "PS"}
                      </span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">{tenantInfo?.business_name || currentInvoice.tenant?.business_name || "Personal Shopper"}</h2>
                      <p className="text-blue-200 text-sm">{tenantInfo?.email || currentInvoice.tenant?.email}</p>
                      <p className="text-blue-200 text-sm">{tenantInfo?.owner_name || currentInvoice.tenant?.owner_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold">{currentInvoice.invoice_number}</p>
                    <Badge className={currentInvoice.status === "approved" ? "bg-green-500 mt-2" : "bg-yellow-500 mt-2"}>
                      {currentInvoice.status === "approved" ? "PAGADA" : "PENDIENTE"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Client Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 mb-2">DATOS DEL CLIENTE</p>
                  <p className="font-bold text-lg" style={{ color: '#1E3A5F' }}>{currentInvoice.client?.name}</p>
                  <p className="text-sm text-gray-600">ID: {currentInvoice.client?.customer_id}</p>
                  <p className="text-sm text-gray-600">WhatsApp: {currentInvoice.client?.whatsapp}</p>
                  <p className="text-sm text-gray-600">País: {currentInvoice.client?.country}</p>
                </div>
                <div className="p-4 rounded-xl bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 mb-2">DETALLE DE COMPRA</p>
                  <p className="text-sm text-gray-600">Fecha: {new Date(currentInvoice.created_at).toLocaleDateString("es-ES")}</p>
                  <p className="text-sm text-gray-600">Items: {currentInvoice.purchases?.length || 0}</p>
                  {currentInvoice.approved_at && (
                    <p className="text-sm text-green-600 font-medium">
                      Aprobada: {new Date(currentInvoice.approved_at).toLocaleDateString("es-ES")}
                    </p>
                  )}
                </div>
              </div>

              {/* Shipment Info */}
              {currentInvoice.shipment && (
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
                  <p className="text-xs font-semibold text-purple-800 mb-2 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs">📦</span>
                    INFORMACIÓN DE ENVÍO
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-purple-600">Costo de Envío</p>
                      <p className="font-bold text-lg text-purple-800">${(currentInvoice.shipment.shipping_cost || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-purple-600">Peso</p>
                      <p className="font-bold text-lg text-purple-800">{currentInvoice.shipment.weight_pounds || 0} lbs</p>
                    </div>
                    <div>
                      <p className="text-xs text-purple-600">Tracking ({currentInvoice.shipment.tracking_numbers?.length || (currentInvoice.shipment.tracking_number ? 1 : 0)} paquete(s))</p>
                      {currentInvoice.shipment.tracking_numbers?.length > 0 ? (
                        <div className="space-y-1">
                          {currentInvoice.shipment.tracking_numbers.map((t, i) => (
                            <p key={i} className="font-bold text-sm text-purple-800 font-mono">#{i+1}: {t}</p>
                          ))}
                        </div>
                      ) : (
                        <p className="font-bold text-lg text-purple-800">{currentInvoice.shipment.tracking_number || "N/A"}</p>
                      )}
                    </div>
                  </div>
                  {(currentInvoice.shipment.tracking_numbers?.length > 0 || currentInvoice.shipment.tracking_number) && currentInvoice.tenant?.tracking_url_template && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(currentInvoice.shipment.tracking_numbers?.length > 0 
                        ? currentInvoice.shipment.tracking_numbers 
                        : [currentInvoice.shipment.tracking_number]
                      ).filter(Boolean).map((tracking, idx) => (
                        <a
                          key={idx}
                          href={currentInvoice.tenant.tracking_url_template.replace('{tracking}', tracking)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs font-medium"
                        >
                          📦 Paquete {idx + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Purchases table */}
              <div className="border rounded-xl overflow-hidden" data-testid="invoice-purchases-table">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: '#1E3A5F' }}>
                      <th className="text-center p-3 text-white text-sm font-semibold w-20">CANTIDAD</th>
                      <th className="text-left p-3 text-white text-sm font-semibold">DETALLE</th>
                      <th className="text-right p-3 text-white text-sm font-semibold">COSTO</th>
                      <th className="text-left p-3 text-white text-sm font-semibold">TIENDA</th>
                      <th className="text-right p-3 text-white text-sm font-semibold">COMISION</th>
                      <th className="text-right p-3 text-white text-sm font-semibold">TOTAL</th>
                      <th className="text-center p-3 text-white text-sm font-semibold w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentInvoice.purchases?.map((p, idx) => (
                      <tr key={p.id} className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} group hover:bg-red-50 transition-colors`}>
                        <td className="p-3 text-sm text-center text-gray-600">1</td>
                        <td className="p-3 text-sm font-medium">{p.item_name}</td>
                        <td className="p-3 text-sm text-right">${p.price.toFixed(2)}</td>
                        <td className="p-3 text-sm text-gray-600">{p.store}</td>
                        <td className="p-3 text-sm text-right">${(p.commission || 0).toFixed(2)}</td>
                        <td className="p-3 text-sm text-right font-bold">${(p.price + (p.commission || 0)).toFixed(2)}</td>
                        <td className="p-3 text-center">
                          {currentInvoice.purchases.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 transition-all"
                              onClick={() => handleRemoveItem(p.id)}
                              disabled={loading}
                              title="Quitar de la factura"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary stats below table */}
              {(() => {
                const shippingCost = currentInvoice.shipment?.shipping_cost || currentInvoice.shipping_cost || 0;
                const weightPounds = currentInvoice.shipment?.weight_pounds || currentInvoice.weight_pounds || 0;
                const totalArticulos = currentInvoice.purchases?.length || 0;
                const totalEtiqueta = currentInvoice.subtotal || 0;
                const totalCommission = currentInvoice.total_commission || 0;
                const displaySubtotal = totalEtiqueta + totalCommission;
                const taxes = currentInvoice.total_tax || 0;
                const saldoPend = parseFloat(editSaldoPendiente) || 0;
                const grandTotal = displaySubtotal + taxes + shippingCost + saldoPend;
                const appliedDeposits = currentInvoice.applied_deposits || [];
                const depositsApplied = currentInvoice.deposits_applied || 0;
                const totalAPagar = Math.max(0, grandTotal - depositsApplied);

                return (
                  <>
                    {/* Artículos / Etiqueta / Peso row */}
                    <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-gray-50 border" data-testid="invoice-summary-stats">
                      <div className="text-center">
                        <p className="text-xs text-gray-500 font-semibold">Total de artículos</p>
                        <p className="font-bold text-lg" style={{ color: '#1E3A5F' }}>{totalArticulos}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500 font-semibold">Total Etiqueta</p>
                        <p className="font-bold text-lg" style={{ color: '#1E3A5F' }}>${totalEtiqueta.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500 font-semibold">Peso en Libras</p>
                        <p className="font-bold text-lg" style={{ color: '#1E3A5F' }}>{weightPounds} lbs</p>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="flex justify-end">
                      <div className="w-80 p-4 rounded-xl bg-gray-50 space-y-2" data-testid="invoice-financial-summary">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Subtotal:</span>
                          <span className="font-medium">${totalEtiqueta.toFixed(2)}</span>
                        </div>
                        {totalCommission > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Comisiones:</span>
                            <span className="font-medium">${totalCommission.toFixed(2)}</span>
                          </div>
                        )}
                        {taxes > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Taxes:</span>
                            <span className="font-medium">${taxes.toFixed(2)}</span>
                          </div>
                        )}
                        {shippingCost > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              Envio:
                            </span>
                            <span className="font-medium text-purple-600">${shippingCost.toFixed(2)}</span>
                          </div>
                        )}
                        {/* Saldo Pendiente - editable */}
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-orange-600 font-medium">Saldo Pendiente:</span>
                          <div className="flex items-center gap-1">
                            <span className="text-orange-600">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={editSaldoPendiente}
                              onChange={(e) => setEditSaldoPendiente(e.target.value)}
                              onBlur={handleSaveSaldoPendiente}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveSaldoPendiente()}
                              className="h-7 w-24 text-right text-sm font-bold text-orange-700 rounded px-2"
                              data-testid="view-saldo-pendiente-input"
                              onWheel={(e) => e.target.blur()}
                            />
                          </div>
                        </div>
                        {/* Divider before Total */}
                        <div className="border-t border-gray-300 pt-2 mt-2">
                          <div className="flex justify-between">
                            <span className="font-bold text-gray-800">Total:</span>
                            <span className="font-bold text-xl" style={{ color: '#1E3A5F' }}>
                              ${grandTotal.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        {/* Abonos assigned to THIS invoice */}
                        {appliedDeposits.length > 0 && (
                          <div className="space-y-1 pt-1">
                            {appliedDeposits.map((dep, idx) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className="text-green-700">Abono {idx + 1}:</span>
                                <span className="font-medium text-green-700">-${dep.amount_applied.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Total a pagar */}
                        <div className="border-t-2 border-gray-400 pt-2 mt-2">
                          <div className="flex justify-between">
                            <span className="font-extrabold text-gray-900">Total a pagar:</span>
                            <span className="font-extrabold text-2xl" style={{ color: totalAPagar > 0 ? '#DC2626' : '#16A34A' }}>
                              ${totalAPagar.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        {depositsApplied > grandTotal && (
                          <div className="mt-2 p-2 rounded-lg bg-green-100 border border-green-300 text-center">
                            <p className="text-sm font-bold text-green-800">
                              Saldo a favor en esta factura: ${(depositsApplied - grandTotal).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Shipment Creation Prompt - Show when invoice has no shipment */}
              {currentInvoice.status !== "approved" && !currentInvoice.shipment && (
                <div className="p-4 rounded-xl bg-purple-50 border-2 border-purple-300 space-y-3">
                  <div className="flex items-start gap-3">
                    <Package className="h-6 w-6 text-purple-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-purple-800">¿Crear envío para esta factura?</p>
                      <p className="text-sm text-purple-700 mt-1">
                        El envío incluirá los {currentInvoice.purchases?.length || 0} productos de esta factura.
                        El costo del envío se agregará al total final.
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={handleGoToCreateShipment}
                    className="w-full h-10 rounded-xl bg-purple-600 hover:bg-purple-700"
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Crear Envío para esta Factura
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}

              {/* Pending alert with shipping note */}
              {currentInvoice.status !== "approved" && (
                <div className="p-4 rounded-xl bg-yellow-50 border-2 border-yellow-200">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-6 w-6 text-yellow-600" />
                    <div className="flex-1">
                      <p className="font-semibold text-yellow-800">Factura Pendiente de Pago</p>
                      <p className="text-sm text-yellow-700">Puedes quitar artículos pasando el mouse sobre ellos. Aprueba cuando esté lista.</p>
                    </div>
                  </div>
                  {/* Note about shipping cost */}
                  {!currentInvoice.shipment && !currentInvoice.shipping_cost && (
                    <div className="mt-3 p-2 rounded-lg bg-yellow-100/50 flex items-start gap-2">
                      <Info className="h-4 w-4 text-yellow-700 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-yellow-700">
                        <strong>Nota:</strong> Aún falta agregar el valor del envío. El costo de envío se mostrará una vez que crees el envío para esta factura.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Approved - can reopen */}
              {currentInvoice.status === "approved" && (
                <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-200 flex items-center gap-3">
                  <Edit className="h-6 w-6 text-blue-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-blue-800">Factura Pagada</p>
                    <p className="text-sm text-blue-700">Puedes reabrir la factura si necesitas modificarla o quitar artículos</p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={generatePDF}
                  variant="outline"
                  disabled={generatingPDF}
                  className="flex-1 h-12 rounded-xl"
                >
                  {generatingPDF ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5 mr-2" />
                      Descargar PDF
                    </>
                  )}
                </Button>
                {currentInvoice.status === "approved" ? (
                  <Button
                    onClick={handleReopenInvoice}
                    disabled={loading}
                    variant="outline"
                    className="flex-1 h-12 rounded-xl border-orange-300 text-orange-600 hover:bg-orange-50"
                  >
                    <RefreshCw className="h-5 w-5 mr-2" />
                    {loading ? "Reabriendo..." : "Reabrir Factura"}
                  </Button>
                ) : (
                  <Button
                    onClick={handleApproveInvoice}
                    disabled={loading}
                    className="flex-1 h-12 rounded-xl"
                    style={{ background: '#2ECC71' }}
                  >
                    <CheckCircle className="h-5 w-5 mr-2" />
                    {loading ? "Aprobando..." : "Aprobar Factura"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* HISTORY MODE */}
          {viewMode === "history" && (
            <div className="space-y-3">
              {invoices.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-600">Sin facturas</p>
                  <p className="text-sm text-gray-400 mt-2">Aún no se han creado facturas para este cliente</p>
                </div>
              ) : (
                invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className={`p-4 rounded-xl border transition-all ${inv.is_annulled ? 'bg-red-50/30 border-red-100 opacity-60' : 'hover:border-blue-300 hover:shadow-md cursor-pointer'}`}
                    onClick={() => !inv.is_annulled && handleViewInvoice(inv)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: inv.is_annulled ? 'rgba(220,38,38,0.1)' : 'rgba(30,58,95,0.1)' }}>
                          <FileText className="h-6 w-6" style={{ color: inv.is_annulled ? '#DC2626' : '#1E3A5F' }} />
                        </div>
                        <div>
                          <p className={`font-bold ${inv.is_annulled ? 'text-red-400 line-through' : ''}`} style={{ color: inv.is_annulled ? undefined : '#1E3A5F' }}>{inv.invoice_number}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(inv.created_at).toLocaleDateString("es-ES")} · {inv.purchase_ids?.length || 0} items
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`font-extrabold text-xl ${inv.is_annulled ? 'line-through text-red-400' : ''}`} style={{ color: inv.is_annulled ? undefined : '#1E3A5F' }}>
                            ${((inv.total || 0) + (inv.saldo_pendiente || 0) + (inv.shipping_cost || 0)).toFixed(2)}
                          </p>
                          {(inv.deposits_applied || 0) > 0 && !inv.is_annulled && (
                            <p className="text-xs text-green-600">Abonos: -${(inv.deposits_applied || 0).toFixed(2)}</p>
                          )}
                          {(inv.total_a_pagar != null && inv.total_a_pagar > 0 && !inv.is_annulled) && (
                            <p className="text-xs font-bold text-red-600">A pagar: ${inv.total_a_pagar.toFixed(2)}</p>
                          )}
                          {inv.is_annulled ? (
                            <Badge className="bg-red-100 text-red-700">Anulada</Badge>
                          ) : (
                            <Badge className={inv.status === "approved" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                              {inv.status === "approved" ? (
                                <><CheckCircle className="h-3 w-3 mr-1" /> Pagada</>
                              ) : (
                                <><Clock className="h-3 w-3 mr-1" /> Pendiente</>
                              )}
                            </Badge>
                          )}
                        </div>
                        {!inv.is_annulled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                            onClick={(e) => openAnnulDialog(inv.id, e)}
                            title="Eliminar factura"
                            data-testid={`annul-invoice-${inv.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </ScrollArea>

        {/* Annul Invoice Confirmation Dialog */}
        <Dialog open={annulDialogOpen} onOpenChange={(open) => { setAnnulDialogOpen(open); if (!open) setAnnulPassword(""); }}>
          <DialogContent className="max-w-sm rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Eliminar Factura
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600">
              Esta accion anulara la factura, liberara las compras y los abonos asignados. Ingresa tu contrasena de administrador para confirmar.
            </p>
            <div className="space-y-4 py-2">
              <div>
                <Input
                  type="password"
                  placeholder="Contrasena del administrador..."
                  value={annulPassword}
                  onChange={(e) => setAnnulPassword(e.target.value)}
                  className="h-11 rounded-xl"
                  data-testid="annul-password-input"
                  onKeyDown={(e) => e.key === 'Enter' && handleAnnulInvoice()}
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setAnnulDialogOpen(false)} className="flex-1 h-11 rounded-xl">
                  Cancelar
                </Button>
                <Button
                  onClick={handleAnnulInvoice}
                  disabled={annulling || !annulPassword}
                  className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
                  data-testid="confirm-annul-btn"
                >
                  {annulling ? "Eliminando..." : "Confirmar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
