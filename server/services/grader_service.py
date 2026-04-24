"""Grader — pure functions over ``node_data`` + ``answer_data``.

Every entry point returns a ``StepResult``. The service has no DB access; all
state lives in the inputs, which makes it cheap to unit-test in isolation
(``test_grader.py``).

Implementations follow:
- §11 (interface)
- ADDENDUM §B.3 (decision partial credit + zero-correct guard, E-02)
- ADDENDUM §T.2 (no leak — caller is responsible for sanitisation upstream
  of the *student-facing* response, but the grader still needs the full
  ``node_data`` to compute the score correctly).
"""

from __future__ import annotations

import re
from typing import Any

from schemas.attempt import StepResult
from schemas.scenario import EdgeOut

# ──────────────── helpers ────────────────


def _norm_text(value: Any) -> str:
    return str(value).strip().lower() if value is not None else ""


def _equal_field(student: Any, correct: Any, field_type: str) -> bool:
    if field_type in ("text", "textarea", "select", "date"):
        return _norm_text(student) == _norm_text(correct)
    if field_type == "checkbox":
        return bool(student) == bool(correct)
    if field_type == "number":
        try:
            return float(student) == float(correct)
        except (TypeError, ValueError):
            return False
    return student == correct


# ──────────────── service ────────────────


class GraderService:
    """Stateless grader — instantiate or call as ``GraderService().grade_xxx(...)``."""

    # ─── decision (§B.3) ──────────────────────────────────────

    def grade_decision(
        self,
        *,
        node_data: dict,
        answer_data: dict,
        edges: list[EdgeOut],
    ) -> StepResult:
        max_score = float(node_data.get("max_score", 0.0))
        allow_multiple = bool(node_data.get("allow_multiple", False))

        if not allow_multiple:
            return self._grade_decision_single(
                node_data=node_data,
                answer_data=answer_data,
                edges=edges,
                max_score=max_score,
            )

        correct_ids: set[str] = {
            str(e.data.get("option_id"))
            for e in edges
            if e.data.get("is_correct") and e.data.get("option_id") is not None
        }
        if not correct_ids:
            # E-02 — must be caught at validate_graph(), but never crash here.
            return StepResult(
                score=0.0,
                max_score=max_score,
                is_correct=False,
                feedback="Узел настроен некорректно: нет правильных вариантов",
                details={"config_error": "no_correct_edges"},
            )

        selected_ids: set[str] = {
            str(opt) for opt in (answer_data.get("selected_option_ids") or [])
        }

        if not bool(node_data.get("partial_credit", False)):
            is_correct = selected_ids == correct_ids
            return StepResult(
                score=max_score if is_correct else 0.0,
                max_score=max_score,
                is_correct=is_correct,
                feedback="Верно" if is_correct else "Не все правильные варианты выбраны",
                details={
                    "selected": sorted(selected_ids),
                    "correct": sorted(correct_ids),
                },
            )

        true_positives = len(selected_ids & correct_ids)
        false_positives = len(selected_ids - correct_ids)
        # correct_ids guaranteed non-empty above.
        ratio = max(0.0, (true_positives - false_positives) / len(correct_ids))
        score = round(max_score * ratio, 2)
        is_correct = (
            true_positives == len(correct_ids) and false_positives == 0
        )
        return StepResult(
            score=score,
            max_score=max_score,
            is_correct=is_correct,
            feedback="Верно" if is_correct else "Частичный ответ",
            details={
                "true_positives": true_positives,
                "false_positives": false_positives,
                "selected": sorted(selected_ids),
                "correct": sorted(correct_ids),
            },
        )

    @staticmethod
    def _grade_decision_single(
        *,
        node_data: dict,
        answer_data: dict,
        edges: list[EdgeOut],
        max_score: float,
    ) -> StepResult:
        selected_id = answer_data.get("selected_option_id")
        chosen_edge = next(
            (e for e in edges if e.data.get("option_id") == selected_id), None
        )
        if chosen_edge is None:
            return StepResult(
                score=0.0,
                max_score=max_score,
                is_correct=False,
                feedback="Вариант ответа не найден",
                details={"selected_option_id": selected_id},
            )
        is_correct = bool(chosen_edge.data.get("is_correct"))

        options = node_data.get("options") or []
        option = next(
            (o for o in options if isinstance(o, dict) and o.get("id") == selected_id),
            None,
        )
        feedback = (option or {}).get("feedback", "")

        return StepResult(
            score=max_score if is_correct else 0.0,
            max_score=max_score,
            is_correct=is_correct,
            feedback=feedback,
            details={"selected_option_id": selected_id},
        )

    # ─── form ────────────────────────────────────────────────

    def grade_form(self, *, node_data: dict, answer_data: dict) -> StepResult:
        fields = node_data.get("fields") or []
        student_fields: dict[str, Any] = answer_data.get("fields") or {}

        max_score = 0.0
        score = 0.0
        details_per_field: dict[str, dict] = {}
        all_correct = True

        for field in fields:
            if not isinstance(field, dict):
                continue
            key = field.get("key")
            field_score = float(field.get("score", 0.0))
            correct_value = field.get("correct_value")
            field_type = field.get("type", "text")
            regex = field.get("validation_regex")

            student_value = student_fields.get(key)

            field_max = field_score if (correct_value is not None or regex) else 0.0
            max_score += field_max
            entry = {"max": field_max, "received": 0.0}

            if regex and (
                student_value is None or not re.match(regex, str(student_value))
            ):
                details_per_field[key] = {**entry, "ok": False, "reason": "regex"}
                all_correct = False
                continue

            if correct_value is not None:
                if student_value is None:
                    details_per_field[key] = {**entry, "ok": False, "reason": "missing"}
                    all_correct = False
                    continue
                if _equal_field(student_value, correct_value, field_type):
                    score += field_score
                    entry["received"] = field_score
                    details_per_field[key] = {**entry, "ok": True}
                else:
                    all_correct = False
                    details_per_field[key] = {**entry, "ok": False, "reason": "mismatch"}
            elif regex:
                # No correct_value but regex matched ⇒ award the validation score.
                score += field_score
                entry["received"] = field_score
                details_per_field[key] = {**entry, "ok": True}

        declared_max = node_data.get("max_score")
        max_total = float(declared_max) if declared_max is not None else max_score

        return StepResult(
            score=round(score, 2),
            max_score=max_total,
            is_correct=all_correct and score == max_total and max_total > 0,
            feedback=_form_feedback(score, max_total),
            details={"fields": details_per_field},
        )

    # ─── text_input ─────────────────────────────────────────

    def grade_text_input(self, *, node_data: dict, answer_data: dict) -> StepResult:
        text = _norm_text(answer_data.get("text", ""))
        keywords = node_data.get("keywords") or []

        matched: list[str] = []
        missing: list[str] = []
        score = 0.0
        max_score = 0.0
        for kw in keywords:
            if not isinstance(kw, dict):
                continue
            word = str(kw.get("word", "")).strip().lower()
            kw_score = float(kw.get("score", 0.0))
            max_score += kw_score
            synonyms = [str(s).strip().lower() for s in kw.get("synonyms") or []]

            candidates = [w for w in [word, *synonyms] if w]
            hit = any(c in text for c in candidates)
            if hit:
                score += kw_score
                matched.append(word)
            else:
                missing.append(word)

        declared_max = node_data.get("max_score")
        max_total = float(declared_max) if declared_max is not None else max_score
        is_correct = bool(keywords) and not missing
        return StepResult(
            score=round(score, 2),
            max_score=max_total,
            is_correct=is_correct,
            feedback=_text_feedback(matched, missing),
            details={"matched_keywords": matched, "missing_keywords": missing},
        )

    # ─── view-only nodes (data / start / final) ─────────────

    @staticmethod
    def grade_view_data(*, node_data: dict, answer_data: dict) -> StepResult:
        return StepResult(
            score=0.0,
            max_score=0.0,
            is_correct=None,
            feedback="",
            details={},
        )


# ──────────────── feedback helpers ────────────────


def _form_feedback(score: float, max_score: float) -> str:
    if max_score == 0:
        return "Форма не оценивается"
    if score == max_score:
        return "Все поля заполнены верно"
    if score == 0:
        return "Все поля заполнены неверно"
    return f"Частично верно: {score:g} из {max_score:g}"


def _text_feedback(matched: list[str], missing: list[str]) -> str:
    if not matched and not missing:
        return ""
    if not missing:
        return "Все ключевые понятия упомянуты"
    if not matched:
        return "Не найдено ни одного ключевого понятия"
    return (
        f"Найдено: {', '.join(matched)}; "
        f"не упомянуто: {', '.join(missing)}"
    )
