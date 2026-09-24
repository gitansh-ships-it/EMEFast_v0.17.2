from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, emergency, hospitals, admin, dashboard, analytics, health, resources, prearrival
from database import engine
from models import Base
from contextlib import asynccontextmanager
import os
from logging_config import logger
from db_migrations import ensure_supported_insurance_column
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        await ensure_supported_insurance_column(conn)
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

    # Local demo package: make the hospital network usable immediately.
    from sqlalchemy import select
    from models import Hospital
    from database import SessionLocal
    async with SessionLocal() as seed_db:
        existing = (await seed_db.execute(select(Hospital.id).limit(1))).first()
        if existing is None:
            demo_hospitals = [
                dict(name="SMS Hospital · Demo", address="Jawahar Lal Nehru Marg, Jaipur", latitude=26.9124, longitude=75.7873, estimated_emergency_cost=2500, available_icu=8, available_beds=34, capabilities="Emergency, Trauma, Cardiac, Neuro, Orthopedic, Pediatric, Maternity, Ventilator, ICU", contact_phone="+91 141 2560291"),
                dict(name="Fortis Hospital · Demo", address="Malviya Nagar, Jaipur", latitude=26.8540, longitude=75.8063, estimated_emergency_cost=3000, available_icu=6, available_beds=28, capabilities="Emergency, Trauma, Cardiac, Neuro, Orthopedic, Ventilator, ICU", contact_phone="+91 141 2547000"),
                dict(name="Narayana Hospital · Demo", address="Pratap Nagar, Jaipur", latitude=26.8065, longitude=75.8280, estimated_emergency_cost=3500, available_icu=7, available_beds=30, capabilities="Emergency, Trauma, Cardiac, Orthopedic, Pediatric, Ventilator, ICU", contact_phone="+91 141 7122222"),
                dict(name="Manipal Hospital · Demo", address="Sector 5, Vidhyadhar Nagar, Jaipur", latitude=26.9638, longitude=75.7788, estimated_emergency_cost=4200, available_icu=5, available_beds=24, capabilities="Emergency, Trauma, Cardiac, Neuro, Orthopedic, Ventilator, ICU", contact_phone="+91 141 5165000"),
                dict(name="Rukmani Birla Hospital · Demo", address="Durgapura, Jaipur", latitude=26.8567, longitude=75.7892, estimated_emergency_cost=3900, available_icu=5, available_beds=22, capabilities="Emergency, Trauma, Cardiac, Neuro, Maternity, Ventilator, ICU", contact_phone="+91 141 3528888"),
                dict(name="Mahaveer Cancer Hospital · Demo", address="Jagatpura, Jaipur", latitude=26.8356, longitude=75.8245, estimated_emergency_cost=4500, available_icu=4, available_beds=20, capabilities="Emergency, Oncology, ICU, Oxygen", contact_phone="+91 141 2771777"),
                dict(name="Eternal Hospital · Demo", address="Jawahar Lal Nehru Marg, Jaipur", latitude=26.8958, longitude=75.8061, estimated_emergency_cost=4800, available_icu=6, available_beds=26, capabilities="Emergency, Trauma, Cardiac, Neuro, Orthopedic, Maternity, Ventilator, ICU", contact_phone="+91 141 4410000"),
            ]
            hosp_objs = [Hospital(verified=True, emergency_status="ONLINE", oxygen_available=True, trauma_capability=True, emergency_capacity=50, blood_units=40, **h) for h in demo_hospitals]
            seed_db.add_all(hosp_objs)
            await seed_db.commit()

            # Seed resource units for resource locking
            from models import HospitalResourceUnit
            resource_units = []
            for h in hosp_objs:
                for b in range(1, 4):
                    resource_units.append(HospitalResourceUnit(
                        hospital_id=h.id,
                        resource_type="ICU_BED",
                        unit_identifier=f"ICU-{h.id}-{b:02d}",
                        status="AVAILABLE"
                    ))
            seed_db.add_all(resource_units)
            await seed_db.commit()

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
