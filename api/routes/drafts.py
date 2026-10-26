"""THE APPROVAL GATE.

Nothing is sent and the timeline never changes unless a draft is approved here:
- POST /drafts/{id}/approve is the only place a plan_change is applied.
- build_link() is the only place a WhatsApp link is created, and it refuses drafts that are not approved.
"""
from fastapi import APIRouter, Depends, HTTPException

from db import get_db, one, q, run, update_row
from helpers import clean_phone, wa_link
from schemas import DraftEdit
from services import apply_plan_change, recipient_of, render_body

router = APIRouter()


def get_draft(db, draft_id: int) -> dict:
    d = one(db, "select * from drafts where id = :id", id=draft_id)
    if not d:
        raise HTTPException(404, "Draft not found")
    return d


def build_link(db, d: dict) -> str:
    if d["status"] != "approved":
        raise HTTPException(403, "Approve this draft before opening WhatsApp.")
    ev = one(db, "select * from events where id = :id", id=d["event_id"])
    vmap = {v["id"]: v for v in q(db, "select * from vendors where event_id = :id", id=d["event_id"])}
    gmap = {g["id"]: g for g in q(db, "select * from guests where event_id = :id", id=d["event_id"])}
    _, phone = recipient_of(d, ev, vmap, gmap)
    return wa_link(clean_phone(phone), render_body(d, vmap))


@router.patch("/drafts/{draft_id}")
def edit_draft(draft_id: int, body: DraftEdit, db=Depends(get_db)):
    d = get_draft(db, draft_id)
    if d["status"] != "pending":
        raise HTTPException(409, "Only pending drafts can be edited.")
    if d["type"] == "plan_change":
        raise HTTPException(400, "Plan changes can be approved or rejected, not edited.")
    update_row(db, "drafts", draft_id, {"body": body.body})
    db.commit()
    return {"ok": True}


@router.post("/drafts/{draft_id}/approve")
def approve(draft_id: int, db=Depends(get_db)):
    d = get_draft(db, draft_id)
    if d["status"] != "pending":
        raise HTTPException(409, "This draft was already handled.")
    if d["type"] == "plan_change":
        apply_plan_change(db, d)
    run(db, "update drafts set status = 'approved', approved_at = now() where id = :id", id=draft_id)
    db.commit()
    link = None
    if d["type"] != "plan_change":
        link = build_link(db, {**d, "status": "approved"})
    return {"status": "approved", "wa_link": link}


@router.post("/drafts/{draft_id}/reject")
def reject(draft_id: int, db=Depends(get_db)):
    d = get_draft(db, draft_id)
    if d["status"] != "pending":
        raise HTTPException(409, "This draft was already handled.")
    run(db, "update drafts set status = 'rejected' where id = :id", id=draft_id)
    db.commit()
    return {"status": "rejected"}


@router.get("/drafts/{draft_id}/link")
def reopen_link(draft_id: int, db=Depends(get_db)):
    """Lets the planner re-open WhatsApp for a draft they already approved."""
    d = get_draft(db, draft_id)
    if d["type"] == "plan_change":
        raise HTTPException(400, "Plan changes have no WhatsApp link.")
    return {"wa_link": build_link(db, d)}
