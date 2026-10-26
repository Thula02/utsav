"""Small pure helpers: phone/link builders, INR formatting, dates, and a regex fallback summariser."""
import os
import re
from datetime import date, datetime, timedelta
from typing import Optional
from urllib.parse import quote


def clean_phone(p: Optional[str]) -> Optional[str]:
    """Return digits only, adding India's +91 for 10-digit numbers."""
    d = re.sub(r"\D", "", p or "")
    if len(d) == 10:
        return "91" + d
    if len(d) == 11 and d.startswith("0"):
        return "91" + d[1:]
    return d or None


def wa_link(phone: Optional[str], text: str) -> str:
    """wa.me link with the message pre-filled. No phone -> WhatsApp opens its contact picker."""
    base = f"https://wa.me/{phone}" if phone else "https://wa.me/"
    return f"{base}?text={quote(text)}"


def upi_link(vpa: str, name: str, amount: float, note: str) -> str:
    return (
        f"upi://pay?pa={quote(vpa, safe='@')}&pn={quote(name or 'Vendor')}"
        f"&am={float(amount):.2f}&cu=INR&tn={quote(note)}"
    )


def fmt_inr(n) -> str:
    """12345678 -> ₹1,23,45,678 (Indian digit grouping)."""
    n = int(round(float(n or 0)))
    s = str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts + [tail])
    return ("-" if n < 0 else "") + "₹" + s


def fmt_date(d) -> str:
    return d.strftime("%d %b %Y") if d else ""


def parse_iso(s: Optional[str]) -> Optional[date]:
    try:
        return datetime.strptime((s or "")[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def due_from(event_date: date, days_before, today: date) -> date:
    """Code (not the LLM) turns 'N days before the event' into a calendar date. Never earlier than today."""
    d = event_date - timedelta(days=max(int(days_before or 0), 0))
    return d if d >= today else today


def frontend_url() -> str:
    url = os.environ.get("FRONTEND_URL") or os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")[0]
    return url.strip().rstrip("/")


# ---- regex fallback used when the LLM is unavailable or DEMO_MODE=1 ----
_AMOUNT_CUR = re.compile(r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakhs?|lacs?|l|k)?\b", re.I)
_AMOUNT_LAKH = re.compile(r"(\d+(?:\.\d+)?)\s*(lakhs?|lacs?)\b", re.I)
_ADV_1 = re.compile(r"(\d{1,3})\s*%\s*(?:as\s+)?(?:advance|booking|upfront)", re.I)
_ADV_2 = re.compile(r"(?:advance|booking amount|upfront)[^.\d]{0,30}(\d{1,3})\s*%", re.I)


def _rupees(num: str, unit: Optional[str]) -> float:
    n = float(num.replace(",", ""))
    u = (unit or "").lower()
    if u.startswith("l"):
        n *= 100000
    elif u == "k":
        n *= 1000
    return n


def naive_summary(text: str) -> dict:
    t = text or ""
    low = t.lower()
    amount = None
    m = _AMOUNT_CUR.search(t) or _AMOUNT_LAKH.search(t)
    if m:
        amount = _rupees(m.group(1), m.group(2))
    advance = None
    m = _ADV_1.search(t) or _ADV_2.search(t)
    if m:
        advance = float(m.group(1))
    available = None
    if re.search(r"not available|unavailable|already booked|fully booked|booked that day", low):
        available = False
    elif "available" in low or "free on" in low:
        available = True
    bits = []
    if amount is not None:
        bits.append(f"quote {fmt_inr(amount)}")
    if advance is not None:
        bits.append(f"{int(advance)}% advance")
    if available is True:
        bits.append("available on the date")
    if available is False:
        bits.append("not available on the date")
    summary = "Auto-extracted: " + ", ".join(bits) + "." if bits else "No quote or terms found. Read the reply and update the vendor yourself."
    return {
        "summary": summary,
        "quoted_amount": amount,
        "advance_percent": advance,
        "available": available,
        "next_action": "Check the details, then set the vendor status yourself.",
    }
