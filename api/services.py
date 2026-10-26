"""Shared logic: saving a generated plan, loading an event, resolving draft recipients, applying approved plan changes."""
import json
from datetime import date, timedelta
from pathlib import Path

from fastapi import HTTPException

from db import one, q, run
from helpers import clean_phone, due_from, fmt_date, frontend_url, parse_iso
from schemas import Plan

FIXTURE = Path(__file__).parent / "fixtures" / "sample_plan.json"


def load_sample_plan() -> Plan:
    return Plan.model_validate_json(FIXTURE.read_text(encoding="utf-8"))


def save_plan(db, plan: Plan, brief: str, today: date) -> int:
    """Store a plan. The LLM gave days-before and percentages; code works out dates and rupee amounts."""
    event_date = parse_iso(plan.event_date)
    if not event_date or event_date < today:
        event_date = today + timedelta(days=30)
    budget_total = plan.budget_total_inr or None

    row = one(
        db,
        """insert into events (title, event_type, city, event_date, guest_count, budget_total, brief)
           values (:title, :etype, :city, :edate, :guests, :budget, :brief) returning id""",
        title=plan.title, etype=plan.event_type, city=plan.city, edate=event_date,
        guests=plan.guest_count, budget=budget_total, brief=brief,
    )
    event_id = row["id"]

    for it in plan.plan_items:
        run(
            db,
            """insert into plan_items (event_id, title, category, due_date, notes)
               values (:e, :t, :c, :d, :n)""",
            e=event_id, t=it.title, c=it.category.strip().lower(),
            d=due_from(event_date, it.days_before_event, today), n=it.notes,
        )

    total_pct = sum(max(b.percent, 0) for b in plan.budget) or 1
    for b in plan.budget:
        planned = round((budget_total or 0) * max(b.percent, 0) / total_pct)
        run(
            db,
            "insert into budget_items (event_id, category, planned_amount) values (:e, :c, :p)",
            e=event_id, c=b.category.strip().lower(), p=planned,
        )

    seen = set()
    date_txt = fmt_date(event_date)
    for vd in plan.vendor_drafts:
        cat = vd.category.strip().lower()
        if cat in seen:
            continue
        seen.add(cat)
        v = one(db, "insert into vendors (event_id, category) values (:e, :c) returning id", e=event_id, c=cat)
        run(
            db,
            "insert into drafts (event_id, type, vendor_id, body) values (:e, 'vendor_message', :v, :b)",
            e=event_id, v=v["id"], b=vd.message.replace("{event_date}", date_txt),
        )
    return event_id


def create_guest_with_invite(db, ev: dict, name: str, phone) -> int:
    g = one(
        db,
        "insert into guests (event_id, name, phone) values (:e, :n, :p) returning id",
        e=ev["id"], n=name, p=clean_phone(phone),
    )
    when = f" on {fmt_date(ev['event_date'])}" if ev.get("event_date") else ""
    where = f" in {ev['city']}" if ev.get("city") else ""
    body = (
        f"Namaste {name}! You're invited to {ev['title']}{when}{where}. "
        f"Please let us know if you can make it: {frontend_url()}/rsvp/{ev['rsvp_token']}"
    )
    run(
        db,
        "insert into drafts (event_id, type, guest_id, body) values (:e, 'guest_invite', :g, :b)",
        e=ev["id"], g=g["id"], b=body,
    )
    return g["id"]


def recipient_of(d: dict, ev: dict, vmap: dict, gmap: dict):
    """Who a draft is for: (display name, phone)."""
    if d["type"] == "vendor_message":
        v = vmap.get(d["vendor_id"])
        if v:
            return ((v["name"] or "").strip() or f"{v['category'].title()} vendor"), v["phone"]
    elif d["type"] == "payment_reminder":
        return (ev.get("client_name") or "Client"), ev.get("client_phone")
    elif d["type"] == "guest_invite":
        g = gmap.get(d["guest_id"])
        if g:
            return g["name"], g["phone"]
    return None, None


def render_body(d: dict, vmap: dict) -> str:
    body = d["body"]
    if d["type"] == "vendor_message":
        v = vmap.get(d["vendor_id"])
        name = ((v["name"] or "").strip() if v else "")
        body = body.replace("{vendor_name}", name or "team")
    return body


BUDGET_SQL = """
select b.id, b.category, b.planned_amount as planned,
  coalesce((select sum(v.agreed_amount) from vendors v
            where v.event_id = b.event_id and v.category = b.category and v.status = 'confirmed'), 0) as committed,
  coalesce((select sum(v.paid_amount) from vendors v
            where v.event_id = b.event_id and v.category = b.category), 0) as paid
from budget_items b
where b.event_id = :id
order by b.planned_amount desc nulls last, b.id
"""


def event_detail(db, event_id: int) -> dict:
    ev = one(db, "select * from events where id = :id", id=event_id)
    if not ev:
        raise HTTPException(404, "Event not found")
    plan_items = q(db, "select * from plan_items where event_id = :id order by due_date, id", id=event_id)
    vendors = q(db, "select * from vendors where event_id = :id order by id", id=event_id)
    guests = q(db, "select * from guests where event_id = :id order by id", id=event_id)
    drafts = q(db, "select * from drafts where event_id = :id order by id desc", id=event_id)
    budget = q(db, BUDGET_SQL, id=event_id)

    vmap = {v["id"]: v for v in vendors}
    gmap = {g["id"]: g for g in guests}
    for d in drafts:
        d["recipient"], d["recipient_phone"] = recipient_of(d, ev, vmap, gmap)
        d["body"] = render_body(d, vmap)

    f = lambda x: float(x or 0)  # noqa: E731
    totals = {
        "budget_total": f(ev["budget_total"]),
        "planned": sum(f(b["planned"]) for b in budget),
        "committed": sum(f(v["agreed_amount"]) for v in vendors if v["status"] == "confirmed"),
        "paid": sum(f(v["paid_amount"]) for v in vendors),
    }
    return {**ev, "plan_items": plan_items, "vendors": vendors, "guests": guests,
            "drafts": drafts, "budget": budget, "totals": totals}


def apply_plan_change(db, draft: dict) -> None:
    """The ONLY place the timeline is changed. Called only from the approve endpoint."""
    ev = one(db, "select event_date from events where id = :id", id=draft["event_id"])
    payload = draft["payload"] or {}
    if isinstance(payload, str):
        payload = json.loads(payload)
    today = date.today()
    event_date = ev["event_date"]
    for c in payload.get("changes", []):
        if c.get("op") == "add" and c.get("title"):
            run(
                db,
                """insert into plan_items (event_id, title, category, due_date, notes)
                   values (:e, :t, 'misc', :d, :n)""",
                e=draft["event_id"], t=c["title"],
                d=due_from(event_date, c.get("days_before_event") or 0, today), n=c.get("notes") or "",
            )
        elif c.get("op") == "update" and c.get("item_id"):
            cur = one(db, "select due_date from plan_items where id = :i and event_id = :e",
                      i=c["item_id"], e=draft["event_id"])
            if not cur:
                continue
            sets, params = [], {"i": c["item_id"], "e": draft["event_id"]}
            if c.get("title"):
                sets.append("title = :title")
                params["title"] = c["title"]
            if c.get("notes"):
                sets.append("notes = :notes")
                params["notes"] = c["notes"]
            if c.get("shift_days") and cur["due_date"]:
                new_due = cur["due_date"] + timedelta(days=int(c["shift_days"]))
                new_due = max(today, min(new_due, event_date))
                sets.append("due_date = :due")
                params["due"] = new_due
            if sets:
                run(db, f"update plan_items set {', '.join(sets)} where id = :i and event_id = :e", **params)
