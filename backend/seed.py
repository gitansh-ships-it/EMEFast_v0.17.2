"""
EMEFast Database Seeding Script
================================
Initializes database schema and seeds:
- 7 Verified Demo Hospitals labeled '· Demo Node'
- 21 HospitalResourceUnit rows (3 ICU beds per hospital)
- Default authorized demo accounts (Admin, Hospital Desk, Paramedic)
  configured via SEED_*_PASSWORD environment variables.
"""

import asyncio
import os
import sys
from pathlib import Path

# Ensure backend directory is in python search path
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.future import select
from database import engine, SessionLocal
from models.base import Base
from models import Hospital, HospitalResourceUnit, User
from auth import get_password_hash

DEMO_HOSPITALS = [
    dict(
        name="SMS Hospital",
        address="Jawahar Lal Nehru Marg, Jaipur",
        latitude=26.8920,
        longitude=75.8180,
        estimated_emergency_cost=2500,
        available_icu=8,
        available_beds=34,
        capabilities="Emergency, Trauma, Cardiac, Neuro, Orthopedic, Pediatric, Maternity, Ventilator, ICU",
        contact_phone="+91 141 2560291"
    ),
    dict(
        name="Fortis Hospital",
        address="Malviya Nagar, Jaipur",
        latitude=26.8540,
        longitude=75.8063,
        estimated_emergency_cost=3000,
        available_icu=6,
        available_beds=28,
        capabilities="Emergency, Trauma, Cardiac, Neuro, Orthopedic, Ventilator, ICU",
        contact_phone="+91 141 2547000"
    ),
    dict(
        name="Narayana Hospital",
        address="Pratap Nagar, Jaipur",
        latitude=26.8065,
        longitude=75.8280,
        estimated_emergency_cost=3500,
        available_icu=7,
        available_beds=30,
        capabilities="Emergency, Trauma, Cardiac, Orthopedic, Pediatric, Ventilator, ICU",
        contact_phone="+91 141 7122222"
    ),
    dict(
        name="Manipal Hospital",
        address="Sector 5, Vidhyadhar Nagar, Jaipur",
        latitude=26.9638,
        longitude=75.7788,
        estimated_emergency_cost=4200,
        available_icu=5,
        available_beds=24,
        capabilities="Emergency, Trauma, Cardiac, Neuro, Orthopedic, Ventilator, ICU",
        contact_phone="+91 141 5165000"
    ),
    dict(
        name="Rukmani Birla Hospital",
        address="Durgapura, Jaipur",
        latitude=26.8567,
        longitude=75.7892,
        estimated_emergency_cost=3900,
        available_icu=5,
        available_beds=22,
        capabilities="Emergency, Trauma, Cardiac, Neuro, Maternity, Ventilator, ICU",
        contact_phone="+91 141 3528888"
    ),
    dict(
        name="Mahaveer Cancer Hospital",
        address="Jagatpura, Jaipur",
        latitude=26.8356,
        longitude=75.8245,
        estimated_emergency_cost=4500,
        available_icu=4,
        available_beds=20,
        capabilities="Emergency, Oncology, ICU, Oxygen",
        contact_phone="+91 141 2771777"
    ),
    dict(
        name="Eternal Hospital",
        address="Jawahar Lal Nehru Marg, Jaipur",
        latitude=26.8958,
        longitude=75.8061,
        estimated_emergency_cost=4800,
        available_icu=6,
        available_beds=26,
        capabilities="Emergency, Trauma, Cardiac, Neuro, Orthopedic, Maternity, Ventilator, ICU",
        contact_phone="+91 141 4410000"
    ),
]

async def seed_database():
    env_name = os.getenv("ENVIRONMENT", "development").lower().strip()
    admin_pwd = os.getenv("SEED_ADMIN_PASSWORD")
    hosp_pwd = os.getenv("SEED_HOSPITAL_PASSWORD")
    amb_pwd = os.getenv("SEED_USER_PASSWORD")

    if os.getenv("RENDER") or env_name == "production":
        if not admin_pwd or not hosp_pwd or not amb_pwd:
            raise RuntimeError(
                "Production seeding halted: SEED_ADMIN_PASSWORD, SEED_HOSPITAL_PASSWORD, "
                "and SEED_USER_PASSWORD environment variables must be explicitly provided in production. "
                "Default fallback passwords are strictly forbidden in production."
            )
        if any(p.startswith("DevOnly-") for p in [admin_pwd, hosp_pwd, amb_pwd]):
            raise RuntimeError(
                "Production seeding halted: Development fallback passwords cannot be used in production."
            )
    else:
        admin_pwd = admin_pwd or "DevOnly-AdminSecret-ChangeMe!"
        hosp_pwd = hosp_pwd or "DevOnly-HospSecret-ChangeMe!"
        amb_pwd = amb_pwd or "DevOnly-UserSecret-ChangeMe!"

    print("[EMEFast] Initializing database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[EMEFast] Tables verified/created successfully.")

    async with SessionLocal() as session:
        # Check existing hospitals
        existing_hospitals = (await session.execute(select(Hospital))).scalars().all()
        if not existing_hospitals:
            print(f"[EMEFast] Seeding {len(DEMO_HOSPITALS)} verified demo hospitals...")
            hosp_objs = [
                Hospital(
                    verified=True,
                    emergency_status="ONLINE",
                    oxygen_available=True,
                    trauma_capability=True,
                    emergency_capacity=50,
                    blood_units=40,
                    **h
                )
                for h in DEMO_HOSPITALS
            ]
            session.add_all(hosp_objs)
            await session.commit()
            print(f"[EMEFast] Inserted {len(hosp_objs)} hospitals successfully.")
        else:
            print(f"[EMEFast] {len(existing_hospitals)} hospitals exist. Updating hospital names and coordinates...")
            for h in existing_hospitals:
                h.name = h.name.replace(" · Demo Node", "").replace(" · Demo", "")
                if "SMS Hospital" in h.name:
                    h.latitude = 26.8920
                    h.longitude = 75.8180
            await session.commit()
            hosp_objs = existing_hospitals

        # Check existing resource units
        existing_units = (await session.execute(select(HospitalResourceUnit))).scalars().all()
        if not existing_units:
            print(f"[EMEFast] Seeding 21 ICU resource units (3 per hospital)...")
            resource_units = []
            for h in hosp_objs:
                for b in range(1, 4):
                    resource_units.append(
                        HospitalResourceUnit(
                            hospital_id=h.id,
                            resource_type="ICU_BED",
                            unit_identifier=f"ICU-{h.id}-{b:02d}",
                            status="AVAILABLE"
                        )
                    )
            session.add_all(resource_units)
            await session.commit()
            print(f"[EMEFast] Inserted {len(resource_units)} ICU resource units successfully.")
        else:
            print(f"[EMEFast] {len(existing_units)} resource units already present.")


        existing_admin = (await session.execute(select(User).where(User.email == "admin@emefast.example"))).scalar_one_or_none()
        if not existing_admin:
            print("[EMEFast] Seeding authorized demo accounts...")
            demo_users = [
                User(
                    name="State Emergency Director",
                    email="admin@emefast.example",
                    phone="+91 141 2220000",
                    password_hash=get_password_hash(admin_pwd),
                    role="ADMIN",
                    hospital_id=None
                ),
                User(
                    name="SMS ER Desk Chief",
                    email="hospital-sms@emefast.example",
                    phone="+91 141 2560291",
                    password_hash=get_password_hash(hosp_pwd),
                    role="HOSPITAL",
                    hospital_id=1
                ),
                User(
                    name="Fortis ER Coordinator",
                    email="hospital-fortis@emefast.example",
                    phone="+91 141 2547000",
                    password_hash=get_password_hash(hosp_pwd),
                    role="HOSPITAL",
                    hospital_id=2
                ),
                User(
                    name="Ambulance Paramedic",
                    email="ambulance@emefast.example",
                    phone="+91 9829012345",
                    password_hash=get_password_hash(amb_pwd),
                    role="USER",
                    hospital_id=None
                ),
            ]
            session.add_all(demo_users)
            await session.commit()
            print(f"[EMEFast] Created {len(demo_users)} authorized demo user accounts.")
        else:
            print("[EMEFast] Synchronizing demo accounts password hashes...")
            existing_admin.password_hash = get_password_hash(admin_pwd)
            h1 = (await session.execute(select(User).where(User.email == "hospital-sms@emefast.example"))).scalar_one_or_none()
            if h1:
                h1.password_hash = get_password_hash(hosp_pwd)
            h2 = (await session.execute(select(User).where(User.email == "hospital-fortis@emefast.example"))).scalar_one_or_none()
            if h2:
                h2.password_hash = get_password_hash(hosp_pwd)
            amb = (await session.execute(select(User).where(User.email == "ambulance@emefast.example"))).scalar_one_or_none()
            if amb:
                amb.password_hash = get_password_hash(amb_pwd)
            await session.commit()
            print("[EMEFast] Demo user password hashes synchronized.")

    print("[EMEFast] Seeding completed successfully.")

if __name__ == "__main__":
    asyncio.run(seed_database())
