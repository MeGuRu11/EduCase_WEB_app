"""Import all ORM models so Alembic's autogenerate can see them."""

from models.attempt import Attempt, AttemptStep
from models.audit_log import AuditLog
from models.media import MediaFile
from models.node_content import FormTemplate, FormTemplateField
from models.scenario import Scenario, ScenarioEdge, ScenarioGroup, ScenarioNode
from models.token_blacklist import TokenBlacklist
from models.user import Discipline, Group, Role, TeacherGroup, Topic, User

__all__ = [
    "Attempt",
    "AttemptStep",
    "AuditLog",
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
    "TokenBlacklist",
    "Topic",
    "User",
]
