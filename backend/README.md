# Backend Setup

1. Create virtual environment:
`python -m venv venv`
2. Activate:
`venv\Scripts\activate` (Windows)
3. Install dependencies:
`pip install -r requirements.txt`
4. Seed the DB:
`python seed.py`
5. Run the server:
`uvicorn main:app --reload`
