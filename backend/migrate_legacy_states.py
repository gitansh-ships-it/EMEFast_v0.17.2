import sqlite3
from pathlib import Path

db_path = Path(__file__).resolve().parent / "emefast.db"
if not db_path.exists():
    print(f"Database {db_path} does not exist.")
    exit(0)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("--- Running Canonical CaseState Data Migration ---")
cur.execute("UPDATE emergency_cases SET status = 'WAITING_FOR_RESPONSES' WHERE status IN ('SEARCHING', 'AWAITING_RESPONSE')")
print(f"Updated SEARCHING / AWAITING_RESPONSE -> WAITING_FOR_RESPONSES: {cur.rowcount} rows")

cur.execute("UPDATE emergency_cases SET status = 'HOSPITAL_ACCEPTED' WHERE status = 'ACCEPTED'")
print(f"Updated ACCEPTED -> HOSPITAL_ACCEPTED: {cur.rowcount} rows")

cur.execute("UPDATE emergency_cases SET status = 'HOSPITAL_SELECTED' WHERE status IN ('EN_ROUTE', 'ARRIVED')")
print(f"Updated EN_ROUTE / ARRIVED -> HOSPITAL_SELECTED: {cur.rowcount} rows")

cur.execute("UPDATE emergency_cases SET status = 'COMPLETED' WHERE status = 'CLOSED'")
print(f"Updated CLOSED -> COMPLETED: {cur.rowcount} rows")

conn.commit()

print("\n--- Current Emergency Cases After Migration ---")
cur.execute("SELECT id, case_code, status, created_at FROM emergency_cases")
rows = cur.fetchall()
for r in rows:
    print(r)

print(f"\nTotal cases verified: {len(rows)}")
conn.close()
