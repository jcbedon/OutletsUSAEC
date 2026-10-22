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
 * Report of clients paying off their debt (abonos), ordered by most recent
 * payment first. Green header band, WhatsApp links and a collection summary.
 */
export function generatePaymentsReportPDF({ tenantName, periodLabel, payments, summary }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // ── Header band ──
  doc.setFillColor(13, 95, 61);
  doc.rect(0, 0, pageW, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(tenantName || "Reporte", margin, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Reporte de Abonos / Pagos", margin, 48);
  doc.setFontSize(8);
  doc.text(`Generado: ${new Date().toLocaleString("es-EC")}`, pageW - margin, 26, { align: "right" });
  if (periodLabel) {
    doc.setTextColor(190, 230, 210);
    doc.text(periodLabel, pageW - margin, 42, { align: "right" });
  }

  const head = [[
    "Cliente", "WhatsApp", "Último Pago", "# Abonos", "Total Abonado", "Deuda Restante", "Estado",
  ]];
  const body = payments.map((p) => [
    `${p.name || "—"}\n#${p.customer_id || ""}`,
    p.whatsapp || "—",
    fmtDate(p.last_payment_date),
    String(p.payments_count || 0),
    fmtMoney(p.total_paid),
    p.fully_paid ? "$0.00" : fmtMoney(p.real_debt),
    p.fully_paid ? "Pagado" : "Abonando",
  ]);

  autoTable(doc, {
    head,
    body,
    startY: 78,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8.5, cellPadding: 6, valign: "middle", lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: [13, 95, 61], textColor: 255, fontStyle: "bold", fontSize: 8.5, halign: "left" },
    alternateRowStyles: { fillColor: [240, 250, 244] },
    columnStyles: {
      0: { cellWidth: 190, fontStyle: "bold" },
      1: { cellWidth: 120, textColor: [21, 128, 61] },
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "right", fontStyle: "bold", textColor: [13, 95, 61] },
      5: { halign: "right", fontStyle: "bold" },
      6: { halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        const p = payments[data.row.index];
        if (!p) return;
        if (data.column.index === 5 && !p.fully_paid && p.real_debt > 0.01) {
          data.cell.styles.textColor = [190, 18, 60];
        }
        if (data.column.index === 6) {
          data.cell.styles.textColor = p.fully_paid ? [21, 128, 61] : [202, 138, 4];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const p = payments[data.row.index];
        const link = waLink(p && p.whatsapp);
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
  doc.setFillColor(13, 95, 61);
  doc.roundedRect(margin, y, pageW - margin * 2, 58, 8, 8, "F");
  doc.setTextColor(190, 230, 210);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RESUMEN", margin + 18, y + 20);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Clientes que abonaron: ${summary?.clients_count ?? payments.length}`, margin + 18, y + 40);
  doc.text(`Ya pagaron: ${summary?.fully_paid ?? 0}  ·  Aún deben: ${summary?.still_owing ?? 0}`, margin + 240, y + 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Total cobrado: ${fmtMoney(summary?.total_collected || 0)}`, pageW - margin - 18, y + 34, { align: "right" });

  y += 74;
  if (y < pageH - 20) {
    doc.setTextColor(120, 120, 140);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.text("Ordenado por pago más reciente primero · Toca el número de WhatsApp para abrir el chat.", margin, y);
  }

  const filename = `reporte_abonos_${Date.now()}.pdf`;
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
