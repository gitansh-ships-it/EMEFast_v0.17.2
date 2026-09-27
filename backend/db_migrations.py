import logging
from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)

async def ensure_supported_insurance_column(conn):
    """Idempotent addition of the ``supported_insurance`` JSON column to ``hospitals``.
    Works for both PostgreSQL (JSON) and SQLite (TEXT storing JSON).
    ``conn`` is an ``AsyncConnection`` obtained from ``engine.begin()``.
    """
    columns = await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_columns("hospitals"))
    column_names = [c["name"] for c in columns]
    if "supported_insurance" in column_names:
        logger.info("[migration] supported_insurance column already present")
        return
    dialect = conn.dialect.name
    if dialect == "postgresql":
        stmt = text(
            "ALTER TABLE hospitals ADD COLUMN supported_insurance JSON NOT NULL DEFAULT '[]'"
        )
    else:  # SQLite and others
        stmt = text(
            "ALTER TABLE hospitals ADD COLUMN supported_insurance TEXT NOT NULL DEFAULT '[]'"
        )
    await conn.execute(stmt)
    logger.info("[migration] added supported_insurance column")

async def ensure_hospital_resource_columns(conn):
    """Idempotent addition of missing hospital resource columns.
    Uses SQLite‑compatible NULL defaults to avoid injecting fake data.
    """
    columns = await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_columns("hospitals"))
    existing = {c["name"] for c in columns}
    specs = [
        ("available_beds", "INTEGER"),
        ("available_icu", "INTEGER"),
        ("oxygen_available", "BOOLEAN"),
        ("blood_units", "INTEGER"),
        ("trauma_capability", "BOOLEAN"),
        ("estimated_emergency_cost", "INTEGER"),
        ("contact_phone", "VARCHAR"),
        ("created_at", "DATETIME"),
    ]
    for name, col_type in specs:
        if name in existing:
            continue
        stmt = text(f"ALTER TABLE hospitals ADD COLUMN {name} {col_type}")
        await conn.execute(stmt)
        logger.info("[migration] added missing column %s", name)
