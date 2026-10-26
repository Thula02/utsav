import json

from fastapi import APIRouter, Depends, HTTPException

from db import get_db, one, run, update_row
from helpers import naive_summary
from llm import demo_mode, generate_json
from prompts import reply_system
from schemas import ReplyIn, ReplySummary, VendorPatch

router = APIRouter()


@router.patch("/vendors/{vendor_id}")
def update_vendor(vendor_id: int, body: VendorPatch, db=Depends(get_db)):
    """Vendor status is always set by the planner. The AI only suggests values."""
    if not one(db, "select id from vendors where id = :id", id=vendor_id):
        raise HTTPException(404, "Vendor not found")
    update_row(db, "vendors", vendor_id, body.model_dump(exclude_unset=True))
    db.commit()
    return {"ok": True}


@router.post("/vendors/{vendor_id}/reply")
def summarise_reply(vendor_id: int, body: ReplyIn, db=Depends(get_db)):
    """Planner pastes a vendor's WhatsApp reply; AI summarises it. Nothing else changes."""
    v = one(db, "select * from vendors where id = :id", id=vendor_id)
    if not v:
        raise HTTPException(404, "Vendor not found")
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Paste the vendor's reply first.")

    data = None
    if not demo_mode():
        try:
            out = generate_json(
                reply_system(),
                json.dumps({"vendor_category": v["category"], "reply": text}),
                ReplySummary,
            )
            data = out.model_dump()
        except Exception as e:  # noqa: BLE001
            print("Reply summary failed, using regex fallback:", e)
    if data is None:
        data = naive_summary(text)

    run(db, "update vendors set last_reply = :r, last_summary = :s where id = :id",
        r=text, s=json.dumps(data), id=vendor_id)
    db.commit()
    return data
