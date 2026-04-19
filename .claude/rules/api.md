---
paths:
  - "server/routers/**/*.py"
  - "server/schemas/**/*.py"
---
# API Rules
- Validate ALL inputs with Pydantic
- HTTP codes: 400, 401, 403, 404, 409, 422, 500
- Paginated lists: {items, total, page, pages}
- Error format: {"detail": "message"}
