// Bank-statement-style PDF generator (LANDSCAPE). Uses jsPDF + autotable.
// Header band with logo, account metadata, period summary cards, then a wide
// ledger table with Remitente / Destinatario columns and a running balance.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const fmtMoney = (v) =>
  `$${Number(v || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" }) +
      "\n" +
      d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return iso;
  }
};

const KIND_LABEL = {
  recharge: "Recarga cliente",
  manual_deposit: "Depósito manual",
  withdrawal: "Retiro",
};

const loadImage = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL("image/png"), width: img.naturalWidth, height: img.naturalHeight });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

export async function generateBankStatementPDF({ tenantName, tenantLogo, account, transactions, totals }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  // ── Header band (indigo) ─────────────────────────────────────────────
  doc.setFillColor(49, 46, 129); // indigo-900
  doc.rect(0, 0, pageW, 84, "F");

  const logo = await loadImage(tenantLogo);
  if (logo) {
    const targetH = 50;
    const ratio = logo.width / logo.height;
    const w = targetH * ratio;
    try {
      doc.addImage(logo.dataUrl, "PNG", margin, 17, w, targetH);
    } catch { /* ignore bad image */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("ESTADO DE CUENTA", pageW - margin, 36, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(tenantName || "", pageW - margin, 54, { align: "right" });
  const today = new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(`Emitido: ${today}`, pageW - margin, 70, { align: "right" });

  // ── Account metadata (left) + summary cards (right) on one band ──────
  let y = 108;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("INFORMACIÓN DE LA CUENTA", margin, y);
  doc.setDrawColor(220, 220, 230);
  doc.line(margin, y + 4, margin + 300, y + 4);

  doc.setFontSize(9);
  let my = y + 18;
  const meta = [
    ["Banco:", account.bank_name || "—"],
    ["Titular:", account.owner_name || "—"],
    ["Cédula / ID:", account.owner_id || "—"],
    ["Número de cuenta:", account.account_number || "—"],
    ["Moneda:", account.currency || "USD"],
  ];
  meta.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(k, margin, my);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), margin + 110, my);
    my += 14;
  });

  // Summary cards (right side)
  const boxes = [
    { label: "Saldo actual", value: fmtMoney(totals.balance), color: [99, 102, 241] },
    { label: "Recargas", value: fmtMoney(totals.total_recharges), color: [16, 185, 129] },
    { label: "Depósitos manuales", value: fmtMoney(totals.total_manual_deposits), color: [37, 99, 235] },
    { label: "Retiros", value: fmtMoney(totals.total_withdrawals), color: [220, 38, 38] },
  ];
  const cardsAreaX = margin + 340;
  const cardsAreaW = pageW - margin - cardsAreaX;
  const colW = (cardsAreaW - 18) / 4;
  boxes.forEach((b, i) => {
    const x = cardsAreaX + i * (colW + 6);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...b.color);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y - 2, colW, 56, 6, 6, "FD");
    doc.setTextColor(...b.color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(String(b.label).toUpperCase(), x + 8, y + 14);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13);
    doc.text(String(b.value), x + 8, y + 38);
  });

  y = Math.max(my, y + 56) + 14;

  // ── Ledger table (autotable) ─────────────────────────────────────────
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("MOVIMIENTOS", margin, y);
  doc.setDrawColor(220, 220, 230);
  doc.line(margin, y + 4, pageW - margin, y + 4);
  y += 10;

  // Running balance oldest→newest, then print newest→oldest.
  const sorted = [...(transactions || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  let running = 0;
  const withRunning = sorted.map((tx) => {
    const delta = tx.kind === "withdrawal" ? -tx.amount : tx.amount;
    running = Math.round((running + delta) * 100) / 100;
    return { ...tx, running };
  });
  const printRows = [...withRunning].reverse();

  const body = printRows.map((tx) => {
    const sign = tx.kind === "withdrawal" ? "−" : "+";
    const remitente = tx.remitente || (tx.kind === "recharge" ? (tx.customer_name || "—") : "—");
    const destinatario = tx.destinatario || (tx.kind === "recharge" ? (account.owner_name || "—") : "—");
    return [
      fmtDate(tx.created_at),
      KIND_LABEL[tx.kind] || tx.kind,
      String(tx.description || "—"),
      remitente,
      destinatario,
      String(tx.reference_number || "—"),
      `${sign}${fmtMoney(tx.amount)}`,
      fmtMoney(tx.running),
    ];
  });

  autoTable(doc, {
    head: [["FECHA", "TIPO", "DESCRIPCIÓN", "REMITENTE", "DESTINATARIO", "REF.", "MONTO", "SALDO"]],
    body: body.length ? body : [["—", "—", "Sin movimientos en el período", "—", "—", "—", "—", "—"]],
    startY: y,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 5, valign: "middle", lineColor: [233, 236, 243], lineWidth: 0.5, overflow: "linebreak" },
    headStyles: { fillColor: [49, 46, 129], textColor: 255, fontStyle: "bold", fontSize: 8, halign: "left" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 78 },
      1: { cellWidth: 82 },
      2: { cellWidth: 150 },
      3: { cellWidth: 120 },
      4: { cellWidth: 120 },
      5: { cellWidth: 70, textColor: [100, 116, 139] },
      6: { cellWidth: 70, halign: "right", fontStyle: "bold" },
      7: { halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        const tx = printRows[data.row.index];
        if (tx && data.column.index === 6) {
          data.cell.styles.textColor = tx.kind === "withdrawal" ? [220, 38, 38] : [16, 185, 129];
        }
      }
    },
  });

  // ── Footer on every page ─────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Estado de cuenta generado automáticamente por ${tenantName} · Página ${i} de ${pageCount}`,
      pageW / 2,
      pageH - 18,
      { align: "center" }
    );
    doc.text(
      "© Documento informativo. Para conciliación interna. Remitente/Destinatario leídos del comprobante.",
      pageW / 2,
      pageH - 8,
      { align: "center" }
    );
  }

  const safeName = (account.bank_name || "cuenta").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  doc.save(`estado_cuenta_${safeName}_${Date.now()}.pdf`);
}
