"""
Unit-style test for recalculate_client_invoices.
Simulates the carry logic to verify saldo_pendiente propagates correctly
when an intermediate invoice is annulled.
"""


def simulate_chain(invoices, deposits_by_inv):
    """Mirrors the carry logic in server.recalculate_client_invoices."""
    carry_saldo_a_favor = 0
    carry_saldo_pendiente = None
    out = []
    for inv in invoices:
        deps = deposits_by_inv.get(inv["id"], [])
        total_deposits = round(sum(d for d in deps), 2)
        if carry_saldo_pendiente is None:
            saldo_pendiente_dyn = round(float(inv.get("saldo_pendiente", 0) or 0), 2)
        else:
            saldo_pendiente_dyn = round(float(carry_saldo_pendiente), 2)
        inv_total = inv["total"] + saldo_pendiente_dyn + inv.get("shipping_cost", 0)
        saldo_ant = carry_saldo_a_favor
        total_credits = total_deposits + saldo_ant
        if total_credits >= inv_total:
            total_a_pagar = 0
            saldo_a_favor = round(total_credits - inv_total, 2)
        else:
            total_a_pagar = round(inv_total - total_credits, 2)
            saldo_a_favor = 0
        carry_saldo_a_favor = saldo_a_favor
        carry_saldo_pendiente = total_a_pagar
        out.append({
            "id": inv["id"],
            "saldo_pendiente": saldo_pendiente_dyn,
            "total_a_pagar": total_a_pagar,
            "saldo_a_favor": saldo_a_favor,
        })
    return out


def test_user_scenario_annul_middle_invoice():
    """User scenario:
       F1 total $50  -> debt $50
       F2 total $30  -> inherits $50 -> debt $80
       F3 total $40  -> inherits $80 -> debt $120
       Annul F2 -> F3 must inherit $50 directly from F1.
    """
    # Before annul: full chain
    invoices_full = [
        {"id": "F1", "total": 50, "saldo_pendiente": 0},
        {"id": "F2", "total": 30, "saldo_pendiente": 50},
        {"id": "F3", "total": 40, "saldo_pendiente": 80},
    ]
    res = simulate_chain(invoices_full, {})
    assert res[0]["total_a_pagar"] == 50
    assert res[1]["total_a_pagar"] == 80
    assert res[2]["total_a_pagar"] == 120
    print("[OK] Pre-annul chain: F1=$50 / F2=$80 / F3=$120")

    # After annul F2 -> exclude it
    invoices_annulled = [i for i in invoices_full if i["id"] != "F2"]
    res2 = simulate_chain(invoices_annulled, {})
    assert res2[0]["total_a_pagar"] == 50
    assert res2[1]["saldo_pendiente"] == 50, f"Expected F3 to inherit $50, got {res2[1]['saldo_pendiente']}"
    assert res2[1]["total_a_pagar"] == 90, f"Expected F3 total $90, got {res2[1]['total_a_pagar']}"
    print(f"[OK] Post-annul: F1=$50, F3 inherits ${res2[1]['saldo_pendiente']} -> total ${res2[1]['total_a_pagar']}")


def test_with_deposit_on_f2():
    """If a $30 deposit was applied targeted to F2, after annul it cascades to F3."""
    invoices_full = [
        {"id": "F1", "total": 50, "saldo_pendiente": 0},
        {"id": "F3", "total": 40, "saldo_pendiente": 80},
    ]
    # $30 deposit ends up assigned to whatever invoice was latest at deposit time
    # After annul: assume the deposit reassigns to F3 (newest live)
    res = simulate_chain(invoices_full, {"F3": [30]})
    assert res[1]["total_a_pagar"] == 60, f"Expected F3 total $60 with $30 dep, got {res[1]['total_a_pagar']}"
    print(f"[OK] With $30 deposit on F3: total a pagar = ${res[1]['total_a_pagar']}")


def test_saldo_a_favor_carry():
    """Excess deposit on F1 carries forward as saldo_a_favor."""
    invoices = [
        {"id": "F1", "total": 50, "saldo_pendiente": 0},
        {"id": "F2", "total": 30, "saldo_pendiente": 50},
    ]
    # $80 deposit on F1 -> F1 fully paid, +$30 leftover -> applied to F2 reducing dyn from $0 (since F1 total_a_pagar=0)
    res = simulate_chain(invoices, {"F1": [80]})
    assert res[0]["total_a_pagar"] == 0
    assert res[0]["saldo_a_favor"] == 30
    # F2 inherits saldo_pendiente=0 (F1 paid) and saldo_a_favor_anterior=$30
    assert res[1]["saldo_pendiente"] == 0, f"Got {res[1]['saldo_pendiente']}"
    assert res[1]["total_a_pagar"] == 0  # 30 - 30 = 0
    assert res[1]["saldo_a_favor"] == 0
    print(f"[OK] Saldo a favor carries: F1 paid + $30 leftover; F2 net = $0")


if __name__ == "__main__":
    test_user_scenario_annul_middle_invoice()
    test_with_deposit_on_f2()
    test_saldo_a_favor_carry()
    print("\n✅ All recalc-chain tests passed")
