"""
Seed batch 2 of 59 Jaipur Hospitals into the Hospital table.
Inserts as new rows if a hospital with the same name doesn't already exist; skips duplicates.
"""
import asyncio
import csv
import io
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.future import select
from sqlalchemy import func
from database import engine, SessionLocal
from models.base import Base
from models import Hospital

CSV_DATA = """name,type,address,latitude,longitude,phone
Eternal Multispeciality Hospital,private,"3A Jagatpura Rd near Jawahar Circle Chainpura Malviya Nagar Jaipur 302017",26.8403804,75.8057917,+91 95491 58888
Ghiya Hospital,private,"Girdhar Marg Sector 12 Rd Siddharth Nagar Malviya Nagar Jaipur 302017",26.8466865,75.8103446,+91 99296 11882
Vivekananda Institute of Mental Health and Neuro Sciences,private,"Industrial Area C-25D Malviya Nagar Industrial Area Jaipur 302017",26.8547465,75.8301909,+91 83860 45922
Agrawal Hospital (Eye),private,"Apex Circle Malviya Nagar Industrial Area Jaipur 302017",26.8547863,75.8249844,+91 141 275 0818
Shri Hospital,private,"4 Hare Krishna Marg Shyam Vihar Colony Model Town Malviya Nagar Jaipur 302017",26.8474249,75.827184,+91 141 275 2880
Forbaxy (Amar Jain Hospital),private,"374-C Amrapali Circle Block C Vaishali Nagar Jaipur 302021",26.9118849,75.7422184,+91 95492 19991
Cradle Children Hospital,private,"212 Nemi Nagar Extension Underpass Vaishali Nagar Jaipur 302021",26.9110196,75.7297841,+91 83770 10161
HOPE Hospitals Vaishali Nagar,private,"10/12-14 Sector 10 Akshardham Mandir Circle Chitrakoot Marg Vaishali Nagar Jaipur 302021",26.901904,75.7387419,+91 73003 33777
Vaishali Hospital & Surgical Research Center,private,"69 Nand Vihar Amrapali Marg Nemi Nagar Extension Vaishali Nagar Jaipur 302021",26.9114321,75.7301723,+91 87697 60077
Manas Hospital,private,"D 131 Jagdamba Nagar Rd Heerapura Girdharipura Jaipur 302021",26.8920343,75.7205988,+91 141 235 8127
Global Heart & General Hospital,private,"Gandhi Path C1 27-29 Narayani Path Vaishali Nagar Jaipur 302021",26.9056966,75.7386902,+91 141 400 6290
Medisky Hospital,private,"Gom's Defence Avenue 6 Lane Valmiki Marg Vaishali Nagar Jaipur 302021",26.9164572,75.7469945,+91 82904 84147
Maternite City Family Hospital,private,"Gate 6 near Chitrakoot stadium Akruti Apartments Vaishali Nagar Jaipur 302021",26.8989183,75.7352131,+91 90013 87431
Amar Medical & Research Centre (AMRC),private,"3 Kiran Path Mansarovar Sector 3 Jaipur 302020",26.8682838,75.7582838,+91 83370 00000
Apex Hospitals Mansarovar,private,"Ward 27 55 Rajat Path Mansarovar Sector 5 Jaipur 302020",26.8657266,75.7627953,+91 98290 30011
Saket Hospital Jaipur,private,"Sector 10 Meera Marg Ward 43 Agarwal Farm Mansarovar Jaipur 302020",26.8489914,75.7649892,+91 88750 02436
Tagore Hospital & Research Institute,private,"Tagore Lane Mansarovar Sector 7 Shipra Path Jaipur 302020",26.8586061,75.7696668,+91 96104 88886
Indus Jaipur Hospital,private,"Shipra Path near Technology Park Shanthi Nagar Mansarovar Jaipur 302020",26.8679013,75.7676382,+91 141 278 0970
Metro Mas Hospital,private,"Shipra Path near Technology Park Shanthi Nagar Mansarovar Jaipur 302020",26.8681622,75.7683366,+91 141 666 1234
Suvira Superspeciality Hospital,private,"7/C-02 Mansarovar Sector 7 Shipra Path Jaipur 302020",26.8571708,75.7727108,+91 141 486 4100
ManglamPlus Medicity Hospital,private,"Shipra Path Mansarovar Sector 5 Jaipur 302020",26.8675028,75.769342,+91 79 6911 5555
SUBHASH HOSPITAL & Research Centre,private,"122 Mahavir Nagar B VT Road Patrakar Colony Mansarovar Jaipur 302020",26.8468794,75.7562171,+91 96104 46622
Srishti Hospital,private,"F1&10 Central Spine Mahal Road Jagatpura Jaipur 302017",26.7990486,75.8557293,+91 93762 66610
Jeevan Rekha Superspeciality Hospital,private,"S24 Central Spine Mahal Yojana Jagatpura Jaipur 302017",26.8007993,75.8620587,+91 141 484 6060
Rishab Hospital,private,"Rishab Hospital Choraha Vishwa Vidhyalaya Nagar Jagatpura Jaipur 302017",26.8182941,75.8509325,+91 92570 43779
JNU Main Campus Hospital,government,"Agra Jaipur Rd near New RTO Office Jagatpura Jaipur 302017",26.8560007,75.8759327,+91 141 311 9000
Aarogyam Hospital,private,"Aarogyam Hospital Road Jagatpura Jaipur 302017",26.8350509,75.8208177,+91 95295 49090
Jaipur Hospital (Tonk Rd),private,"Tonk Rd near SMS Stadium Lalkothi Jaipur 302015",26.8924691,75.8048012,+91 141 274 1465
Jaipur Hospital Mahaveer Nagar,private,"Mahaveer Nagar S16A S17 Tonk Rd Gopal Pura Mode Jaipur 302018",26.8574458,75.794974,+91 74140 01001
Cocoon Hospital,private,"14 Tonk Rd Chandrakala Colony Mata Colony Jaipur 302016",26.8435129,75.7946218,+91 89298 16349
SG Hospital Jaipur,private,"K8 Tonk Rd Income Tax Colony Durgapura Jaipur 302018",26.8519358,75.7948031,+91 98290 61197
Khandaka Hospital,private,"Kailash Puri 160 161 Tonk Rd opposite Sanghi Farm Jaipur 302018",26.8565451,75.7961374,+91 141 272 2922
Mahatma Gandhi Hospital Jaipur,government,"RIICO Institutional Area Mahatma Gandhi Rd Sitapura Jaipur 302022",26.7698706,75.854936,+91 141 277 1777
Surya Hospitals Jaipur,private,"Gate 1 Sawai Ram Singh Road opp SMS Hospital Ashok Nagar Jaipur 302001",26.9052191,75.8140333,+91 72320 33777
SR Kalla Hospital Jaipur,private,"78-79 Dhuleshwar Garden Sardar Patel Marg C Scheme Jaipur 302006",26.9132223,75.7970955,+91 70230 07777
Pandya Hospital,private,"J 2/37 Mahavir Marg opposite Jai Club C Scheme Ashok Nagar Jaipur 302001",26.9136785,75.8127591,+91 141 237 0209
Apollo Spectra Hospitals Jaipur,private,"Plot 5 Sahakar Marg near Rajasthan Vidhan Sabha Lalkothi Jaipur 302015",26.8926834,75.7950627,+91 40 6914 6071
Asian Superspeciality Hospital & Trauma Centre,private,"near Zanana Hospital Pareek College Road Chandpole Subhash Nagar Jaipur 302016",26.9286505,75.8043121,+91 93093 33333
Pink Vinayak Hospital,private,"46 Dhuleshwar Garden Sardar Patel Marg C Scheme Jaipur 302001",26.9148287,75.7984417,
Heart And General Hospital,private,"7 Vivekanand Marg C Scheme Ashok Nagar Jaipur 302001",26.9086826,75.8108759,+91 141 237 0271
Rajdhani Hospital,private,"C-30 Bhagwan Das Rd C Scheme Ashok Nagar Jaipur 302001",26.9116618,75.8070802,+91 141 237 1202
Eternal Hospital Sanganer,private,"Eternal Hospital Sanganer Jaipur 302029",26.8186406,75.7948262,+91 72310 44444
Jeevan Rekha Multispeciality Hospital Sanganer,private,"C-1 Corner Sec-7 HG-2 Haldighati Marg Pratap Nagar Sanganer Jaipur 302033",26.806804,75.8183082,+91 98879 29887
Sparsh Hospital,private,"2nd New Sanganer Rd Asind Nagar Dada Gurudev Nagar Sanganer Jaipur 302029",26.8225822,75.7799733,+91 141 273 3348
Priyush Multispeciality Hospital,private,"Diggi Rd near Chordia Petrol Pump Dada Gurudev Nagar Sanganer Jaipur 302029",26.8169961,75.7821411,+91 99820 88811
Advance Hospital,private,"Sirohiya Ki Dhani Rd Sirothia Colony Dada Gurudev Nagar Sanganer Jaipur 302029",26.8008316,75.7722883,
Star Hospital,private,"near Pratap Plaza Sanganer Sector 5 Pratap Nagar Jaipur 302033",26.8025788,75.8087155,+91 82392 52272
Ace Hospital,private,"1st 22 Muhana Mandi Rd Sumer Nagar Mansarovar Jaipur 302020",26.8353063,75.7587951,+91 73003 97327
Bagra Hospital Sanganer,private,"Saipura Madrampur Sanganer Jaipur 302006",26.7798579,75.7629492,+91 98286 88021
Sanjeevani Hospital And Medical Research Institute,private,"New Sanganer Rd opp Metro Piller 91 Vivek Vihar Jaipur 302019",26.8897817,75.7683860,+91 99280 27253
Mittal Hospital and Research Centre,private,"opposite RTO office Sector 10 Vishwakarma Industrial Area Vidyadhar Nagar Jaipur 302039",26.9679822,75.7877175,+91 77270 88007
Dana Shivam Heart & Superspeciality Hospital,private,"Time Square Ganesh Park Rd Sector 2 Central Spine Vidyadhar Nagar Jaipur 302039",26.9602022,75.7775894,+91 91160 03461
Manjeet Children Hospital (DMICC),private,"Institutional Block Plot 14 near RTO Sector 10 Vidyadhar Nagar Jaipur 302039",26.9682676,75.7882025,+91 91160 06800
RISHIK HOSPITALS,private,"17 near ECHS Clinic Jamuna Colony Radha Govind Colony Vidyadhar Nagar Jaipur 302013",26.9588623,75.7727258,+91 73003 33555
Shri Krishna Hospital,private,"1/31 Sector 1 Rd Sector-1 Vidyadhar Nagar Jaipur 302039",26.9537713,75.7764203,+91 141 223 2312
Dr NC Poonia Neuro Care Hospital & Research Centre,private,"1/611 Sector 2 Sector-1 Vidyadhar Nagar Jaipur 302039",26.9558409,75.7766533,+91 141 223 6712
Venus Orthopaedic & Superspeciality Hospital,private,"33 Main Sikar Rd opposite Bus Depo Vidyadhar Nagar Jaipur 302039",26.9639137,75.7717487,
JK Lone Hospital,government,"Jawahar Lal Nehru Marg Gangawal Park Adarsh Nagar Jaipur 302004",26.9012976,75.8180023,
ESIC Model Hospital,government,"Ajmer Rd Shanti Nagar Sodala Jaipur 302006",26.9069701,75.7774754,+91 1800 11 2526
"""

async def seed_batch_2():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    reader = csv.DictReader(io.StringIO(CSV_DATA.strip()))
    hospitals_to_seed = list(reader)

    async with SessionLocal() as session:
        result = await session.execute(select(Hospital.name))
        existing_names = {row[0].strip() for row in result.all()}

        inserted = 0
        skipped = 0

        for row in hospitals_to_seed:
            name = row["name"].strip()
            if name in existing_names:
                skipped += 1
                continue

            lat = float(row["latitude"])
            lng = float(row["longitude"])
            phone = row.get("phone", "").strip() or "+91 141 2560291"
            address = row.get("address", "").strip()

            is_govt = any(w in name.lower() for w in ["govt", "government", "sms", "swasthya", "charitable", "state"])
            ins_list = (
                ["RGHS", "PMJAY", "CGHS", "ECHS", "ESIC"]
                if is_govt
                else ["RGHS", "PMJAY", "STAR_HEALTH", "HDFC_ERGO", "ICICI_LOMBARD", "CARE_HEALTH", "NIVA_BUPA", "BAJAJ_ALLIANZ", "NEW_INDIA", "UNITED_INDIA"]
            )
            hosp = Hospital(
                name=name,
                address=address,
                latitude=lat,
                longitude=lng,
                contact_phone=phone,
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
            existing_names.add(name)
            inserted += 1

        if inserted > 0:
            await session.commit()

        # Validation & Verification queries
        total_res = await session.execute(select(func.count(Hospital.id)))
        total_count = total_res.scalar()

        distinct_res = await session.execute(select(func.count(func.distinct(Hospital.name))))
        distinct_count = distinct_res.scalar()

        # Check any duplicates
        dup_query = select(Hospital.name, func.count(Hospital.id)).group_by(Hospital.name).having(func.count(Hospital.id) > 1)
        dup_res = await session.execute(dup_query)
        duplicates = dup_res.all()

        print(f"[Seed Batch 2 Result]")
        print(f"  Inserted: {inserted}")
        print(f"  Skipped (already existing): {skipped}")
        print(f"  Total Hospitals in DB: {total_count}")
        print(f"  Distinct Hospital Names: {distinct_count}")
        print(f"  Duplicate Groups Found: {len(duplicates)}")
        if duplicates:
            for d in duplicates:
                print(f"    - Duplicate: {d[0]} (count: {d[1]})")

if __name__ == "__main__":
    asyncio.run(seed_batch_2())
