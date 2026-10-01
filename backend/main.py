from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
try:
    from routers import auth, emergency, hospitals, admin, dashboard, analytics, health, resources, prearrival, insurance
except ImportError:
    from .routers import auth, emergency, hospitals, admin, dashboard, analytics, health, resources, prearrival, insurance
from database import engine
from models import Base
from contextlib import asynccontextmanager
import os
from logging_config import logger
from db_migrations import ensure_supported_insurance_column, ensure_hospital_resource_columns, ensure_hospital_response_simulated_column
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        await ensure_supported_insurance_column(conn)
        await ensure_hospital_resource_columns(conn)
        await ensure_hospital_response_simulated_column(conn)
        from sqlalchemy import text
        # Canonical CaseState data migration for existing rows
        await conn.execute(text("UPDATE emergency_cases SET status = 'WAITING_FOR_RESPONSES' WHERE status IN ('SEARCHING', 'AWAITING_RESPONSE')"))
        await conn.execute(text("UPDATE emergency_cases SET status = 'HOSPITAL_ACCEPTED' WHERE status = 'ACCEPTED'"))
        await conn.execute(text("UPDATE emergency_cases SET status = 'HOSPITAL_SELECTED' WHERE status IN ('EN_ROUTE', 'ARRIVED')"))
        await conn.execute(text("UPDATE emergency_cases SET status = 'COMPLETED' WHERE status = 'CLOSED'"))

        # Lightweight SQLite compatibility migration for existing databases.
        if str(engine.url).startswith("sqlite"):
            cols = (await conn.execute(text("PRAGMA table_info(emergency_cases)"))).all()
            names = {row[1] for row in cols}
            if "voice_note_path" not in names:
                await conn.execute(text("ALTER TABLE emergency_cases ADD COLUMN voice_note_path VARCHAR"))
            if "voice_transcript" not in names:
                await conn.execute(text("ALTER TABLE emergency_cases ADD COLUMN voice_transcript TEXT"))

    # Ensure complete Jaipur hospital network (86 hospitals) is active with supported insurance
    from sqlalchemy import select, text
    from models import Hospital, HospitalResourceUnit
    from database import SessionLocal
    
    # 1. Clean up " · Demo" from existing hospital names in DB
    async with SessionLocal() as seed_db:
        try:
            await seed_db.execute(text("UPDATE hospitals SET name = REPLACE(name, ' · Demo', '') WHERE name LIKE '% · Demo%'"))
            await seed_db.commit()
        except Exception as e:
            logger.warning(f"Error sanitizing hospital names: {e}")

    # 2. Run idempotent Jaipur hospital seed batches (batch 1 & batch 2)
    try:
        from seed_jaipur_hospitals import seed_jaipur_hospitals
        await seed_jaipur_hospitals()
    except Exception as e:
        logger.warning(f"Seed Jaipur Batch 1 error: {e}")

    try:
        from seed_jaipur_batch2 import seed_batch_2
        await seed_batch_2()
    except Exception as e:
        logger.warning(f"Seed Jaipur Batch 2 error: {e}")

    # 3. Ensure all hospitals in DB have supported_insurance, beds, and online status
    async with SessionLocal() as seed_db:
        try:
            all_hosps = (await seed_db.execute(select(Hospital))).scalars().all()
            for h in all_hosps:
                is_govt = any(w in (h.name or "").lower() for w in ["govt", "government", "sms", "swasthya", "charitable", "state"])
                standard_ins = (
                    ["RGHS", "PMJAY", "CGHS", "ECHS", "ESIC"]
                    if is_govt
                    else ["RGHS", "PMJAY", "STAR_HEALTH", "HDFC_ERGO", "ICICI_LOMBARD", "CARE_HEALTH", "NIVA_BUPA", "BAJAJ_ALLIANZ", "NEW_INDIA", "UNITED_INDIA"]
                )
                if not h.supported_insurance or len(h.supported_insurance) == 0:
                    h.supported_insurance = standard_ins
                if not h.verified:
                    h.verified = True
                if h.emergency_status != "ONLINE":
                    h.emergency_status = "ONLINE"
                if not h.available_beds or h.available_beds <= 0:
                    h.available_beds = 30
                if not h.available_icu or h.available_icu <= 0:
                    h.available_icu = 8
                if not h.estimated_emergency_cost or h.estimated_emergency_cost <= 0:
                    h.estimated_emergency_cost = 2500 if is_govt else 4500
            await seed_db.commit()
            logger.info(f"Hospital network initialized: {len(all_hosps)} verified hospitals online with insurance.")
        except Exception as e:
            logger.warning(f"Error updating hospital insurance: {e}")

        # Seed or update initial authorized accounts in development/test
        from models import User
        from auth import get_password_hash
        env_name = os.getenv("ENVIRONMENT", "development").lower().strip()
        admin_pwd = os.getenv("SEED_ADMIN_PASSWORD")
        hosp_pwd = os.getenv("SEED_HOSPITAL_PASSWORD")
        amb_pwd = os.getenv("SEED_USER_PASSWORD")
        if not admin_pwd:
            logger.warning("SEED_ADMIN_PASSWORD not set – demo admin account will not be created")
        if not hosp_pwd:
            logger.warning("SEED_HOSPITAL_PASSWORD not set – demo hospital accounts will not be created")
        if not amb_pwd:
            logger.warning("SEED_USER_PASSWORD not set – demo ambulance account will not be created")



        if admin_pwd and hosp_pwd and amb_pwd:
            target_users = [
                {
                    "email": "admin@emefast.example",
                    "name": "State Emergency Director",
                    "phone": "+91 141 2220000",
                    "password": admin_pwd,
                    "role": "ADMIN",
                    "hospital_id": None,
                },
                {
                    "email": "hospital-sms@emefast.example",
                    "name": "SMS ER Desk Chief",
                    "phone": "+91 141 2560291",
                    "password": hosp_pwd,
                    "role": "HOSPITAL",
                    "hospital_id": 1,
                },
                {
                    "email": "hospital-fortis@emefast.example",
                    "name": "Fortis ER Coordinator",
                    "phone": "+91 141 2547000",
                    "password": hosp_pwd,
                    "role": "HOSPITAL",
                    "hospital_id": 2,
                },
                {
                    "email": "ambulance@emefast.example",
                    "name": "Ambulance Paramedic",
                    "phone": "+91 9829012345",
                    "password": amb_pwd,
                    "role": "USER",
                    "hospital_id": None,
                },
            ]
            for u_data in target_users:
                u_obj = (await seed_db.execute(select(User).where(User.email == u_data["email"]))).scalar_one_or_none()
                if u_obj is None:
                    u_obj = User(
                        name=u_data["name"],
                        email=u_data["email"],
                        phone=u_data["phone"],
                        password_hash=get_password_hash(u_data["password"]),
                        role=u_data["role"],
                        hospital_id=u_data["hospital_id"]
                    )
                    seed_db.add(u_obj)
                else:
                    u_obj.password_hash = get_password_hash(u_data["password"])
                    u_obj.role = u_data["role"]
                    u_obj.hospital_id = u_data["hospital_id"]
            await seed_db.commit()
            logger.info("Initialized and synchronized authorized role accounts.")
    yield

app = FastAPI(
    title="EMEFast API",
    description="Real-Time Emergency Coordination & Hospital Allocation Platform (SIH 2026)",
    version="3.0.0",
    lifespan=lifespan
)

# Production CORS must strictly allow configured frontend origins
default_cors = "https://frontend-v2-seven-chi.vercel.app,http://localhost:3000,http://localhost:3001,http://localhost:3333"
configured_origins = [x.strip() for x in os.getenv("CORS_ORIGINS", default_cors).split(",") if x.strip()]
# Never allow wildcard in production
if ("*" in configured_origins or not configured_origins) and os.getenv("ENVIRONMENT") == "production":
    configured_origins = ["https://frontend-v2-seven-chi.vercel.app"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core EMEFast Routers
app.include_router(auth.router)
app.include_router(emergency.router)
app.include_router(hospitals.router)
app.include_router(admin.router)

# Support & Secondary Routers
app.include_router(dashboard.router)
app.include_router(analytics.router)
app.include_router(health.router)
app.include_router(resources.router)
app.include_router(prearrival.router)
app.include_router(insurance.router)

@app.get("/")
def root():
    return {
        "platform": "EMEFast",
        "status": "ONLINE",
        "description": "Emergency hospital recommendation and coordination platform. No ambulance dispatch.",
        "docs": "/docs"
    }

@app.get("/health")
@app.get("/api/health")
async def health_check():
    from database import SessionLocal
    from sqlalchemy import text
    from fastapi.responses import JSONResponse

    try:
        async with SessionLocal() as db:
            await db.execute(text("SELECT 1"))
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "status": "DEGRADED",
                "database": "DISCONNECTED",
                "platform": "EMEFast",
                "version": "3.0.0",
                "detail": "Database connection failed"
            }
        )

    return {
        "status": "ONLINE",
        "database": "CONNECTED",
        "version": "3.0.0",
        "platform": "EMEFast",
        "coordination": "active"
    }
