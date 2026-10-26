import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from db import get_db, init_db, one  # noqa: E402
from llm import demo_mode  # noqa: E402
from routes import drafts, events, guests, vendors  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
        print("Database ready")
    except Exception as e:  # noqa: BLE001 - keep the server up so /health still answers
        print("DATABASE INIT FAILED:", e)
    yield


app = FastAPI(title="Utsav API", lifespan=lifespan)

origins = [o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Vercel preview URLs
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "demo_mode": demo_mode()}


@app.get("/health/db")
def health_db(db=Depends(get_db)):
    one(db, "select 1 as ok")
    return {"db": "ok"}


app.include_router(events.router)
app.include_router(drafts.router)
app.include_router(vendors.router)
app.include_router(guests.router)
