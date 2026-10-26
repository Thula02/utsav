# Utsav: AI event planning with an approval gate

Describe an event in two sentences. Utsav drafts the plan, vendor WhatsApp messages, budget, guest invites and
payment reminders. **Nothing is sent and no date changes until the planner approves it.**

## Architecture

```
React (Vite, Tailwind)  --HTTPS/JSON-->  FastAPI  -->  PostgreSQL (Neon)
  Vercel                                  Render   \-->  OpenAI-compatible LLM (Groq or Gemini free tier)
```

Three rules hold the design together:

1. The LLM never does arithmetic or dates. It returns "days before the event" and budget percentages; code computes dates and rupees.
2. The LLM never invents vendors. It suggests categories; the planner types in names and numbers.
3. One approval gate. `routes/drafts.py` is the only place a plan change is applied or a WhatsApp link is built.

| Area | How it works |
|---|---|
| Plan | `POST /events/generate` -> LLM returns JSON -> validated by Pydantic -> saved. Falls back to a sample plan if the LLM fails. |
| Drafts | Every outgoing message and every AI-proposed plan change is a row in `drafts` with status pending / approved / rejected. |
| WhatsApp | Free `wa.me` links with pre-filled text. Planner pastes vendor replies; AI summarises them (regex fallback in demo mode). |
| Vendors | The planner sets status manually. The AI never changes it. |
| Budget | Planned per category vs. committed (confirmed vendors' agreed amounts) vs. paid. |
| Payments | UPI ID in the message plus a QR code from a `upi://pay` link. Planner records payments manually. No gateway. |
| Guests | Bulk add, invite drafts, public mobile RSVP page at `/rsvp/<token>`. |

## Run locally

Needs Python 3.10+, Node 20.19+ (or 22+), a Neon (or any Postgres) database, and a free LLM API key.

```bash
# 1. API
cd api
python -m venv .venv
source .venv/bin/activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env               # then edit .env (DATABASE_URL and LLM_API_KEY)
python scripts/seed.py             # optional: loads the demo event (WIPES all data)
uvicorn main:app --reload          # http://localhost:8000/health

# 2. Web (new terminal)
cd web
npm install
cp .env.example .env
npm run dev                        # http://localhost:5173
```

Tables are created automatically when the API starts.

## Deploy

**API on Render** (Web Service): root directory `api`, build `pip install -r requirements.txt`,
start `uvicorn main:app --host 0.0.0.0 --port $PORT`. Environment variables: everything in `api/.env.example`, plus
`PYTHON_VERSION=3.12.3`. Set `ALLOWED_ORIGINS` and `FRONTEND_URL` to your Vercel URL.

**Web on Vercel**: root directory `web`, framework Vite. Environment variable `VITE_API_URL` = your Render URL.
`vercel.json` already rewrites all paths to the app so `/rsvp/...` links work.

Render's free tier sleeps when idle. Open `/health` a few minutes before a demo.

## Demo safety

- `DEMO_MODE=1` never calls the LLM (sample plan + regex summariser). Chat is disabled in this mode.
- `python scripts/seed.py` resets to a clean demo event with fictional vendors and fake phone numbers.
- If the LLM errors or is rate-limited during generation, the app shows a sample plan and says so.

## Layout

```
api/   main.py db.py schema.sql schemas.py prompts.py llm.py helpers.py services.py
       routes/{events,drafts,vendors,guests}.py  fixtures/sample_plan.json  scripts/seed.py
web/   src/{main,App,api}.ts(x)  src/pages/{Home,EventPage,Rsvp}.tsx
       src/components/{PlanTab,ChatTab,DraftsTab,VendorsTab,BudgetTab,GuestsTab,ui}.tsx
```
