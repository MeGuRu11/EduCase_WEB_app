"""Idempotent seed (§S). Run once on first start — skips if roles already exist.

Execution order (§S.6):
    1. roles
    2. disciplines + topics
    3. form_templates + form_template_fields
    4. first admin (must_change_password=True)
    5. reset_serial_sequences — MUST run after explicit-id INSERTs

Invoked from main.py after Alembic upgrade when ENV var FIRST_RUN=true.
"""

from __future__ import annotations

import logging
import os

from sqlalchemy import text
from sqlalchemy.orm import Session

from database import SessionLocal
from models.node_content import FormTemplate, FormTemplateField
from models.user import Discipline, Role, Topic, User
from services.auth_service import AuthService

log = logging.getLogger("epicase.seed")


ROLES: list[dict] = [
    {"id": 1, "name": "student", "display_name": "Обучаемый"},
    {"id": 2, "name": "teacher", "display_name": "Преподаватель"},
    {"id": 3, "name": "admin", "display_name": "Администратор"},
]


# Password is read from FIRST_ADMIN_PASSWORD on first run; the dev fallback is
# kept so local Docker boots without extra env wiring. The seed always sets
# must_change_password=True so the operator is forced to rotate it.
_FIRST_ADMIN_DEV_DEFAULT = "Admin1234!"  # dev only, must rotate on first login
FIRST_ADMIN: dict = {
    "username": "admin",
    "password": os.getenv("FIRST_ADMIN_PASSWORD", _FIRST_ADMIN_DEV_DEFAULT),
    "full_name": "Администратор системы",
    "role_id": 3,
    "must_change_password": True,
}


DISCIPLINES: list[dict] = [
    {
        "id": 1,
        "name": "Общая эпидемиология",
        "order_index": 1,
        "topics": [
            {"name": "Эпидемиологическая диагностика", "order_index": 1},
            {"name": "Противоэпидемические мероприятия", "order_index": 2},
            {"name": "Иммунопрофилактика", "order_index": 3},
        ],
    },
    {
        "id": 2,
        "name": "Военная эпидемиология",
        "order_index": 2,
        "topics": [
            {"name": "Биологическая защита войск", "order_index": 1},
            {"name": "Санитарно-противоэпидемическое обеспечение", "order_index": 2},
        ],
    },
]


FORM_TEMPLATES: list[dict] = [
    {
        "id": 1,
        "name": "Экстренное извещение (форма №58)",
        "template_key": "form_58",
        "description": (
            "Извещение об инфекционном заболевании, пищевом или остром "
            "профессиональном отравлении"
        ),
        "fields": [
            {"field_key": "diagnosis", "field_label": "Диагноз", "field_type": "text",
             "is_required": True, "score_value": 3.0, "order_index": 1},
            {"field_key": "patient_fio", "field_label": "ФИО пациента", "field_type": "text",
             "is_required": True, "score_value": 1.0, "order_index": 2,
             "validation_regex": r"^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.[А-ЯЁ]\.$"},
            {"field_key": "age", "field_label": "Возраст", "field_type": "number",
             "is_required": True, "score_value": 1.0, "order_index": 3},
            {"field_key": "address", "field_label": "Адрес", "field_type": "textarea",
             "is_required": True, "score_value": 1.0, "order_index": 4},
            {"field_key": "date_onset", "field_label": "Дата заболевания", "field_type": "date",
             "is_required": True, "score_value": 2.0, "order_index": 5},
            {"field_key": "date_detected", "field_label": "Дата выявления", "field_type": "date",
             "is_required": True, "score_value": 2.0, "order_index": 6},
            {"field_key": "lab_confirmed", "field_label": "Подтверждение лабораторное",
             "field_type": "checkbox", "is_required": False, "score_value": 2.0, "order_index": 7},
            {"field_key": "hospitalized", "field_label": "Госпитализирован", "field_type": "select",
             "is_required": True, "score_value": 1.0, "order_index": 8,
             "options_json": [
                 "Да, в инфекционное отделение",
                 "Да, в другое отделение",
                 "Нет",
             ]},
            {"field_key": "sent_by", "field_label": "ФИО и должность отправителя",
             "field_type": "text", "is_required": True, "score_value": 1.0, "order_index": 9},
        ],
    },
    {
        "id": 2,
        "name": "Направление на лабораторное исследование",
        "template_key": "lab_direction",
        "description": "Форма направления биоматериала на исследование",
        "fields": [
            {"field_key": "material_type", "field_label": "Вид материала", "field_type": "select",
             "is_required": True, "score_value": 3.0, "order_index": 1,
             "options_json": [
                 "Кровь", "Моча", "Кал", "Мазок из зева",
                 "Мазок из носа", "Мокрота", "Ликвор", "Другое",
             ]},
            {"field_key": "collection_date", "field_label": "Дата забора", "field_type": "date",
             "is_required": True, "score_value": 1.0, "order_index": 2},
            {"field_key": "target", "field_label": "Цель исследования", "field_type": "text",
             "is_required": True, "score_value": 3.0, "order_index": 3},
            {"field_key": "method", "field_label": "Метод исследования", "field_type": "select",
             "is_required": True, "score_value": 2.0, "order_index": 4,
             "options_json": [
                 "ИФА (anti-HAV IgM)", "ПЦР",
                 "Бактериологический", "Микроскопический", "Серологический",
             ]},
            {"field_key": "preliminary_dx", "field_label": "Предварительный диагноз",
             "field_type": "text", "is_required": True, "score_value": 2.0, "order_index": 5},
            {"field_key": "urgency", "field_label": "Срочность", "field_type": "select",
             "is_required": True, "score_value": 1.0, "order_index": 6,
             "options_json": ["Плановое", "Срочное", "Cito!"]},
            {"field_key": "sender_sign", "field_label": "Подпись направившего",
             "field_type": "text", "is_required": True, "score_value": 1.0, "order_index": 7,
             "validation_regex": r"^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.[А-ЯЁ]\.$"},
        ],
    },
]


SEQUENCE_TABLES: list[tuple[str, str]] = [
    ("roles", "id"),
    ("disciplines", "id"),
    ("topics", "id"),
    ("form_templates", "id"),
    ("form_template_fields", "id"),
    ("users", "id"),
]


def seed_roles(db: Session) -> None:
    for row in ROLES:
        db.add(Role(**row))
    db.flush()


def seed_disciplines_and_topics(db: Session) -> None:
    for d in DISCIPLINES:
        discipline = Discipline(
            id=d["id"], name=d["name"], order_index=d["order_index"]
        )
        db.add(discipline)
        db.flush()
        for t in d["topics"]:
            db.add(
                Topic(
                    discipline_id=discipline.id,
                    name=t["name"],
                    order_index=t["order_index"],
                )
            )
    db.flush()


def seed_form_templates(db: Session) -> None:
    for tpl in FORM_TEMPLATES:
        template = FormTemplate(
            id=tpl["id"],
            name=tpl["name"],
            description=tpl["description"],
            template_key=tpl["template_key"],
        )
        db.add(template)
        db.flush()
        for f in tpl["fields"]:
            db.add(FormTemplateField(template_id=template.id, **f))
    db.flush()


def seed_first_admin(db: Session) -> None:
    if FIRST_ADMIN["password"] == _FIRST_ADMIN_DEV_DEFAULT:
        log.warning(
            "FIRST_ADMIN_PASSWORD env var not set — using dev fallback. "
            "Set FIRST_ADMIN_PASSWORD before first deploy or rotate immediately."
        )
    admin = User(
        username=FIRST_ADMIN["username"],
        password_hash=AuthService.hash_password(FIRST_ADMIN["password"]),
        full_name=FIRST_ADMIN["full_name"],
        role_id=FIRST_ADMIN["role_id"],
        must_change_password=FIRST_ADMIN["must_change_password"],
    )
    db.add(admin)
    db.flush()


def reset_serial_sequences(db: Session) -> None:
    """After explicit-id INSERTs the sequence still points at 1; bump it to
    MAX(id) so the next autogenerated id does not collide (§S.6)."""
    for table, col in SEQUENCE_TABLES:
        db.execute(
            text(
                f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), "
                f"COALESCE((SELECT MAX({col}) FROM {table}), 1), true)"
            )
        )


def seed_database() -> bool:
    """Idempotent entry-point: returns True iff any rows were inserted."""
    with SessionLocal() as db:
        if db.query(Role).count() > 0:
            log.info("Seed уже выполнен — пропускаем")
            return False

        seed_roles(db)
        seed_disciplines_and_topics(db)
        seed_form_templates(db)
        seed_first_admin(db)
        reset_serial_sequences(db)
        db.commit()
        log.info("Seed выполнен успешно")
        return True


if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    seed_database()
