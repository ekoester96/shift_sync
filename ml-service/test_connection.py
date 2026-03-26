# test_connection.py — run with: python test_connection.py

import pyodbc
import os
from dotenv import load_dotenv

load_dotenv()

# 1. Check what drivers are available
print("Available ODBC drivers:")
for driver in pyodbc.drivers():
    print(f"  - {driver}")

# 2. Try connecting
DB_SERVER = os.getenv("DB_SERVER")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

print(f"\nConnecting to: {DB_SERVER} / {DB_NAME} as {DB_USER}")

# Try each available SQL Server driver
sql_drivers = [d for d in pyodbc.drivers() if 'SQL Server' in d]
print(f"SQL Server drivers found: {sql_drivers}\n")

for driver in sql_drivers:
    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={DB_SERVER};"
        f"DATABASE={DB_NAME};"
        f"UID={DB_USER};"
        f"PWD={DB_PASSWORD};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=yes;"
    )
    print(f"Trying driver: {driver}")
    print(f"Connection string: {conn_str}\n")
    try:
        conn = pyodbc.connect(conn_str, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM employee")
        count = cursor.fetchone()[0]
        print(f"  ✅ SUCCESS — {count} employees found")
        conn.close()
        print(f"\n  Use this driver: {driver}")
        break
    except Exception as e:
        print(f"  ❌ FAILED: {e}\n")