// Bank-statement-style PDF generator. Uses jsPDF (already in package.json).
// Layout intentionally mimics a real bank statement: header with logo, account
// metadata block, period summary, then a ledger table with running balance.
import jsPDF from "jspdf";

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
      " " +
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
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  // ── Header band (indigo) ─────────────────────────────────────────────
  doc.setFillColor(49, 46, 129); // indigo-900
  doc.rect(0, 0, pageW, 90, "F");

  // Logo (optional)
  const logo = await loadImage(tenantLogo);
  if (logo) {
    const targetH = 56;
    const ratio = logo.width / logo.height;
    const w = targetH * ratio;
    try {
      doc.addImage(logo.dataUrl, "PNG", margin, 17, w, targetH);
    } catch { /* ignore bad image */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("ESTADO DE CUENTA", pageW - margin, 38, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(tenantName || "", pageW - margin, 56, { align: "right" });
  const today = new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(`Emitido: ${today}`, pageW - margin, 72, { align: "right" });

  // ── Account metadata block ───────────────────────────────────────────
  let y = 120;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("INFORMACIÓN DE LA CUENTA", margin, y);
  doc.setDrawColor(220, 220, 230);
  doc.line(margin, y + 4, pageW - margin, y + 4);
  y += 18;

  doc.setFontSize(9);
  const meta = [
    ["Banco:", account.bank_name || "—"],
    ["Titular:", account.owner_name || "—"],
    ["Cédula / ID:", account.owner_id || "—"],
    ["Número de cuenta:", account.account_number || "—"],
    ["Moneda:", account.currency || "USD"],
  ];
  meta.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(k, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), margin + 110, y);
    y += 14;
  });

  // ── Period summary cards ─────────────────────────────────────────────
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("RESUMEN DEL PERÍODO", margin, y);
  doc.line(margin, y + 4, pageW - margin, y + 4);
  y += 14;

  const boxes = [
    { label: "Saldo actual", value: fmtMoney(totals.balance), color: [99, 102, 241] },
    { label: "Recargas", value: fmtMoney(totals.total_recharges), color: [16, 185, 129] },
    { label: "Depósitos manuales", value: fmtMoney(totals.total_manual_deposits), color: [37, 99, 235] },
    { label: "Retiros", value: fmtMoney(totals.total_withdrawals), color: [220, 38, 38] },
  ];
  const colW = (pageW - margin * 2 - 18) / 4;
  boxes.forEach((b, i) => {
    const x = margin + i * (colW + 6);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...b.color);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y, colW, 52, 6, 6, "FD");
    doc.setTextColor(...b.color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(String(b.label).toUpperCase(), x + 8, y + 14);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13);
    doc.text(String(b.value), x + 8, y + 36);
  });
  y += 70;

  // ── Ledger table ─────────────────────────────────────────────────────
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("MOVIMIENTOS", margin, y);
  doc.line(margin, y + 4, pageW - margin, y + 4);
  y += 12;

  // Compute running balance oldest→newest
  const sorted = [...(transactions || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  let running = 0;
  const rows = sorted.map((tx) => {
    const delta = tx.kind === "withdrawal" ? -tx.amount : tx.amount;
    running = Math.round((running + delta) * 100) / 100;
    return { ...tx, running };
  });

  // Header row
  const colX = {
    date: margin,
    kind: margin + 90,
    desc: margin + 175,
    ref: pageW - margin - 180,
    amount: pageW - margin - 95,
    balance: pageW - margin - 8,
  };
  const drawTableHeader = (yy) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, yy - 10, pageW - margin * 2, 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("FECHA", colX.date, yy);
    doc.text("TIPO", colX.kind, yy);
    doc.text("DESCRIPCIÓN", colX.desc, yy);
    doc.text("REF.", colX.ref, yy);
    doc.text("MONTO", colX.amount, yy, { align: "right" });
    doc.text("SALDO", colX.balance, yy, { align: "right" });
  };
  drawTableHeader(y);
  y += 12;

  if (rows.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text("Sin movimientos en el período", pageW / 2, y + 20, { align: "center" });
  } else {
    // Walk newest→oldest for the printed report (standard bank statement order)
    const printRows = [...rows].reverse();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    for (const tx of printRows) {
      // Page break
      if (y > pageH - 60) {
        doc.addPage();
        y = margin + 10;
        drawTableHeader(y);
        y += 12;
      }
      const sign = tx.kind === "withdrawal" ? "−" : "+";
      const amountStr = `${sign}${fmtMoney(tx.amount)}`;
      const desc = String(tx.description || "—");
      const descShort = desc.length > 38 ? desc.substring(0, 36) + "…" : desc;

      doc.setTextColor(15, 23, 42);
      doc.text(fmtDate(tx.created_at), colX.date, y);
      doc.text(KIND_LABEL[tx.kind] || tx.kind, colX.kind, y);
      doc.text(descShort, colX.desc, y);
      doc.text(String(tx.reference_number || "—"), colX.ref, y);

      doc.setTextColor(...(tx.kind === "withdrawal" ? [220, 38, 38] : [16, 185, 129]));
      doc.text(amountStr, colX.amount, y, { align: "right" });

      doc.setTextColor(15, 23, 42);
      doc.text(fmtMoney(tx.running), colX.balance, y, { align: "right" });
      y += 14;

      // Row separator
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y - 6, pageW - margin, y - 6);
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────
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
      "© Documento informativo. Para conciliación interna.",
      pageW / 2,
      pageH - 8,
      { align: "center" }
    );
  }

  const safeName = (account.bank_name || "cuenta").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  doc.save(`estado_cuenta_${safeName}_${Date.now()}.pdf`);
}
