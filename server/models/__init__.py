"""Import all ORM models so Alembic's autogenerate can see them."""

from models.media import MediaFile
from models.node_content import FormTemplate, FormTemplateField
from models.scenario import Scenario, ScenarioEdge, ScenarioGroup, ScenarioNode
from models.user import Discipline, Group, Role, TeacherGroup, Topic, User

__all__ = [
    "Discipline",
    "FormTemplate",
    "FormTemplateField",
    "Group",
    "MediaFile",
    "Role",
    "Scenario",
    "ScenarioEdge",
    "ScenarioGroup",
    "ScenarioNode",
    "TeacherGroup",
    "Topic",
    "User",
]
