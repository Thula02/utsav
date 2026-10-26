import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from db import get_db, one, q, run, update_row
from helpers import clean_phone, fmt_inr, upi_link
from llm import demo_mode, generate_json
from prompts import chat_system, plan_system
from schemas import BudgetIn, BudgetItemPatch, ChatIn, ChatOut, ClientIn, GenerateIn, Plan, PlanItemPatch
from services import event_detail, load_sample_plan, save_plan

router = APIRouter()


@router.get("/events")
def list_events(db=Depends(get_db)):
    return q(
        db,
        """select e.id, e.title, e.event_type, e.city, e.event_date, e.guest_count,
                  (select count(*) from drafts d where d.event_id = e.id and d.status = 'pending') as pending_drafts
           from events e order by e.id desc""",
    )


@router.post("/events/generate")
def generate(body: GenerateIn, db=Depends(get_db)):
    brief = body.brief.strip()
    if len(brief) < 10:
        raise HTTPException(400, "Write a sentence or two about the event first.")
    today = date.today()
    plan, fallback = None, False
    if not demo_mode():
        try:
            plan = generate_json(plan_system(today, body.template), brief, Plan)
            if len(plan.plan_items) < 5 or not plan.vendor_drafts:
                plan = None
        except Exception as e:  # noqa: BLE001 - any LLM failure falls back to the sample plan
            print("Plan generation failed, using the sample plan:", e)
            plan = None
    if plan is None:
        plan, fallback = load_sample_plan(), True
    event_id = save_plan(db, plan, brief, today)
    db.commit()
    return {"event_id": event_id, "fallback": fallback}


@router.get("/events/{event_id}")
def get_event(event_id: int, db=Depends(get_db)):
    return event_detail(db, event_id)


@router.patch("/events/{event_id}")
def update_event(event_id: int, body: ClientIn, db=Depends(get_db)):
    fields = body.model_dump(exclude_unset=True)
    if "client_phone" in fields:
        fields["client_phone"] = clean_phone(fields["client_phone"])
    update_row(db, "events", event_id, fields)
    db.commit()
    return {"ok": True}


@router.patch("/plan-items/{item_id}")
def update_plan_item(item_id: int, body: PlanItemPatch, db=Depends(get_db)):
    """Ticking a task off is allowed directly. Dates and new tasks only change through an approved draft."""
    update_row(db, "plan_items", item_id, {"status": body.status})
    db.commit()
    return {"ok": True}


@router.post("/events/{event_id}/chat")
def chat(event_id: int, body: ChatIn, db=Depends(get_db)):
    ev = event_detail(db, event_id)
    if demo_mode():
        return {"reply": "Demo mode is on, so chat is switched off. Set DEMO_MODE=0 to talk to the AI.", "draft_id": None}

    by_id = {p["id"]: p for p in ev["plan_items"]}
    context = {
        "title": ev["title"], "type": ev["event_type"], "city": ev["city"],
        "event_date": ev["event_date"], "guest_count": ev["guest_count"],
        "budget_total_inr": ev["budget_total"],
        "plan_items": [
            {"id": p["id"], "title": p["title"], "category": p["category"],
             "due_date": p["due_date"], "status": p["status"]}
            for p in ev["plan_items"]
        ],
        "vendors": [
            {"category": v["category"], "name": v["name"], "status": v["status"],
             "quoted": v["quoted_amount"], "agreed": v["agreed_amount"]}
            for v in ev["vendors"]
        ],
        "budget": ev["budget"],
    }
    try:
        out = generate_json(
            chat_system(date.today()),
            json.dumps({"event": context, "history": body.history[-6:], "message": body.message}, default=str),
            ChatOut,
        )
    except Exception as e:  # noqa: BLE001
        print("Chat failed:", e)
        return {"reply": "The AI isn't responding right now (it may be rate-limited). Try again in a moment.", "draft_id": None}

    lines, good = [], []
    for c in out.changes:
        if c.op == "update" and c.item_id in by_id:
            parts = []
            if c.title:
                parts.append(f"rename to '{c.title}'")
            if c.shift_days:
                parts.append(f"move {abs(c.shift_days)} day(s) {'earlier' if c.shift_days < 0 else 'later'}")
            if c.notes:
                parts.append("update the notes")
            if parts:
                good.append(c)
                lines.append(f"Update '{by_id[c.item_id]['title']}': " + ", ".join(parts))
        elif c.op == "add" and c.title:
            when = f" ({c.days_before_event} days before the event)" if c.days_before_event is not None else ""
            good.append(c)
            lines.append(f"Add task: {c.title}{when}")

    draft_id = None
    if good:
        row = one(
            db,
            """insert into drafts (event_id, type, body, payload)
               values (:e, 'plan_change', :b, cast(:p as jsonb)) returning id""",
            e=event_id, b="\n".join(lines),
            p=json.dumps({"changes": [c.model_dump() for c in good]}),
        )
        draft_id = row["id"]
        db.commit()
    return {"reply": out.reply, "draft_id": draft_id}


@router.post("/events/{event_id}/payment-reminders")
def payment_reminders(event_id: int, db=Depends(get_db)):
    """Drafts a reminder to the client for each confirmed vendor whose advance is still due."""
    ev = one(db, "select * from events where id = :id", id=event_id)
    if not ev:
        raise HTTPException(404, "Event not found")
    vendors = q(db, "select * from vendors where event_id = :id and status = 'confirmed' order by id", id=event_id)
    created = skipped = 0
    for v in vendors:
        agreed = float(v["agreed_amount"] or 0)
        pct = float(v["advance_percent"] if v["advance_percent"] is not None else 50)
        due = round(agreed * pct / 100 - float(v["paid_amount"] or 0))
        if agreed <= 0 or due <= 0:
            skipped += 1
            continue
        if one(db, """select id from drafts where event_id = :e and vendor_id = :v
                      and type = 'payment_reminder' and status = 'pending'""", e=event_id, v=v["id"]):
            skipped += 1
            continue
        who = (v["name"] or v["category"]).strip()
        hello = f"Hi {ev['client_name']}," if ev["client_name"] else "Hi,"
        link = None
        if v["upi_id"]:
            how = f"Please pay {fmt_inr(due)} by UPI to {v['upi_id']}."
            link = upi_link(v["upi_id"], who, due, f"{ev['title']} {v['category']} advance")
        else:
            how = "I'll share the UPI details with you shortly."
        body = (
            f"{hello} a gentle reminder: the {int(pct)}% advance of {fmt_inr(due)} for "
            f"{v['category']} ({who}) for {ev['title']} is due. {how} Thank you!"
        )
        run(
            db,
            """insert into drafts (event_id, type, vendor_id, body, payload)
               values (:e, 'payment_reminder', :v, :b, cast(:p as jsonb))""",
            e=event_id, v=v["id"], b=body, p=json.dumps({"upi_link": link, "amount": due}),
        )
        created += 1
    db.commit()
    return {"created": created, "skipped": skipped}


@router.patch("/events/{event_id}/budget")
def update_budget(event_id: int, body: BudgetIn, db=Depends(get_db)):
    """Set the total budget. Category amounts are rescaled in the same proportions (or split equally if all are zero)."""
    if body.budget_total < 0:
        raise HTTPException(400, "The budget can't be negative.")
    if not one(db, "select id from events where id = :id", id=event_id):
        raise HTTPException(404, "Event not found")
    items = q(db, "select id, planned_amount from budget_items where event_id = :id order by id", id=event_id)
    old_sum = sum(float(i["planned_amount"] or 0) for i in items)
    new_amounts = []
    for i in items:
        share = float(i["planned_amount"] or 0) / old_sum if old_sum > 0 else 1 / len(items)
        new_amounts.append(round(body.budget_total * share))
    if new_amounts:  # put any rounding difference on the last line so the categories add up exactly
        new_amounts[-1] += round(body.budget_total) - sum(new_amounts)
    for i, amount in zip(items, new_amounts):
        run(db, "update budget_items set planned_amount = :p where id = :i", p=amount, i=i["id"])
    update_row(db, "events", event_id, {"budget_total": body.budget_total})
    db.commit()
    return {"ok": True}


@router.patch("/budget-items/{item_id}")
def update_budget_item(item_id: int, body: BudgetItemPatch, db=Depends(get_db)):
    """Change what is planned for one category. The total budget is not touched."""
    if body.planned_amount < 0:
        raise HTTPException(400, "The amount can't be negative.")
    update_row(db, "budget_items", item_id, {"planned_amount": round(body.planned_amount)})
    db.commit()
    return {"ok": True}
