import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Landmark,
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  RefreshCw,
  AlertCircle,
  Wallet,
  TrendingUp,
  TrendingDown,
  ReceiptText,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import {
  getBankAccountsSummary,
  getBankAccountTransactions,
  manualBankDeposit,
  manualBankWithdrawal,
  backfillBankAccountRecharges,
  listUnassignedRecharges,
  assignBankAccountToRecharge,
} from "@/lib/api";
import { generateBankStatementPDF } from "@/lib/bankStatementPDF";

const fmtMoney = (v) => `$${Number(v || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

const kindMeta = {
  recharge: { label: "Recarga cliente", color: "text-emerald-700 bg-emerald-50 border-emerald-200", sign: "+" },
  manual_deposit: { label: "Depósito manual", color: "text-blue-700 bg-blue-50 border-blue-200", sign: "+" },
  withdrawal: { label: "Retiro", color: "text-red-700 bg-red-50 border-red-200", sign: "−" },
};

export default function AdminBankAccounts() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [ledger, setLedger] = useState({ transactions: [], balance: 0 });
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [form, setForm] = useState({ amount: "", description: "", reference_number: "" });
  const [submitting, setSubmitting] = useState(false);
  // ── Unassigned recharges (depósitos sin cuenta identificada) ──
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [unassignedData, setUnassignedData] = useState({ unassigned: [], accounts: [], total: 0 });
  const [unassignedLoading, setUnassignedLoading] = useState(false);
  // Per-row pending choice {tx_id: accountId} before pressing "Asignar"
  const [pendingAssign, setPendingAssign] = useState({});

  const loadSummary = async () => {
    setLoading(true);
    try {
      const res = await getBankAccountsSummary();
      setSummary(res.data);
      if (!selected && res.data.accounts?.length > 0) {
        setSelected(res.data.accounts[0]);
      } else if (selected) {
        const next = res.data.accounts.find((a) => a.id === selected.id);
        if (next) setSelected(next);
      }
    } catch (e) {
      toast.error("Error al cargar cuentas");
    } finally {
      setLoading(false);
    }
  };

  const loadLedger = async (accountId) => {
    if (!accountId) return;
    setLedgerLoading(true);
    try {
      const res = await getBankAccountTransactions(accountId);
      setLedger(res.data);
    } catch (e) {
      toast.error("Error al cargar movimientos");
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => { loadSummary(); }, []);
  useEffect(() => { if (selected?.id) loadLedger(selected.id); }, [selected?.id]);

  const openDeposit = () => {
    setForm({ amount: "", description: "", reference_number: "" });
    setDepositOpen(true);
  };
  const openWithdrawal = () => {
    setForm({ amount: "", description: "", reference_number: "" });
    setWithdrawalOpen(true);
  };

  const submitDeposit = async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) {
      toast.error("Ingresa un monto mayor a 0");
      return;
    }
    setSubmitting(true);
    try {
      await manualBankDeposit(selected.id, {
        amount: amt,
        description: form.description,
        reference_number: form.reference_number,
      });
      toast.success("Depósito registrado");
      setDepositOpen(false);
      await Promise.all([loadSummary(), loadLedger(selected.id)]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al registrar depósito");
    } finally {
      setSubmitting(false);
    }
  };

  const submitWithdrawal = async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) {
      toast.error("Ingresa un monto mayor a 0");
      return;
    }
    setSubmitting(true);
    try {
      await manualBankWithdrawal(selected.id, {
        amount: amt,
        description: form.description,
        reference_number: form.reference_number,
      });
      toast.success("Retiro registrado");
      setWithdrawalOpen(false);
      await Promise.all([loadSummary(), loadLedger(selected.id)]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al registrar retiro");
    } finally {
      setSubmitting(false);
    }
  };

  // Assign all historical approved recharges (without bank_account_id) to the
  // currently selected account. Useful right after configuring bank accounts.
  const handleBackfill = async () => {
    if (!selected) return;
    const unassigned = summary?.unassigned_recharges_count || 0;
    if (unassigned === 0) {
      toast.info("No hay recargas sin asignar");
      return;
    }
    const ok = window.confirm(
      `¿Asignar las ${unassigned} recargas históricas a "${selected.bank_name} - ${selected.owner_name}"? Esta acción se puede revertir reasignando individualmente.`
    );
    if (!ok) return;
    try {
      const res = await backfillBankAccountRecharges(selected.id);
      toast.success(`${res.data.assigned_count} recargas asignadas`);
      await Promise.all([loadSummary(), loadLedger(selected.id)]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al asignar recargas");
    }
  };

  const openUnassigned = async () => {
    setUnassignedOpen(true);
    setUnassignedLoading(true);
    try {
      const res = await listUnassignedRecharges();
      setUnassignedData(res.data);
      // Pre-fill suggestions so user can press "Asignar" with one click.
      const initial = {};
      (res.data.unassigned || []).forEach((tx) => {
        if (tx.suggested_bank_account_id) initial[tx.id] = tx.suggested_bank_account_id;
      });
      setPendingAssign(initial);
    } catch (e) {
      toast.error("Error al cargar recargas sin asignar");
    } finally {
      setUnassignedLoading(false);
    }
  };

  const assignSingleRecharge = async (txId) => {
    const accountId = pendingAssign[txId];
    if (!accountId) {
      toast.error("Selecciona una cuenta primero");
      return;
    }
    try {
      await assignBankAccountToRecharge(txId, accountId);
      toast.success("Recarga asignada");
      // Remove from local list immediately
      setUnassignedData((prev) => ({
        ...prev,
        unassigned: prev.unassigned.filter((t) => t.id !== txId),
        total: Math.max(0, (prev.total || 0) - 1),
      }));
      setPendingAssign((prev) => {
        const cp = { ...prev };
        delete cp[txId];
        return cp;
      });
      // Refresh summary + the selected account ledger silently
      loadSummary();
      if (selected?.id === accountId) loadLedger(accountId);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al asignar");
    }
  };

  const exportPDF = () => {
    if (!selected) return;
    try {
      generateBankStatementPDF({
        tenantName: summary?.tenant_name || "",
        tenantLogo: summary?.tenant_logo || null,
        account: selected,
        transactions: ledger.transactions || [],
        totals: {
          balance: ledger.balance,
          total_recharges: ledger.total_recharges,
          total_manual_deposits: ledger.total_manual_deposits,
          total_withdrawals: ledger.total_withdrawals,
        },
      });
      toast.success("PDF generado");
    } catch (e) {
      console.error(e);
      toast.error("Error al generar PDF");
    }
  };

  // Compute running balance for the ledger view (newest at top → oldest at bottom).
  // We walk oldest→newest to accumulate, then reverse for display.
  const ledgerWithBalance = (() => {
    const txs = [...(ledger.transactions || [])].reverse(); // oldest first
    let acc = 0;
    const out = txs.map((t) => {
      const delta = t.kind === "withdrawal" ? -t.amount : t.amount;
      acc = Math.round((acc + delta) * 100) / 100;
      return { ...t, running_balance: acc };
    });
    return out.reverse();
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-slate-50 pb-12">
      {/* Header — banking-style hero */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin")}
              className="text-white hover:bg-white/10"
              data-testid="back-btn"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
                <Landmark className="h-6 w-6" />
                Cuentas
              </h1>
              <p className="text-xs text-indigo-200">Banca en línea · {summary?.tenant_name || ""}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadSummary}
            className="text-white hover:bg-white/10"
            data-testid="refresh-btn"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Actualizar
          </Button>
        </div>
        {/* Grand-balance hero */}
        <div className="max-w-6xl mx-auto px-4 pb-6">
          <p className="text-xs uppercase tracking-widest text-indigo-200">Saldo total disponible</p>
          <p className="text-4xl font-black mt-1" data-testid="grand-balance">
            {fmtMoney(summary?.grand_balance)}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-indigo-200">
            <span>{summary?.accounts?.length || 0} cuenta{(summary?.accounts?.length || 0) === 1 ? "" : "s"} activas</span>
            {summary?.unassigned_recharges_count > 0 && (
              <div className="inline-flex items-center gap-2" data-testid="unassigned-warning">
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <AlertCircle className="h-3 w-3" />
                  {summary.unassigned_recharges_count} recarga(s) sin cuenta asignada
                </span>
                <button
                  type="button"
                  onClick={openUnassigned}
                  className="text-xs font-semibold underline text-amber-200 hover:text-white transition-colors"
                  data-testid="open-unassigned-btn"
                  title="Asignar cuenta a cada recarga manualmente"
                >
                  Revisar y asignar →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-4">
        {loading ? (
          <Card className="rounded-2xl">
            <CardContent className="py-12 text-center text-slate-500">Cargando…</CardContent>
          </Card>
        ) : (summary?.accounts || []).length === 0 ? (
          <Card className="rounded-2xl border-dashed border-2 border-indigo-200">
            <CardContent className="py-12 text-center">
              <Landmark className="h-12 w-12 mx-auto text-indigo-300 mb-3" />
              <p className="text-lg font-bold text-slate-800">Aún no tienes cuentas configuradas</p>
              <p className="text-sm text-slate-500 mt-1">
                Pídele al Superadmin que configure las cuentas bancarias de la empresa.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Account cards (banking style) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              {(summary?.accounts || []).map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setSelected(acc)}
                  className={`text-left rounded-2xl p-4 shadow-sm transition-all border-2 ${
                    selected?.id === acc.id
                      ? "border-indigo-500 bg-white shadow-indigo-100"
                      : "border-slate-200 bg-white hover:border-indigo-300"
                  }`}
                  data-testid={`account-card-${acc.id}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{acc.bank_name}</p>
                      <p className="text-sm font-bold text-slate-800">{acc.owner_name}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase border-indigo-200 text-indigo-700">
                      {acc.currency || "USD"}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-slate-600 mb-3">
                    •••• {String(acc.account_number).slice(-4)}
                  </p>
                  <p className="text-2xl font-black text-slate-900">{fmtMoney(acc.balance)}</p>
                  <div className="mt-2 flex gap-2 text-[10px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-emerald-600" />
                      {fmtMoney(acc.total_recharges + acc.total_manual_deposits)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <TrendingDown className="h-3 w-3 text-red-500" />
                      {fmtMoney(acc.total_withdrawals)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Selected account ledger */}
            {selected && (
              <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-indigo-600" />
                        Movimientos · {selected.bank_name} · {selected.owner_name}
                      </CardTitle>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">N° {selected.account_number}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={openDeposit}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg gap-1"
                        data-testid="open-deposit-btn"
                      >
                        <ArrowDownToLine className="h-4 w-4" />
                        Depósito
                      </Button>
                      <Button
                        size="sm"
                        onClick={openWithdrawal}
                        className="bg-red-600 hover:bg-red-700 text-white rounded-lg gap-1"
                        data-testid="open-withdrawal-btn"
                      >
                        <ArrowUpFromLine className="h-4 w-4" />
                        Retiro
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={exportPDF}
                        className="rounded-lg border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1"
                        data-testid="export-pdf-btn"
                      >
                        <Download className="h-4 w-4" />
                        PDF
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Mini KPI strip */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] uppercase font-bold text-slate-500">Saldo</p>
                      <p className="text-lg font-extrabold text-slate-900" data-testid="ledger-balance">{fmtMoney(ledger.balance)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-3">
                      <p className="text-[10px] uppercase font-bold text-emerald-700">Recargas</p>
                      <p className="text-lg font-extrabold text-emerald-800">{fmtMoney(ledger.total_recharges)}</p>
                      <p className="text-[10px] text-emerald-600">{ledger.recharge_count || 0} mov.</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-3">
                      <p className="text-[10px] uppercase font-bold text-blue-700">Depósitos</p>
                      <p className="text-lg font-extrabold text-blue-800">{fmtMoney(ledger.total_manual_deposits)}</p>
                      <p className="text-[10px] text-blue-600">{ledger.manual_deposit_count || 0} mov.</p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-3">
                      <p className="text-[10px] uppercase font-bold text-red-700">Retiros</p>
                      <p className="text-lg font-extrabold text-red-800">{fmtMoney(ledger.total_withdrawals)}</p>
                      <p className="text-[10px] text-red-600">{ledger.withdrawal_count || 0} mov.</p>
                    </div>
                  </div>

                  {/* Ledger table — banking style */}
                  <ScrollArea className="h-[460px] rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600">
                        <tr>
                          <th className="text-left px-3 py-2">Fecha</th>
                          <th className="text-left px-3 py-2">Concepto</th>
                          <th className="text-left px-3 py-2 hidden md:table-cell">Ref.</th>
                          <th className="text-right px-3 py-2">Monto</th>
                          <th className="text-right px-3 py-2 hidden md:table-cell">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerLoading ? (
                          <tr><td colSpan={5} className="text-center py-8 text-slate-400">Cargando movimientos…</td></tr>
                        ) : ledgerWithBalance.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-12 text-slate-400">
                            <ReceiptText className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                            Sin movimientos
                          </td></tr>
                        ) : (
                          ledgerWithBalance.map((tx) => {
                            const meta = kindMeta[tx.kind] || kindMeta.recharge;
                            return (
                              <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`ledger-row-${tx.id}`}>
                                <td className="px-3 py-2 text-slate-700 text-xs whitespace-nowrap">{fmtDate(tx.created_at)}</td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-col">
                                    <Badge variant="outline" className={`text-[10px] w-fit ${meta.color}`}>{meta.label}</Badge>
                                    <span className="text-xs text-slate-700 mt-1">{tx.description || "—"}</span>
                                    {tx.customer_name && (
                                      <span className="text-[10px] text-slate-500">Cliente: {tx.customer_name}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-600 font-mono hidden md:table-cell">
                                  {tx.reference_number || "—"}
                                </td>
                                <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${tx.kind === "withdrawal" ? "text-red-600" : "text-emerald-700"}`}>
                                  {meta.sign}{fmtMoney(tx.amount)}
                                </td>
                                <td className="px-3 py-2 text-right text-xs text-slate-600 hidden md:table-cell whitespace-nowrap">
                                  {fmtMoney(tx.running_balance)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Deposit Dialog */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
              Depósito manual
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-slate-500">
              Registra dinero que entró a esta cuenta sin ser una recarga de cliente (ej: transferencia propia, aporte de capital, etc).
            </p>
            <div>
              <Label className="text-xs font-semibold">Monto (USD)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                className="h-10 rounded-lg font-bold"
                data-testid="deposit-amount-input"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Descripción</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ej: Aporte de socio"
                className="h-10 rounded-lg"
                data-testid="deposit-description-input"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Referencia (opcional)</Label>
              <Input
                value={form.reference_number}
                onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                placeholder="N° comprobante"
                className="h-10 rounded-lg font-mono"
                data-testid="deposit-ref-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDepositOpen(false)}>Cancelar</Button>
              <Button
                onClick={submitDeposit}
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="submit-deposit-btn"
              >
                {submitting ? "Guardando…" : "Registrar depósito"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Withdrawal Dialog */}
      <Dialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpFromLine className="h-5 w-5 text-red-600" />
              Retiro
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-slate-500">
              Registra una salida de dinero de esta cuenta (pago a proveedor, transferencia, gasto, etc).
            </p>
            <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              Saldo actual: <strong>{fmtMoney(ledger.balance)}</strong>
            </div>
            <div>
              <Label className="text-xs font-semibold">Monto (USD)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                className="h-10 rounded-lg font-bold"
                data-testid="withdrawal-amount-input"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Descripción</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ej: Pago a paquetería"
                className="h-10 rounded-lg"
                data-testid="withdrawal-description-input"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Referencia (opcional)</Label>
              <Input
                value={form.reference_number}
                onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                placeholder="N° comprobante"
                className="h-10 rounded-lg font-mono"
                data-testid="withdrawal-ref-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setWithdrawalOpen(false)}>Cancelar</Button>
              <Button
                onClick={submitWithdrawal}
                disabled={submitting}
                className="bg-red-600 hover:bg-red-700 text-white"
                data-testid="submit-withdrawal-btn"
              >
                {submitting ? "Guardando…" : "Registrar retiro"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Unassigned Recharges Dialog ──
          Shows every approved deposit that the AI couldn't match to one of the
          configured bank accounts. For each row we suggest the most likely
          account (when matchable) and let the admin confirm or override with
          a dropdown of every active account. */}
      <Dialog open={unassignedOpen} onOpenChange={setUnassignedOpen}>
        <DialogContent className="rounded-2xl max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-amber-600" />
              Recargas sin cuenta identificada
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-1">
              La IA no pudo identificar la cuenta bancaria para estos depósitos. Asígnale manualmente la cuenta correcta a cada uno.
            </p>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {unassignedLoading ? (
              <div className="text-center py-8 text-slate-500">Cargando…</div>
            ) : unassignedData.unassigned.length === 0 ? (
              <div className="text-center py-12 bg-emerald-50 rounded-xl border border-emerald-100">
                <Sparkles className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
                <p className="font-bold text-emerald-800">Todas las recargas tienen cuenta asignada</p>
                <p className="text-xs text-emerald-700 mt-1">Excelente. No queda nada por revisar.</p>
              </div>
            ) : (
              unassignedData.unassigned.map((tx) => (
                <div
                  key={tx.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                  data-testid={`unassigned-row-${tx.id}`}
                >
                  <div className="md:col-span-3">
                    <p className="text-xs font-bold text-slate-800">{tx.user_name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">#{tx.customer_id}</p>
                    <p className="text-[10px] text-slate-500">
                      {tx.approved_at
                        ? new Date(tx.approved_at).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })
                        : ""}
                    </p>
                    <p className="text-lg font-extrabold text-amber-700">{fmtMoney(tx.amount)}</p>
                  </div>
                  <div className="md:col-span-5 text-xs">
                    <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Detectado por IA</p>
                    <div className="space-y-0.5 text-slate-700">
                      <p>
                        <span className="font-bold">Cuenta destino:</span>{" "}
                        <span className="font-mono">{tx.ai_detected_destination_account || "—"}</span>
                      </p>
                      <p>
                        <span className="font-bold">Beneficiario:</span>{" "}
                        {tx.ai_detected_beneficiary_name || "—"}
                      </p>
                      <p>
                        <span className="font-bold">Referencia:</span>{" "}
                        <span className="font-mono">{tx.reference_number || tx.ai_detected_reference_number || "—"}</span>
                      </p>
                    </div>
                  </div>
                  <div className="md:col-span-4 flex flex-col gap-2">
                    <select
                      value={pendingAssign[tx.id] || ""}
                      onChange={(e) => setPendingAssign((p) => ({ ...p, [tx.id]: e.target.value }))}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-xs font-medium"
                      data-testid={`assign-select-${tx.id}`}
                    >
                      <option value="">Selecciona una cuenta…</option>
                      {unassignedData.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bank_name} · {a.owner_name} · ••{String(a.account_number).slice(-4)}
                        </option>
                      ))}
                    </select>
                    {tx.suggested_bank_account_id && (
                      <p className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        Sugerido: {unassignedData.accounts.find((a) => a.id === tx.suggested_bank_account_id)?.bank_name}
                      </p>
                    )}
                    <Button
                      size="sm"
                      onClick={() => assignSingleRecharge(tx.id)}
                      className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg h-8 text-xs"
                      disabled={!pendingAssign[tx.id]}
                      data-testid={`assign-btn-${tx.id}`}
                    >
                      Asignar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 mt-3">
            <Button variant="outline" onClick={() => setUnassignedOpen(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
