---
paths:
  - "server/**/*.py"
---
# Backend Rules
- Depends(get_db), require_role() on every protected route
- Pydantic v2 for ALL request/response
- SQLAlchemy ORM only, NEVER raw SQL
- bcrypt cost=12, JWT access 8h / refresh 7d
- pytest + httpx for tests
