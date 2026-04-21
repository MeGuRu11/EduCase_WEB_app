"""Import all ORM models so Alembic's autogenerate can see them."""

from models.node_content import FormTemplate, FormTemplateField
from models.user import Discipline, Group, Role, TeacherGroup, Topic, User

__all__ = [
    "Discipline",
    "FormTemplate",
    "FormTemplateField",
    "Group",
    "Role",
    "TeacherGroup",
    "Topic",
    "User",
]
