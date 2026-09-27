"""
Seed 20 Jaipur Hospitals into the Hospital table.
Inserts as new rows if a hospital with the same name doesn't already exist; skips duplicates.
"""
import asyncio
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.future import select
from database import engine, SessionLocal
from models.base import Base
from models import Hospital

JAIPUR_HOSPITALS = [
    {
        "name": "Manipal Hospital Jaipur",
        "address": "Sikar Rd, Sector 2, Vidyadhar Nagar, Jaipur, Rajasthan 302039",
        "latitude": 26.9687055,
        "longitude": 75.7734221,
        "contact_phone": "+91 91166 56540",
    },
    {
        "name": "Shalby Multi-Specialty Hospital",
        "address": "200 Feet Bypass Rd, Vaishali Nagar, Jaipur, Rajasthan 302021",
        "latitude": 26.9035766,
        "longitude": 75.7292137,
        "contact_phone": "+91 90579 01410",
    },
    {
        "name": "CK Birla Hospitals (RBH)",
        "address": "Gopalpura Bypass Rd, near Triveni Bridge, Jaipur, Rajasthan 302018",
        "latitude": 26.8624464,
        "longitude": 75.7846449,
        "contact_phone": "+91 74128 90005",
    },
    {
        "name": "Narayana Multispeciality Hospital",
        "address": "Sector 28, Kumbha Marg, Pratap Nagar, Sanganer, Jaipur, Rajasthan 302033",
        "latitude": 26.7949476,
        "longitude": 75.8253632,
        "contact_phone": "+91 80 6215 4396",
    },
    {
        "name": "Rungta Hospital",
        "address": "Calgiri Marg, Jhalana Gram, Malviya Nagar, Jaipur, Rajasthan 302017",
        "latitude": 26.8573728,
        "longitude": 75.8152224,
        "contact_phone": "+91 89550 00333",
    },
    {
        "name": "Fortis Escorts Hospital",
        "address": "Jawahar Lal Nehru Marg, Sector 5, Jaipur, Rajasthan 302018",
        "latitude": 26.8463447,
        "longitude": 75.8034836,
        "contact_phone": "+91 77420 94001",
    },
    {
        "name": "RHL Rajasthan Hospital",
        "address": "Jawahar Lal Nehru Marg, Jai Jawan Colony, Jaipur, Rajasthan 302018",
        "latitude": 26.8557993,
        "longitude": 75.802488,
        "contact_phone": "+91 141 272 0020",
    },
    {
        "name": "Santokba Durlabhji Memorial Hospital (SDMH)",
        "address": "Bhawani Singh Rd, Rambagh, Jaipur, Rajasthan 302004",
        "latitude": 26.8942695,
        "longitude": 75.8125914,
        "contact_phone": "+91 141 352 4444",
    },
    {
        "name": "Shekhawati Hospital & Research Centre",
        "address": "Sector 2, Central Spine, Vidyadhar Nagar, Jaipur, Rajasthan 302039",
        "latitude": 26.9598455,
        "longitude": 75.774765,
        "contact_phone": "+91 94140 45918",
    },
    {
        "name": "Apex Hospitals",
        "address": "SP-4 & 6, Central Marg, Malviya Nagar, Jaipur, Rajasthan 302017",
        "latitude": 26.8547693,
        "longitude": 75.8252627,
        "contact_phone": "+91 98290 30011",
    },
    {
        "name": "Sawai Man Singh (SMS) Hospital",
        "address": "Jawahar Lal Nehru Marg, Ashok Nagar, Jaipur, Rajasthan 302001",
        "latitude": 26.906234,
        "longitude": 75.8163148,
        "contact_phone": "+91 141 256 0291",
    },
    {
        "name": "Zanana Hospital",
        "address": "Chand-Pole Gate, Station Rd, Sindhi Camp, Jaipur, Rajasthan 302006",
        "latitude": 26.9262568,
        "longitude": 75.8069439,
        "contact_phone": "+91 141 231 9350",
    },
    {
        "name": "Govt. Satellite Hospital Bani Park",
        "address": "Shiv Marg, Bani Park, Jaipur, Rajasthan 302016",
        "latitude": 26.9286287,
        "longitude": 75.7974239,
        "contact_phone": "",
    },
    {
        "name": "Mahila Chikitsalaya",
        "address": "Moti Doongri Rd, opposite Sangneri Gate, Adarsh Nagar, Jaipur, Rajasthan 302003",
        "latitude": 26.9143594,
        "longitude": 75.8241629,
        "contact_phone": "",
    },
    {
        "name": "S R Goyal Govt. Hospital",
        "address": "Temple Road, Sethi Colony, Jaipur, Rajasthan 302004",
        "latitude": 26.9022446,
        "longitude": 75.8418276,
        "contact_phone": "",
    },
    {
        "name": "Rukmani Devi Beni Prasad Jaipuria Hospital",
        "address": "Hospital Rd, Indra Nagar, Basant Vihar, Jaipur, Rajasthan 302018",
        "latitude": 26.8568075,
        "longitude": 75.800823,
        "contact_phone": "+91 141 255 2034",
    },
    {
        "name": "Haribux Kanwatia Government Hospital",
        "address": "Shastri Nagar, Jaipur, Rajasthan 302016",
        "latitude": 26.9449359,
        "longitude": 75.7980644,
        "contact_phone": "",
    },
    {
        "name": "Bani Park Government Hospital (UPHC)",
        "address": "Janta Colony, Sindhi Colony, Bani Park, Jaipur, Rajasthan 302016",
        "latitude": 26.9331465,
        "longitude": 75.789654,
        "contact_phone": "",
    },
    {
        "name": "Gangori Hospital (Pandit Deendayal Upadhyaya Hospital)",
        "address": "Gangori Bazar Rd, Kanwar Nagar, Jaipur, Rajasthan 302001",
        "latitude": 26.9302561,
        "longitude": 75.8204112,
        "contact_phone": "+91 141 232 9050",
    },
    {
        "name": "Govt. Hospital Triveni Nagar",
        "address": "10 B Scheme, Triveni Nagar, Arjun Nagar, Jaipur, Rajasthan 302018",
        "latitude": 26.8701405,
        "longitude": 75.77808,
        "contact_phone": "",
    },
]

async def seed_jaipur_hospitals():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        result = await session.execute(select(Hospital.name))
        existing_names = {row[0] for row in result.all()}
        
        inserted = 0
        skipped = 0
        for h in JAIPUR_HOSPITALS:
            if h["name"] in existing_names:
                skipped += 1
                continue
            
            is_govt = any(w in h["name"].lower() for w in ["govt", "government", "sms", "swasthya", "charitable"])
            ins_list = (
                ["RGHS", "PMJAY", "CGHS", "ECHS", "ESIC"]
                if is_govt
                else ["RGHS", "PMJAY", "STAR_HEALTH", "HDFC_ERGO", "ICICI_LOMBARD", "CARE_HEALTH", "NIVA_BUPA", "BAJAJ_ALLIANZ", "NEW_INDIA", "UNITED_INDIA"]
            )
            hosp = Hospital(
                name=h["name"],
                address=h["address"],
                latitude=h["latitude"],
                longitude=h["longitude"],
                contact_phone=h["contact_phone"] or "+91 141 2560291",
                verified=True,
                emergency_status="ONLINE",
                oxygen_available=True,
                trauma_capability=True,
                emergency_capacity=50,
                available_beds=30,
                available_icu=10,
                blood_units=40,
                estimated_emergency_cost=25000,
                capabilities="Emergency Stabilization, Trauma Care, ICU",
                supported_insurance=ins_list
            )
            session.add(hosp)
            inserted += 1

        if inserted > 0:
            await session.commit()
        print(f"[Seed Jaipur Hospitals] Inserted {inserted} new hospitals, skipped {skipped} duplicates.")

if __name__ == "__main__":
    asyncio.run(seed_jaipur_hospitals())
