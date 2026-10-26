from typing import Literal, Optional

from pydantic import BaseModel, field_validator


# ---------- tolerant converters: LLMs often send "25%", "8,00,000", null or 14.0 ----------
def _to_float(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(",", "").replace("%", "").replace("₹", "").replace("INR", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _to_int(v):
    f = _to_float(v)
    return None if f is None else int(round(f))


# ---------- shapes the LLM must return ----------
class PlanItem(BaseModel):
    title: str
    category: str = "misc"
    days_before_event: int = 0
    notes: str = ""

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, v):
        return str(v).strip().lower() if v else "misc"

    @field_validator("notes", mode="before")
    @classmethod
    def _notes(cls, v):
        return "" if v is None else str(v)

    @field_validator("days_before_event", mode="before")
    @classmethod
    def _days(cls, v):
        return _to_int(v) or 0


class BudgetLine(BaseModel):
    category: str
    percent: float = 0

    @field_validator("percent", mode="before")
    @classmethod
    def _percent(cls, v):
        return _to_float(v) or 0.0


class VendorDraft(BaseModel):
    category: str
    message: str


class Plan(BaseModel):
    title: str
    event_type: str = "event"
    city: Optional[str] = None
    guest_count: Optional[int] = None
    budget_total_inr: Optional[float] = None
    event_date: Optional[str] = None
    plan_items: list[PlanItem]
    budget: list[BudgetLine] = []
    vendor_drafts: list[VendorDraft] = []

    @field_validator("event_type", mode="before")
    @classmethod
    def _event_type(cls, v):
        return str(v) if v else "event"

    @field_validator("guest_count", mode="before")
    @classmethod
    def _guests(cls, v):
        return _to_int(v)

    @field_validator("budget_total_inr", mode="before")
    @classmethod
    def _budget(cls, v):
        return _to_float(v)

    @field_validator("event_date", mode="before")
    @classmethod
    def _date(cls, v):
        return None if v is None else str(v)

    @field_validator("budget", "vendor_drafts", mode="before")
    @classmethod
    def _none_to_empty(cls, v):
        return v or []


class ReplySummary(BaseModel):
    summary: str
    quoted_amount: Optional[float] = None
    advance_percent: Optional[float] = None
    available: Optional[bool] = None
    next_action: str = ""

    @field_validator("quoted_amount", "advance_percent", mode="before")
    @classmethod
    def _nums(cls, v):
        return _to_float(v)

    @field_validator("next_action", mode="before")
    @classmethod
    def _next(cls, v):
        return "" if v is None else str(v)


class Change(BaseModel):
    op: Literal["add", "update"]
    item_id: Optional[int] = None
    title: Optional[str] = None
    days_before_event: Optional[int] = None  # for "add"
    shift_days: Optional[int] = None  # for "update": negative = earlier, positive = later
    notes: Optional[str] = None

    @field_validator("item_id", "days_before_event", "shift_days", mode="before")
    @classmethod
    def _ints(cls, v):
        return _to_int(v)


class ChatOut(BaseModel):
    reply: str
    changes: list[Change] = []

    @field_validator("changes", mode="before")
    @classmethod
    def _none_to_empty(cls, v):
        return v or []


# ---------- request bodies ----------
class GenerateIn(BaseModel):
    brief: str
    template: str = ""


class ChatIn(BaseModel):
    message: str
    history: list[dict] = []


class DraftEdit(BaseModel):
    body: str


class ClientIn(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None


class PlanItemPatch(BaseModel):
    status: Literal["todo", "done"]


class VendorPatch(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    upi_id: Optional[str] = None
    status: Optional[Literal["not_contacted", "contacted", "quoted", "negotiating", "confirmed", "declined"]] = None
    quoted_amount: Optional[float] = None
    agreed_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    advance_percent: Optional[float] = None


class ReplyIn(BaseModel):
    text: str


class GuestsIn(BaseModel):
    text: str  # one guest per line: "Name, phone"


class RsvpIn(BaseModel):
    name: str
    phone: Optional[str] = None
    rsvp_status: Literal["yes", "no", "maybe"]
    party_size: int = 1
    dietary: Optional[str] = None


class BudgetIn(BaseModel):
    budget_total: float


class BudgetItemPatch(BaseModel):
    planned_amount: float
