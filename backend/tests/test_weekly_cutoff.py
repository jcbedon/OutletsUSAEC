"""
Unit tests for the Weekly Recharge Cutoff feature.
Verifies that recharges are assigned to the invoice that belongs to the same
Mon–Sun America/Chicago billing week.
"""
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

# Import module under test
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import (  # noqa: E402
    _parse_iso_utc,
    _billing_week_bounds,
    WEEKLY_CUTOFF_TZ,
    WEEKLY_CUTOFF_EFFECTIVE_FROM,
)

CHI = ZoneInfo("America/Chicago")


def test_parse_iso_utc_handles_naive_string():
    dt = _parse_iso_utc("2026-02-16T12:00:00")
    assert dt is not None
    assert dt.tzinfo is not None
    assert dt.hour == 12  # naive assumed UTC


def test_parse_iso_utc_handles_z_suffix():
    dt = _parse_iso_utc("2026-02-16T12:00:00Z")
    assert dt.tzinfo is not None
    assert dt.hour == 12


def test_parse_iso_utc_returns_none_for_empty():
    assert _parse_iso_utc("") is None
    assert _parse_iso_utc(None) is None


def test_billing_week_starts_monday_chicago():
    # Tuesday Feb 17 2026 15:00 Chicago
    tue = datetime(2026, 2, 17, 15, 0, 0, tzinfo=CHI).astimezone(timezone.utc)
    wk_start, wk_end = _billing_week_bounds(tue)
    wk_start_local = wk_start.astimezone(CHI)
    wk_end_local = wk_end.astimezone(CHI)
    assert wk_start_local.weekday() == 0  # Monday
    assert wk_start_local.hour == 0
    assert wk_start_local.minute == 0
    assert wk_end_local.weekday() == 6  # Sunday
    assert wk_end_local.hour == 23
    assert wk_end_local.minute == 59


def test_billing_week_sunday_before_midnight_belongs_to_current_week():
    # Sunday Feb 22 2026 23:30 Chicago -> week Feb 16–22
    sun_late = datetime(2026, 2, 22, 23, 30, 0, tzinfo=CHI).astimezone(timezone.utc)
    wk_start, wk_end = _billing_week_bounds(sun_late)
    assert wk_start.astimezone(CHI).date() == datetime(2026, 2, 16).date()
    assert wk_end.astimezone(CHI).date() == datetime(2026, 2, 22).date()
    assert wk_start <= sun_late <= wk_end


def test_billing_week_monday_00_belongs_to_new_week():
    # Monday Feb 23 2026 00:30 Chicago -> week Feb 23 – Mar 1 (not the previous)
    mon_early = datetime(2026, 2, 23, 0, 30, 0, tzinfo=CHI).astimezone(timezone.utc)
    wk_start, wk_end = _billing_week_bounds(mon_early)
    assert wk_start.astimezone(CHI).date() == datetime(2026, 2, 23).date()
    assert wk_end.astimezone(CHI).date() == datetime(2026, 3, 1).date()


def test_cutoff_date_is_monday_feb_16_2026_chicago():
    assert WEEKLY_CUTOFF_EFFECTIVE_FROM.tzinfo is not None
    local = WEEKLY_CUTOFF_EFFECTIVE_FROM.astimezone(CHI)
    assert local.year == 2026 and local.month == 2 and local.day == 16
    assert local.hour == 0 and local.minute == 0
    assert local.weekday() == 0  # Monday


# ==================== Simulated assignment logic tests ====================
# These simulate the deposit->invoice assignment branch inside
# recalculate_client_invoices without hitting Mongo.

def _assign_deposit(dep_iso, invoices):
    """Replicates the new/legacy assignment branch for a single deposit."""
    dep_dt = _parse_iso_utc(dep_iso)
    if dep_dt and dep_dt >= WEEKLY_CUTOFF_EFFECTIVE_FROM:
        wk_start, wk_end = _billing_week_bounds(dep_dt)
        week_invs = [
            inv for inv in invoices
            if wk_start <= _parse_iso_utc(inv["created_at"]) <= wk_end
        ]
        if week_invs:
            target = None
            for inv in week_invs:
                if _parse_iso_utc(inv["created_at"]) <= dep_dt:
                    target = inv
                else:
                    break
            return target or week_invs[0]
        for inv in invoices:
            if _parse_iso_utc(inv["created_at"]) > wk_end:
                return inv
        return None  # float
    # legacy
    target = None
    for inv in invoices:
        if inv["created_at"] <= dep_iso:
            target = inv
        else:
            break
    return target or invoices[0]


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def test_monday_recharge_before_first_monday_invoice_floats():
    """
    Given: Sunday invoice exists in week 1. Client recharges Monday 09:00
           before any invoice exists in week 2. Result must be: deposit floats
           (returns None) — it does NOT bleed back to Sunday's invoice.
    """
    sun_inv_dt = datetime(2026, 2, 22, 10, 0, 0, tzinfo=CHI)
    mon_recharge_dt = datetime(2026, 2, 23, 9, 0, 0, tzinfo=CHI)
    invoices = [{"id": "invA", "created_at": _iso(sun_inv_dt)}]
    target = _assign_deposit(_iso(mon_recharge_dt), invoices)
    assert target is None, "Recharge should float, not attach to previous week's invoice"


def test_monday_recharge_absorbed_by_monday_invoice_created_later():
    """
    Given: Monday 09:00 recharge (float). Later Monday 15:00 an invoice is
           created in the SAME week 2. Recharge must attach to that new invoice.
    """
    sun_inv_dt = datetime(2026, 2, 22, 10, 0, 0, tzinfo=CHI)
    mon_recharge_dt = datetime(2026, 2, 23, 9, 0, 0, tzinfo=CHI)
    mon_inv_dt = datetime(2026, 2, 24, 15, 0, 0, tzinfo=CHI)
    invoices = [
        {"id": "invA", "created_at": _iso(sun_inv_dt)},
        {"id": "invB", "created_at": _iso(mon_inv_dt)},
    ]
    target = _assign_deposit(_iso(mon_recharge_dt), invoices)
    assert target["id"] == "invB"


def test_sunday_late_recharge_still_goes_to_sunday_invoice():
    """
    Given: Sunday 10:00 invoice + Sunday 23:00 recharge (same week).
           Recharge must attach to Sunday's invoice.
    """
    sun_inv_dt = datetime(2026, 2, 22, 10, 0, 0, tzinfo=CHI)
    sun_recharge_dt = datetime(2026, 2, 22, 23, 0, 0, tzinfo=CHI)
    invoices = [{"id": "invA", "created_at": _iso(sun_inv_dt)}]
    target = _assign_deposit(_iso(sun_recharge_dt), invoices)
    assert target["id"] == "invA"


def test_legacy_recharge_before_cutoff_uses_old_logic():
    """
    Given: Recharge dated BEFORE Feb 16 2026 Chicago. It must attach to
           the latest previous invoice regardless of week.
    """
    old_inv_dt = datetime(2026, 2, 1, 10, 0, 0, tzinfo=CHI)
    old_recharge_dt = datetime(2026, 2, 5, 9, 0, 0, tzinfo=CHI)
    invoices = [{"id": "invOld", "created_at": _iso(old_inv_dt)}]
    target = _assign_deposit(_iso(old_recharge_dt), invoices)
    assert target["id"] == "invOld"


def test_multiple_invoices_same_week_recharge_attaches_to_latest_prior():
    """
    Given: Mon and Wed invoices in same week. Recharge on Thu.
           Must attach to Wed invoice (latest prior in same week).
    """
    mon_inv = datetime(2026, 2, 23, 10, 0, tzinfo=CHI)
    wed_inv = datetime(2026, 2, 25, 10, 0, tzinfo=CHI)
    thu_recharge = datetime(2026, 2, 26, 15, 0, tzinfo=CHI)
    invoices = [
        {"id": "invMon", "created_at": _iso(mon_inv)},
        {"id": "invWed", "created_at": _iso(wed_inv)},
    ]
    target = _assign_deposit(_iso(thu_recharge), invoices)
    assert target["id"] == "invWed"


def test_recharge_no_invoice_this_week_absorbed_by_future_invoice():
    """
    Given: Recharge on Tuesday of week 2. No invoice in week 2. Invoice in
           week 3 exists. Must attach to that future invoice.
    """
    tue_recharge = datetime(2026, 2, 24, 15, 0, tzinfo=CHI)
    week3_inv = datetime(2026, 3, 3, 10, 0, tzinfo=CHI)
    invoices = [{"id": "invW3", "created_at": _iso(week3_inv)}]
    target = _assign_deposit(_iso(tue_recharge), invoices)
    assert target["id"] == "invW3"
