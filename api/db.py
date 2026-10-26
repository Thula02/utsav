import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()


def _normalise(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = _normalise(os.environ.get("DATABASE_URL", "").strip())
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

# prepare_threshold=None avoids prepared-statement problems behind Neon's connection pooler.
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"prepare_threshold": None},
)


def init_db() -> None:
    """Create tables if they do not exist (runs at every start-up; safe to repeat)."""
    sql = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")
    with engine.begin() as conn:
        for stmt in sql.split(";"):
            if stmt.strip():
                conn.execute(text(stmt))


def get_db():
    """One connection per request. Route handlers call db.commit() themselves after writing."""
    conn = engine.connect()
    try:
        yield conn
    finally:
        conn.close()


def run(db, sql: str, **params):
    return db.execute(text(sql), params)


def q(db, sql: str, **params) -> list:
    return [dict(r) for r in db.execute(text(sql), params).mappings().all()]


def one(db, sql: str, **params):
    rows = q(db, sql, **params)
    return rows[0] if rows else None


def update_row(db, table: str, row_id: int, fields: dict) -> None:
    """Keys of `fields` always come from our own Pydantic models, never from raw user input."""
    if not fields:
        return
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    run(db, f"update {table} set {sets} where id = :_id", _id=row_id, **fields)
