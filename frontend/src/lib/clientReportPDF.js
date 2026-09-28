import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const fmtMoney = (v) =>
  "$" + Number(v || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
};
const waLink = (w) => {
  const digits = String(w || "").replace(/[^0-9]/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
};

/**
 * Professional client report using jsPDF + jspdf-autotable.
 * Alternating row colors, aligned columns, clickable WhatsApp links and a
 * totals summary band at the end.
 */
export function generateClientReportPDF({ tenantName, filtersLabel, clients, totals }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // ── Header band ──
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, pageW, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(tenantName || "Reporte", margin, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Reporte de Clientes", margin, 48);
  doc.setFontSize(8);
  doc.text(`Generado: ${new Date().toLocaleString("es-EC")}`, pageW - margin, 26, { align: "right" });
  if (filtersLabel) {
    doc.setTextColor(200, 214, 235);
    doc.text(filtersLabel, pageW - margin, 42, { align: "right" });
  }

  const head = [[
    "Cliente", "WhatsApp", "Última Compra", "Días Inact.", "Saldo Pend.", "Antig. Mercadería",
  ]];
  const body = clients.map((c) => [
    `${c.name || "—"}\n#${c.customer_id || ""}`,
    c.whatsapp || "—",
    fmtDate(c.last_purchase),
    c.inactivity_days == null ? "—" : `${c.inactivity_days} días`,
    fmtMoney(c.saldo_pendiente),
    c.merchandise_age_days == null ? "—" : `${c.merchandise_age_days} días${c.stagnant ? " (E)" : ""}`,
  ]);

  autoTable(doc, {
    head,
    body,
    startY: 78,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8.5, cellPadding: 6, valign: "middle", lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: [88, 28, 135], textColor: 255, fontStyle: "bold", fontSize: 8.5, halign: "left" },
    alternateRowStyles: { fillColor: [245, 243, 255] },
    columnStyles: {
      0: { cellWidth: 200, fontStyle: "bold" },
      1: { cellWidth: 120, textColor: [21, 128, 61] },
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "right", fontStyle: "bold" },
      5: { halign: "center" },
    },
    didParseCell: (data) => {
      // Highlight stagnant merchandise in red.
      if (data.section === "body" && data.column.index === 5) {
        const c = clients[data.row.index];
        if (c && c.stagnant) data.cell.styles.textColor = [190, 18, 60];
      }
      // Highlight positive pending balances (owed) in red.
      if (data.section === "body" && data.column.index === 4) {
        const c = clients[data.row.index];
        if (c && c.saldo_pendiente > 0) data.cell.styles.textColor = [190, 18, 60];
      }
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const c = clients[data.row.index];
        const link = waLink(c && c.whatsapp);
        if (link) {
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: link });
        }
      }
    },
  });

  // ── Summary band ──
  let y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 78) + 20;
  if (y > pageH - 80) {
    doc.addPage();
    y = 60;
  }
  doc.setFillColor(88, 28, 135);
  doc.roundedRect(margin, y, pageW - margin * 2, 58, 8, 8, "F");
  doc.setTextColor(216, 180, 254);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RESUMEN", margin + 18, y + 20);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Clientes en el reporte: ${clients.length}`, margin + 18, y + 40);
  doc.text(`Con mercadería estancada (E): ${totals?.with_stagnant ?? 0}`, margin + 220, y + 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Saldo pendiente total: ${fmtMoney(totals?.saldo_pendiente || 0)}`, pageW - margin - 18, y + 34, { align: "right" });

  // Legend
  y += 74;
  if (y < pageH - 20) {
    doc.setTextColor(120, 120, 140);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.text("(E) = Mercadería estancada · Toca el número de WhatsApp para abrir el chat.", margin, y);
  }

  // ── Cross-platform delivery (desktop downloads, mobile opens in a tab) ──
  const filename = `reporte_clientes_${Date.now()}.pdf`;
  const ua = navigator.userAgent || "";
  const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  const supportsDownload = "download" in document.createElement("a") && !isIOS && !isSafari;
  try {
    const blob = new Blob([doc.output("blob")], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    if (supportsDownload) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { document.body.removeChild(a); } catch {}
        URL.revokeObjectURL(url);
      }, 15000);
    } else {
      const win = window.open(url, "_blank");
      if (!win) window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    return;
  } catch (e) {
    console.error("Blob delivery failed, trying doc.save:", e);
  }
  try {
    doc.save(filename);
  } catch (e) {
    doc.output("dataurlnewwindow");
  }
}
