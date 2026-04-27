"""Audit-log writer — pre-Stage-4 hardening.

``log_action`` writes one ``audit_logs`` row inside the *caller's* transaction;
it never commits. The caller (request handler / scheduler job) keeps full
control of transactional boundaries.

Naming convention — ``action`` is dotted ``<entity>.<verb>``:
* ``user.create``, ``user.update``, ``user.block``, ``user.unblock``
* ``user.bulk_csv``  (a single batch row, ``meta.count = N``)
* ``group.create``, ``group.update``, ``group.delete``
* ``group.assign_teacher``, ``group.remove_teacher``
* ``scenario.create``, ``scenario.save_graph``, ``scenario.publish``,
  ``scenario.unpublish``, ``scenario.archive``, ``scenario.duplicate``,
  ``scenario.delete``, ``scenario.assign``
* ``attempt.finish``, ``attempt.abandon``, ``attempt.auto_finish`` (system)
* ``user.logout`` (Task 2 / JTI blacklist)
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from models.audit_log import AuditLog


class AuditService:
    @staticmethod
    def log_action(
        db: Session,
        *,
        actor_id: int | None,
        action: str,
        entity_type: str,
        entity_id: int | None = None,
        meta: dict[str, Any] | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            meta=meta or {},
        )
        db.add(entry)
        db.flush()
        return entry


# Convenience wrapper that mirrors the calling style used in services —
# ``audit_service.log_action(db, actor_id=..., action=...)`` reads naturally.
def log_action(
    db: Session,
    *,
    actor_id: int | None,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    meta: dict[str, Any] | None = None,
) -> AuditLog:
    return AuditService.log_action(
        db,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        meta=meta,
    )
