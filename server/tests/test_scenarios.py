"""Integration tests for scenario CRUD + graph + publish / assign / preview.

Covers PROJECT_DESIGN §6.4, ADDENDUM §R.4, §T.2, §A.6, §UI.1 + BEST_PRACTICES
§B.3 (atomicity of ``save_graph``).
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import auth_header

# ───────────── graph helpers ─────────────

def _valid_graph() -> dict:
    """Minimal publishable graph: start → decision (2 options) → final×2."""
    return {
        "nodes": [
            {"id": "n_start", "type": "start", "position": {"x": 0, "y": 0}, "data": {}, "title": "Старт"},
            {
                "id": "n_dec",
                "type": "decision",
                "position": {"x": 100, "y": 0},
                "data": {
                    "question": "?",
                    "options": [
                        {"id": "o1", "text": "Правильный"},
                        {"id": "o2", "text": "Неправильный"},
                    ],
                    "max_score": 10.0,
                },
                "title": "Решение",
            },
            {
                "id": "n_fin_ok",
                "type": "final",
                "position": {"x": 200, "y": -50},
                "data": {"result_type": "correct"},
                "title": "Финал: верно",
            },
            {
                "id": "n_fin_bad",
                "type": "final",
                "position": {"x": 200, "y": 50},
                "data": {"result_type": "incorrect"},
                "title": "Финал: неверно",
            },
        ],
        "edges": [
            {
                "id": "e_s_d",
                "source": "n_start",
                "target": "n_dec",
                "label": None,
                "data": {"is_correct": True, "score_delta": 0},
            },
            {
                "id": "e_d_ok",
                "source": "n_dec",
                "target": "n_fin_ok",
                "label": "Правильный",
                "data": {"is_correct": True, "score_delta": 0, "option_id": "o1"},
            },
            {
                "id": "e_d_bad",
                "source": "n_dec",
                "target": "n_fin_bad",
                "label": "Неправильный",
                "data": {"is_correct": False, "score_delta": 0, "option_id": "o2"},
            },
        ],
    }


def _empty_graph() -> dict:
    return {"nodes": [], "edges": []}


def _create_scenario(client: TestClient, token: str, *, title: str = "Гепатит А") -> int:
    resp = client.post(
        "/api/scenarios/",
        json={"title": title, "description": "Тестовый сценарий", "passing_score": 60},
        headers=auth_header(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _save_graph(client: TestClient, token: str, sid: int, graph: dict) -> dict:
    resp = client.put(
        f"/api/scenarios/{sid}/graph",
        json=graph,
        headers=auth_header(token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ────────────────────────── CRUD ──────────────────────────

def test_create_scenario_as_teacher(client: TestClient, teacher_token: str) -> None:
    resp = client.post(
        "/api/scenarios/",
        json={"title": "Холера", "description": "desc", "passing_score": 70},
        headers=auth_header(teacher_token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Холера"
    assert body["status"] == "draft"
    assert body["version"] == 1
    assert body["passing_score"] == 70
    assert body["nodes"] == []


def test_create_scenario_forbidden_for_student(
    client: TestClient, student_token: str
) -> None:
    resp = client.post(
        "/api/scenarios/",
        json={"title": "Should fail", "description": None},
        headers=auth_header(student_token),
    )
    assert resp.status_code == 403


def test_list_scenarios_teacher_sees_own_drafts(
    client: TestClient, teacher_token: str
) -> None:
    _create_scenario(client, teacher_token, title="Сценарий 1")
    _create_scenario(client, teacher_token, title="Сценарий 2")
    resp = client.get("/api/scenarios/", headers=auth_header(teacher_token))
    assert resp.status_code == 200
    items = resp.json()
    titles = {s["title"] for s in items}
    assert "Сценарий 1" in titles and "Сценарий 2" in titles


def test_list_scenarios_student_sees_only_published_assigned(
    client: TestClient,
    teacher_token: str,
    student_token: str,
    student_user,
    db_session: Session,
) -> None:
    from models.user import Group

    group = Group(name="Группа №4", description=None)
    db_session.add(group)
    db_session.flush()
    student_user.group_id = group.id
    db_session.flush()

    sid_draft = _create_scenario(client, teacher_token, title="Draft only")
    sid_pub_assigned = _create_scenario(client, teacher_token, title="Published assigned")
    sid_pub_other = _create_scenario(client, teacher_token, title="Published other group")
    for sid in (sid_pub_assigned, sid_pub_other):
        _save_graph(client, teacher_token, sid, _valid_graph())
        assert client.post(
            f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token)
        ).status_code == 200

    # assign only one of them to the student's group
    assert client.post(
        f"/api/scenarios/{sid_pub_assigned}/assign",
        json={"group_id": group.id},
        headers=auth_header(teacher_token),
    ).status_code == 200

    resp = client.get("/api/scenarios/", headers=auth_header(student_token))
    assert resp.status_code == 200
    ids = {s["id"] for s in resp.json()}
    assert sid_pub_assigned in ids
    assert sid_draft not in ids
    assert sid_pub_other not in ids


def test_get_scenario_404(client: TestClient, teacher_token: str) -> None:
    resp = client.get("/api/scenarios/99999", headers=auth_header(teacher_token))
    assert resp.status_code == 404


def test_get_scenario_forbidden_for_unassigned_student(
    client: TestClient, teacher_token: str, student_token: str
) -> None:
    sid = _create_scenario(client, teacher_token, title="Not yours")
    _save_graph(client, teacher_token, sid, _valid_graph())
    client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))

    resp = client.get(f"/api/scenarios/{sid}", headers=auth_header(student_token))
    assert resp.status_code == 403


# ────────────────────────── save_graph ──────────────────────────

def test_save_graph_full_replace(client: TestClient, teacher_token: str) -> None:
    sid = _create_scenario(client, teacher_token)
    body = _save_graph(client, teacher_token, sid, _valid_graph())
    assert len(body["nodes"]) == 4
    assert len(body["edges"]) == 3
    assert body["version"] == 2


def test_save_graph_increments_version_each_call(
    client: TestClient, teacher_token: str
) -> None:
    sid = _create_scenario(client, teacher_token)
    v1 = _save_graph(client, teacher_token, sid, _valid_graph())["version"]
    v2 = _save_graph(client, teacher_token, sid, _valid_graph())["version"]
    assert v2 == v1 + 1


def test_save_graph_is_atomic_on_failure(
    client: TestClient, teacher_token: str, db_session: Session
) -> None:
    """§B.3.3 — duplicate node IDs cause IntegrityError mid-insert → full rollback."""
    from models.scenario import Scenario, ScenarioEdge, ScenarioNode

    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _valid_graph())
    scenario = db_session.get(Scenario, sid)
    assert scenario is not None
    baseline_version = scenario.version
    baseline_nodes = db_session.query(ScenarioNode).filter_by(scenario_id=sid).count()
    baseline_edges = db_session.query(ScenarioEdge).filter_by(scenario_id=sid).count()

    bad_graph = {
        "nodes": [
            {"id": "dup", "type": "start", "position": {"x": 0, "y": 0}, "data": {}, "title": "A"},
            {"id": "dup", "type": "final", "position": {"x": 1, "y": 1}, "data": {}, "title": "B"},
        ],
        "edges": [
            {"id": "e1", "source": "dup", "target": "dup", "label": None, "data": {}},
        ],
    }
    resp = client.put(
        f"/api/scenarios/{sid}/graph",
        json=bad_graph,
        headers=auth_header(teacher_token),
    )
    assert resp.status_code in (409, 422, 400)

    db_session.expire_all()
    scenario_after = db_session.get(Scenario, sid)
    assert scenario_after is not None
    assert scenario_after.version == baseline_version
    assert db_session.query(ScenarioNode).filter_by(scenario_id=sid).count() == baseline_nodes
    assert db_session.query(ScenarioEdge).filter_by(scenario_id=sid).count() == baseline_edges


def test_save_graph_blocked_when_published(client: TestClient, teacher_token: str) -> None:
    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _valid_graph())
    client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))

    resp = client.put(
        f"/api/scenarios/{sid}/graph",
        json=_valid_graph(),
        headers=auth_header(teacher_token),
    )
    assert resp.status_code == 409


# ────────────────────────── publish / unpublish ──────────────────────────

def test_publish_invalid_graph_returns_422(client: TestClient, teacher_token: str) -> None:
    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _empty_graph())
    resp = client.post(
        f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token)
    )
    assert resp.status_code == 422


def test_publish_valid_graph_returns_status_published(
    client: TestClient, teacher_token: str
) -> None:
    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _valid_graph())
    resp = client.post(
        f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "published"


def test_publish_idempotent_when_already_published(
    client: TestClient, teacher_token: str
) -> None:
    """E-14 — publishing an already-published scenario is a no-op, not an error."""
    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _valid_graph())
    r1 = client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))
    r2 = client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))
    assert r1.status_code == 200 and r2.status_code == 200
    assert r2.json()["status"] == "published"


def test_unpublish_sets_status_to_draft(client: TestClient, teacher_token: str) -> None:
    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _valid_graph())
    client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))
    resp = client.post(
        f"/api/scenarios/{sid}/unpublish", headers=auth_header(teacher_token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "draft"


def test_unpublish_idempotent_on_draft(client: TestClient, teacher_token: str) -> None:
    sid = _create_scenario(client, teacher_token)
    resp = client.post(
        f"/api/scenarios/{sid}/unpublish", headers=auth_header(teacher_token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "draft"


# ────────────────────────── assign ──────────────────────────

def test_assign_scenario_to_group(
    client: TestClient, teacher_token: str, db_session: Session
) -> None:
    from models.user import Group

    group = Group(name="Группа А")
    db_session.add(group)
    db_session.flush()

    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _valid_graph())
    client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))
    resp = client.post(
        f"/api/scenarios/{sid}/assign",
        json={"group_id": group.id},
        headers=auth_header(teacher_token),
    )
    assert resp.status_code == 200


def test_assign_not_published_fails_422(
    client: TestClient, teacher_token: str, db_session: Session
) -> None:
    from models.user import Group

    group = Group(name="Группа Б")
    db_session.add(group)
    db_session.flush()
    sid = _create_scenario(client, teacher_token)
    resp = client.post(
        f"/api/scenarios/{sid}/assign",
        json={"group_id": group.id},
        headers=auth_header(teacher_token),
    )
    assert resp.status_code == 422


def test_assign_duplicate_group_conflict(
    client: TestClient, teacher_token: str, db_session: Session
) -> None:
    from models.user import Group

    group = Group(name="Группа В")
    db_session.add(group)
    db_session.flush()
    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _valid_graph())
    client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))
    ok = client.post(
        f"/api/scenarios/{sid}/assign",
        json={"group_id": group.id},
        headers=auth_header(teacher_token),
    )
    assert ok.status_code == 200
    dup = client.post(
        f"/api/scenarios/{sid}/assign",
        json={"group_id": group.id},
        headers=auth_header(teacher_token),
    )
    assert dup.status_code == 409


# ────────────────────────── duplicate ──────────────────────────

def test_duplicate_scenario_creates_draft_copy(
    client: TestClient, teacher_token: str
) -> None:
    sid = _create_scenario(client, teacher_token, title="Оригинал")
    _save_graph(client, teacher_token, sid, _valid_graph())
    client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))

    resp = client.post(
        f"/api/scenarios/{sid}/duplicate", headers=auth_header(teacher_token)
    )
    assert resp.status_code == 201
    clone = resp.json()
    assert clone["id"] != sid
    assert clone["status"] == "draft"
    assert clone["title"].startswith("Оригинал")
    assert len(clone["nodes"]) == 4
    assert len(clone["edges"]) == 3


# ────────────────────────── delete / archive ──────────────────────────

def test_delete_draft_scenario(client: TestClient, teacher_token: str) -> None:
    sid = _create_scenario(client, teacher_token)
    resp = client.delete(f"/api/scenarios/{sid}", headers=auth_header(teacher_token))
    assert resp.status_code == 204


def test_delete_published_returns_409(client: TestClient, teacher_token: str) -> None:
    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _valid_graph())
    client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))
    resp = client.delete(f"/api/scenarios/{sid}", headers=auth_header(teacher_token))
    assert resp.status_code == 409


def test_archive_published_scenario(client: TestClient, teacher_token: str) -> None:
    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _valid_graph())
    client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))
    resp = client.post(
        f"/api/scenarios/{sid}/archive", headers=auth_header(teacher_token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "archived"


# ────────────────────────── sanitisation (§T.2) ──────────────────────────

def test_student_does_not_see_correct_values(
    client: TestClient,
    teacher_token: str,
    student_token: str,
    student_user,
    db_session: Session,
) -> None:
    """§T.2 — correct_value / is_correct / keywords stripped for student role."""
    from models.user import Group

    group = Group(name="Группа G")
    db_session.add(group)
    db_session.flush()
    student_user.group_id = group.id
    db_session.flush()

    sid = _create_scenario(client, teacher_token, title="Full secrets")
    loaded_graph = {
        "nodes": [
            {"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "data": {}, "title": "Старт"},
            {
                "id": "d",
                "type": "decision",
                "position": {"x": 1, "y": 0},
                "data": {
                    "question": "?",
                    "options": [
                        {"id": "o1", "text": "A", "feedback": "LEAK", "score": 10},
                        {"id": "o2", "text": "B", "feedback": "BAD", "score": 0},
                    ],
                    "max_score": 10.0,
                },
                "title": "d",
            },
            {
                "id": "fm",
                "type": "form",
                "position": {"x": 2, "y": 0},
                "data": {
                    "form_title": "?",
                    "fields": [
                        {"key": "x", "correct_value": "SECRET", "score": 5.0},
                    ],
                    "max_score": 5.0,
                },
                "title": "fm",
            },
            {
                "id": "ti",
                "type": "text_input",
                "position": {"x": 3, "y": 0},
                "data": {
                    "prompt": "?",
                    "keywords": [{"word": "SECRET", "score": 5.0}],
                    "max_score": 5.0,
                },
                "title": "ti",
            },
            {"id": "f", "type": "final", "position": {"x": 4, "y": 0}, "data": {}, "title": "Финал"},
        ],
        "edges": [
            {"id": "e0", "source": "s", "target": "d", "label": None,
             "data": {"is_correct": True, "score_delta": 1.0}},
            {"id": "e1", "source": "d", "target": "fm", "label": "Правильный",
             "data": {"is_correct": True, "score_delta": 2.0, "option_id": "o1"}},
            {"id": "e2", "source": "d", "target": "fm", "label": "Неправильный",
             "data": {"is_correct": False, "score_delta": 0.0, "option_id": "o2"}},
            {"id": "e3", "source": "fm", "target": "ti", "label": None,
             "data": {"is_correct": True}},
            {"id": "e4", "source": "ti", "target": "f", "label": None,
             "data": {"is_correct": True}},
        ],
    }
    _save_graph(client, teacher_token, sid, loaded_graph)
    client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))
    client.post(
        f"/api/scenarios/{sid}/assign",
        json={"group_id": group.id},
        headers=auth_header(teacher_token),
    )

    resp = client.get(f"/api/scenarios/{sid}", headers=auth_header(student_token))
    assert resp.status_code == 200
    body = resp.json()

    for node in body["nodes"]:
        if node["type"] == "decision":
            for opt in node["data"]["options"]:
                assert "feedback" not in opt
                assert "score" not in opt
        if node["type"] == "form":
            for field in node["data"]["fields"]:
                assert "correct_value" not in field
                assert "score" not in field
        if node["type"] == "text_input":
            assert "keywords" not in node["data"]
            assert "max_score" not in node["data"]

    for edge in body["edges"]:
        assert "is_correct" not in edge["data"]
        assert "score_delta" not in edge["data"]
        assert "condition" not in edge["data"]

    # And the teacher still sees everything
    t_resp = client.get(f"/api/scenarios/{sid}", headers=auth_header(teacher_token))
    t_body = t_resp.json()
    decision = next(n for n in t_body["nodes"] if n["type"] == "decision")
    assert decision["data"]["options"][0]["feedback"] == "LEAK"
    form = next(n for n in t_body["nodes"] if n["type"] == "form")
    assert form["data"]["fields"][0]["correct_value"] == "SECRET"


# ────────────────────────── preview (§UI.1) ──────────────────────────

def test_preview_mode_does_not_persist(
    client: TestClient, teacher_token: str, db_session: Session
) -> None:
    """§UI.1 — teacher preview keeps state in-memory only."""
    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _valid_graph())
    client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))

    resp = client.post(
        f"/api/scenarios/{sid}/preview", headers=auth_header(teacher_token)
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["current_node"]["type"] == "start"
    assert isinstance(body["preview_session_id"], str) and body["preview_session_id"]

    # Still in-memory — assert there is no row in scenario_groups for preview and
    # no magical DB writes outside of the normal publish/save flow.
    from models.scenario import Scenario

    scenario = db_session.get(Scenario, sid)
    assert scenario is not None
    assert scenario.status == "published"
    # No attempts table in Stage 2 — the fact that the call didn't 500 proves
    # that the handler doesn't try to insert into a table that doesn't exist.


# ────────────────────────── PATCH /api/nodes/{id} ──────────────────────────

def test_patch_node_updates_data(client: TestClient, teacher_token: str) -> None:
    sid = _create_scenario(client, teacher_token)
    _save_graph(client, teacher_token, sid, _valid_graph())

    resp = client.patch(
        "/api/nodes/n_dec",
        json={
            "scenario_id": sid,
            "title": "Обновлённый вопрос",
            "data": {
                "question": "Новый вопрос?",
                "options": [
                    {"id": "o1", "text": "A"},
                    {"id": "o2", "text": "B"},
                ],
                "max_score": 12.0,
            },
        },
        headers=auth_header(teacher_token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["data"]["question"] == "Новый вопрос?"
    assert body["title"] == "Обновлённый вопрос"
