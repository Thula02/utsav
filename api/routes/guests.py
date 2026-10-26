from fastapi import APIRouter, Depends, HTTPException

from db import get_db, one, run
from helpers import clean_phone
from schemas import GuestsIn, RsvpIn
from services import create_guest_with_invite

router = APIRouter()


@router.post("/events/{event_id}/guests")
def add_guests(event_id: int, body: GuestsIn, db=Depends(get_db)):
    """One guest per line: 'Name, phone'. Each guest also gets an invite DRAFT (nothing is sent)."""
    ev = one(db, "select * from events where id = :id", id=event_id)
    if not ev:
        raise HTTPException(404, "Event not found")
    created = 0
    for line in body.text.splitlines():
        parts = [p.strip() for p in line.split(",")]
        if not parts or not parts[0]:
            continue
        create_guest_with_invite(db, ev, parts[0], parts[1] if len(parts) > 1 else None)
        created += 1
    db.commit()
    return {"created": created}


@router.get("/rsvp/{token}")
def rsvp_info(token: str, db=Depends(get_db)):
    ev = one(db, "select title, event_type, city, event_date from events where rsvp_token = :t", t=token)
    if not ev:
        raise HTTPException(404, "This RSVP link is not valid.")
    return ev


@router.post("/rsvp/{token}")
def rsvp_submit(token: str, body: RsvpIn, db=Depends(get_db)):
    ev = one(db, "select id from events where rsvp_token = :t", t=token)
    if not ev:
        raise HTTPException(404, "This RSVP link is not valid.")
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Please enter your name.")
    phone = clean_phone(body.phone)
    size = max(1, min(body.party_size, 20)) if body.rsvp_status == "yes" else 0
    existing = one(db, "select id from guests where event_id = :e and phone = :p", e=ev["id"], p=phone) if phone else None
    if existing:
        run(db, """update guests set name = :n, rsvp_status = :s, party_size = :z, dietary = :d where id = :id""",
            n=name, s=body.rsvp_status, z=size, d=body.dietary, id=existing["id"])
    else:
        run(db, """insert into guests (event_id, name, phone, rsvp_status, party_size, dietary)
                   values (:e, :n, :p, :s, :z, :d)""",
            e=ev["id"], n=name, p=phone, s=body.rsvp_status, z=size, d=body.dietary)
    db.commit()
    return {"ok": True}
