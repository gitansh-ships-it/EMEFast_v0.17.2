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
