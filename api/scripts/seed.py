"""Wipe ALL data and load the demo event (no LLM needed).
Run from the api/ folder:  python scripts/seed.py
"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db import engine, init_db, one, run  # noqa: E402
from services import create_guest_with_invite, load_sample_plan, save_plan  # noqa: E402

BRIEF = "Sangeet for 150 guests in Jaipur, ₹8L budget, 3 weeks away."

# Fictional vendors and fake phone numbers, only so the demo reads naturally.
VENDORS = {
    "venue": ("Jaipur Heritage Lawns", "919999900011", "heritagelawns@examplebank"),
    "catering": ("Spice Route Caterers", "919999900012", "spiceroute@examplebank"),
    "photography": ("Lens and Lamp Studio", "919999900013", "lensandlamp@examplebank"),
    "decor": ("Pink City Decor", "919999900014", "pinkcitydecor@examplebank"),
}
GUESTS = [
    ("Aarav Sharma", "9999900101"),
    ("Meera Iyer", "9999900102"),
    ("Kabir Singh", "9999900103"),
    ("Anaya Gupta", "9999900104"),
    ("Rohan Mehta", "9999900105"),
]


def main() -> None:
    init_db()
    with engine.connect() as db:
        run(db, "truncate events restart identity cascade")
        event_id = save_plan(db, load_sample_plan(), BRIEF, date.today())
        run(db, "update events set client_name = 'Priya Sharma', client_phone = '919999900001' where id = :id", id=event_id)
        for cat, (name, phone, upi) in VENDORS.items():
            run(db, "update vendors set name = :n, phone = :p, upi_id = :u where event_id = :e and category = :c",
                n=name, p=phone, u=upi, e=event_id, c=cat)
        ev = one(db, "select * from events where id = :id", id=event_id)
        for name, phone in GUESTS:
            create_guest_with_invite(db, ev, name, phone)
        db.commit()
    print(f"Demo event seeded (id {event_id}).")


if __name__ == "__main__":
    main()
