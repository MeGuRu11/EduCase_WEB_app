"""Unit tests for ``services.grader_service`` — PROJECT_DESIGN §11 + ADDENDUM §B.3.

The grader is pure: it consumes ``node_data`` + ``answer_data`` (+ outgoing
edges for ``decision``) and returns a ``StepResult``. There is no DB access
inside the service, so these tests instantiate the service directly without
fixtures.
"""

from __future__ import annotations

from schemas.scenario import EdgeOut
from services.grader_service import GraderService


def _edge(
    edge_id: str,
    source: str,
    target: str,
    *,
    is_correct: bool = True,
    score_delta: float = 0.0,
    option_id: str | None = None,
) -> EdgeOut:
    data: dict = {"is_correct": is_correct, "score_delta": score_delta}
    if option_id is not None:
        data["option_id"] = option_id
    return EdgeOut(id=edge_id, source=source, target=target, data=data)


# ───────────────── decision: single (binary) ─────────────────

def test_grade_decision_binary_correct_returns_max_score() -> None:
    node_data = {"question": "?", "options": [], "max_score": 10.0}
    edges = [
        _edge("e_ok", "d", "f1", is_correct=True, option_id="o1"),
        _edge("e_bad", "d", "f2", is_correct=False, option_id="o2"),
    ]
    result = GraderService().grade_decision(
        node_data=node_data,
        answer_data={"selected_option_id": "o1"},
        edges=edges,
    )
    assert result.score == 10.0
    assert result.is_correct is True
    assert result.max_score == 10.0


def test_grade_decision_binary_wrong_returns_zero() -> None:
    node_data = {"question": "?", "options": [], "max_score": 10.0}
    edges = [
        _edge("e_ok", "d", "f1", is_correct=True, option_id="o1"),
        _edge("e_bad", "d", "f2", is_correct=False, option_id="o2"),
    ]
    result = GraderService().grade_decision(
        node_data=node_data,
        answer_data={"selected_option_id": "o2"},
        edges=edges,
    )
    assert result.score == 0.0
    assert result.is_correct is False


# ───────────────── decision: allow_multiple, all-or-nothing ─────────────────

def test_grade_decision_multiple_all_or_nothing_full_match() -> None:
    node_data = {
        "question": "?",
        "options": [],
        "max_score": 8.0,
        "allow_multiple": True,
        "partial_credit": False,
    }
    edges = [
        _edge("e1", "d", "f1", is_correct=True, option_id="o1"),
        _edge("e2", "d", "f2", is_correct=True, option_id="o2"),
        _edge("e3", "d", "f3", is_correct=False, option_id="o3"),
    ]
    result = GraderService().grade_decision(
        node_data=node_data,
        answer_data={"selected_option_ids": ["o1", "o2"]},
        edges=edges,
    )
    assert result.score == 8.0
    assert result.is_correct is True


def test_grade_decision_multiple_all_or_nothing_partial_match_returns_zero() -> None:
    node_data = {
        "question": "?",
        "options": [],
        "max_score": 8.0,
        "allow_multiple": True,
        "partial_credit": False,
    }
    edges = [
        _edge("e1", "d", "f1", is_correct=True, option_id="o1"),
        _edge("e2", "d", "f2", is_correct=True, option_id="o2"),
    ]
    result = GraderService().grade_decision(
        node_data=node_data,
        answer_data={"selected_option_ids": ["o1"]},  # missing o2
        edges=edges,
    )
    assert result.score == 0.0
    assert result.is_correct is False


# ───────────────── decision: partial_credit (§B.3) ─────────────────

def test_grade_decision_partial_credit_half_correct() -> None:
    node_data = {
        "question": "?",
        "options": [],
        "max_score": 10.0,
        "allow_multiple": True,
        "partial_credit": True,
    }
    edges = [
        _edge("e1", "d", "f1", is_correct=True, option_id="o1"),
        _edge("e2", "d", "f2", is_correct=True, option_id="o2"),
        _edge("e3", "d", "f3", is_correct=False, option_id="o3"),
    ]
    result = GraderService().grade_decision(
        node_data=node_data,
        answer_data={"selected_option_ids": ["o1"]},
        edges=edges,
    )
    # tp=1, fp=0, |correct|=2 → 10 * (1-0)/2 = 5.0
    assert result.score == 5.0
    assert result.is_correct is False


def test_grade_decision_partial_credit_with_false_positive_penalty() -> None:
    node_data = {
        "question": "?",
        "options": [],
        "max_score": 10.0,
        "allow_multiple": True,
        "partial_credit": True,
    }
    edges = [
        _edge("e1", "d", "f1", is_correct=True, option_id="o1"),
        _edge("e2", "d", "f2", is_correct=True, option_id="o2"),
        _edge("e3", "d", "f3", is_correct=False, option_id="o3"),
    ]
    result = GraderService().grade_decision(
        node_data=node_data,
        answer_data={"selected_option_ids": ["o1", "o3"]},
        edges=edges,
    )
    # tp=1, fp=1, |correct|=2 → 10 * max(0, (1-1)/2) = 0.0
    assert result.score == 0.0


def test_grade_decision_empty_correct_ids_returns_zero_with_config_error() -> None:
    """ADDENDUM §B.3 / E-02 — empty correct edges set must NOT divide by zero."""
    node_data = {
        "question": "?",
        "options": [],
        "max_score": 10.0,
        "allow_multiple": True,
        "partial_credit": True,
    }
    edges = [
        _edge("e1", "d", "f1", is_correct=False, option_id="o1"),
        _edge("e2", "d", "f2", is_correct=False, option_id="o2"),
    ]
    result = GraderService().grade_decision(
        node_data=node_data,
        answer_data={"selected_option_ids": ["o1"]},
        edges=edges,
    )
    assert result.score == 0.0
    assert result.is_correct is False
    assert "config_error" in result.details


# ───────────────── form ─────────────────

def _form_node() -> dict:
    return {
        "form_title": "Извещение",
        "fields": [
            {"key": "diag", "label": "Диагноз", "type": "text",
             "correct_value": "Гепатит А", "score": 3.0},
            {"key": "date", "label": "Дата", "type": "date",
             "correct_value": "2026-03-15", "score": 2.0},
            {"key": "hosp", "label": "Госп.", "type": "select",
             "options": ["Да", "Нет"], "correct_value": "Да", "score": 1.0},
            {"key": "lab", "label": "Лаб.", "type": "checkbox",
             "correct_value": True, "score": 2.0},
            {"key": "num", "label": "Кол-во", "type": "number",
             "correct_value": 42, "score": 1.0},
        ],
        "max_score": 9.0,
    }


def test_grade_form_all_correct_sums_max_score() -> None:
    result = GraderService().grade_form(
        node_data=_form_node(),
        answer_data={
            "fields": {
                "diag": "Гепатит А",
                "date": "2026-03-15",
                "hosp": "Да",
                "lab": True,
                "num": 42,
            }
        },
    )
    assert result.score == 9.0
    assert result.is_correct is True
    assert result.max_score == 9.0


def test_grade_form_text_field_case_insensitive_strip() -> None:
    result = GraderService().grade_form(
        node_data=_form_node(),
        answer_data={
            "fields": {
                "diag": "  гепатит а  ",  # сравнение должно быть .strip().lower()
                "date": "2026-03-15",
                "hosp": "Да",
                "lab": True,
                "num": 42,
            }
        },
    )
    assert result.score == 9.0


def test_grade_form_partial_match_returns_partial_score() -> None:
    result = GraderService().grade_form(
        node_data=_form_node(),
        answer_data={
            "fields": {
                "diag": "неверно",      # 0
                "date": "2026-03-15",   # 2
                "hosp": "Нет",          # 0
                "lab": True,            # 2
                "num": 0,               # 0
            }
        },
    )
    assert result.score == 4.0
    assert result.is_correct is False


def test_grade_form_validation_regex_failure_yields_zero_for_field() -> None:
    node = {
        "form_title": "Test",
        "fields": [
            {"key": "fio", "label": "ФИО", "type": "text",
             "correct_value": None, "score": 2.0,
             "validation_regex": r"^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.[А-ЯЁ]\.$"},
        ],
        "max_score": 2.0,
    }
    bad = GraderService().grade_form(
        node_data=node,
        answer_data={"fields": {"fio": "ivanov i.i."}},
    )
    good = GraderService().grade_form(
        node_data=node,
        answer_data={"fields": {"fio": "Иванов И.И."}},
    )
    assert bad.score == 0.0
    assert good.score == 2.0


def test_grade_form_missing_required_field_zero_for_that_field() -> None:
    """Поле с correct_value, которого нет в answer_data, → не зачитывается."""
    result = GraderService().grade_form(
        node_data=_form_node(),
        answer_data={
            "fields": {
                "diag": "Гепатит А",
                # date missing
                "hosp": "Да",
                "lab": True,
                "num": 42,
            }
        },
    )
    # Все поля кроме date зачлись → 9 - 2 = 7
    assert result.score == 7.0
    assert result.is_correct is False


# ───────────────── text_input ─────────────────

def _text_node() -> dict:
    return {
        "prompt": "Опишите диагноз",
        "keywords": [
            {"word": "гепатит", "synonyms": ["hepatitis", "ВГА"], "score": 3.0},
            {"word": "вспышка", "synonyms": ["групповая заболеваемость"], "score": 3.0},
            {"word": "водный", "synonyms": ["через воду"], "score": 2.0},
        ],
        "max_score": 8.0,
    }


def test_grade_text_input_case_insensitive_substring() -> None:
    result = GraderService().grade_text_input(
        node_data=_text_node(),
        answer_data={"text": "ВЫЯВЛЕН ОСТРЫЙ ГЕПАТИТ — водный путь передачи"},
    )
    # matched: гепатит (3), водный (2) → 5
    assert result.score == 5.0
    assert "гепатит" in result.details["matched_keywords"]
    assert "вспышка" in result.details["missing_keywords"]


def test_grade_text_input_keyword_not_double_counted() -> None:
    result = GraderService().grade_text_input(
        node_data=_text_node(),
        answer_data={"text": "гепатит гепатит гепатит — гепатит обнаружен"},
    )
    assert result.score == 3.0  # not 12


def test_grade_text_input_synonym_counts_as_match() -> None:
    result = GraderService().grade_text_input(
        node_data=_text_node(),
        answer_data={"text": "Hepatitis A через воду — групповая заболеваемость"},
    )
    # все 3 ключевых слова через синонимы → 3+3+2 = 8
    assert result.score == 8.0
    assert result.is_correct is True


# ───────────────── view_data ─────────────────

def test_grade_view_data_is_neutral_no_score_no_verdict() -> None:
    """data / start / final узлы — is_correct=None, score=0."""
    result = GraderService().grade_view_data(
        node_data={"description": "Старт"}, answer_data={}
    )
    assert result.score == 0.0
    assert result.max_score == 0.0
    assert result.is_correct is None
