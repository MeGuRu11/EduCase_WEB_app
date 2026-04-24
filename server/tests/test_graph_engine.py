"""Unit tests for ``services.graph_engine`` — PROJECT_DESIGN §10.

The engine operates on ``ScenarioFullOut`` graph data (nodes + edges) rather
than raw ORM objects so the same validation path can be reused by the
in-memory preview flow (§UI.1).
"""

from __future__ import annotations

import pytest

from schemas.scenario import EdgeOut, GraphIn, NodeOut
from services.graph_engine import GraphEngine, GraphValidationError

# ───────────── helpers ─────────────

def _node(
    node_id: str,
    node_type: str,
    *,
    data: dict | None = None,
    title: str = "",
) -> NodeOut:
    return NodeOut(
        id=node_id,
        type=node_type,  # type: ignore[arg-type]
        position={"x": 0.0, "y": 0.0},
        data=data or {},
        title=title or node_id,
    )


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


def _minimal_valid_graph() -> GraphIn:
    """start → data → final (a one-path graph)."""
    return GraphIn(
        nodes=[
            _node("n_start", "start"),
            _node("n_data", "data"),
            _node("n_final", "final"),
        ],
        edges=[
            _edge("e1", "n_start", "n_data"),
            _edge("e2", "n_data", "n_final"),
        ],
    )


# ───────────── navigation ─────────────

def test_get_start_node_exactly_one() -> None:
    engine = GraphEngine(_minimal_valid_graph())
    start = engine.get_start_node()
    assert start.id == "n_start"
    assert start.type == "start"


def test_get_start_node_none_raises() -> None:
    graph = GraphIn(
        nodes=[_node("n1", "data"), _node("n2", "final")],
        edges=[_edge("e1", "n1", "n2")],
    )
    engine = GraphEngine(graph)
    with pytest.raises(GraphValidationError):
        engine.get_start_node()


def test_get_start_node_multiple_raises() -> None:
    graph = GraphIn(
        nodes=[_node("s1", "start"), _node("s2", "start"), _node("f", "final")],
        edges=[_edge("e1", "s1", "f"), _edge("e2", "s2", "f")],
    )
    engine = GraphEngine(graph)
    with pytest.raises(GraphValidationError):
        engine.get_start_node()


def test_get_next_node_by_edge() -> None:
    engine = GraphEngine(_minimal_valid_graph())
    nxt = engine.get_next_node("n_start", "e1")
    assert nxt is not None
    assert nxt.id == "n_data"


def test_get_next_node_final_returns_none() -> None:
    engine = GraphEngine(_minimal_valid_graph())
    assert engine.get_next_node("n_final", None) is None


def test_get_next_node_unknown_edge_raises() -> None:
    engine = GraphEngine(_minimal_valid_graph())
    with pytest.raises(GraphValidationError):
        engine.get_next_node("n_start", "e_does_not_exist")


def test_validate_transition_edge_exists() -> None:
    engine = GraphEngine(_minimal_valid_graph())
    assert engine.validate_transition("n_start", "n_data") is True
    assert engine.validate_transition("n_data", "n_start") is False


# ───────────── validate_graph ─────────────

def test_validate_graph_requires_start() -> None:
    graph = GraphIn(
        nodes=[_node("n1", "data"), _node("n2", "final")],
        edges=[_edge("e1", "n1", "n2")],
    )
    errors = GraphEngine(graph).validate_graph()
    assert any("стартового узла" in e.lower() or "start" in e.lower() for e in errors)


def test_validate_graph_requires_final() -> None:
    graph = GraphIn(
        nodes=[_node("s", "start"), _node("d", "data")],
        edges=[_edge("e1", "s", "d")],
    )
    errors = GraphEngine(graph).validate_graph()
    assert any("final" in e.lower() or "финал" in e.lower() for e in errors)


def test_validate_graph_valid_minimal_has_no_errors() -> None:
    assert GraphEngine(_minimal_valid_graph()).validate_graph() == []


def test_validate_graph_unreachable_node() -> None:
    graph = GraphIn(
        nodes=[
            _node("s", "start"),
            _node("d", "data"),
            _node("orphan", "data"),
            _node("f", "final"),
        ],
        edges=[_edge("e1", "s", "d"), _edge("e2", "d", "f")],
    )
    errors = GraphEngine(graph).validate_graph()
    assert any("orphan" in e for e in errors)


def test_validate_graph_dead_end_non_final() -> None:
    graph = GraphIn(
        nodes=[
            _node("s", "start"),
            _node("d", "data"),  # no outgoing edge — dead end, not final
            _node("f", "final"),
        ],
        edges=[_edge("e1", "s", "d")],
    )
    errors = GraphEngine(graph).validate_graph()
    assert any("исходящ" in e.lower() or "dead" in e.lower() for e in errors)


def test_validate_graph_decision_requires_two_outgoing() -> None:
    graph = GraphIn(
        nodes=[
            _node("s", "start"),
            _node("d", "decision", data={"question": "?", "options": [], "max_score": 10}),
            _node("f", "final"),
        ],
        edges=[_edge("e1", "s", "d"), _edge("e2", "d", "f")],
    )
    errors = GraphEngine(graph).validate_graph()
    assert any("decision" in e.lower() and ("2" in e or "два" in e.lower()) for e in errors)


def test_validate_graph_decision_requires_at_least_one_correct_edge() -> None:
    """ADDENDUM §B.3 — decision must have at least one correct outgoing edge."""
    graph = GraphIn(
        nodes=[
            _node("s", "start"),
            _node(
                "d",
                "decision",
                data={
                    "question": "?",
                    "options": [{"id": "o1", "text": "A"}, {"id": "o2", "text": "B"}],
                    "max_score": 10,
                },
            ),
            _node("f1", "final"),
            _node("f2", "final"),
        ],
        edges=[
            _edge("e0", "s", "d"),
            _edge("e1", "d", "f1", is_correct=False, option_id="o1"),
            _edge("e2", "d", "f2", is_correct=False, option_id="o2"),
        ],
    )
    errors = GraphEngine(graph).validate_graph()
    assert any("правильн" in e.lower() or "is_correct" in e.lower() for e in errors)


def test_cycle_detection_in_mvp() -> None:
    """MVP forbids cycles — a loop like s→a→b→a must be rejected."""
    graph = GraphIn(
        nodes=[
            _node("s", "start"),
            _node("a", "data"),
            _node("b", "data"),
            _node("f", "final"),
        ],
        edges=[
            _edge("e1", "s", "a"),
            _edge("e2", "a", "b"),
            _edge("e3", "b", "a"),  # back-edge → cycle
            _edge("e4", "a", "f"),
        ],
    )
    errors = GraphEngine(graph).validate_graph()
    assert any("цикл" in e.lower() or "cycle" in e.lower() for e in errors)


def test_validate_graph_rejects_edge_to_unknown_node() -> None:
    graph = GraphIn(
        nodes=[_node("s", "start"), _node("f", "final")],
        edges=[
            _edge("e1", "s", "f"),
            _edge("e2", "s", "ghost_node"),  # target does not exist
        ],
    )
    errors = GraphEngine(graph).validate_graph()
    assert any("ghost_node" in e for e in errors)


# ───────────── calculate_max_score ─────────────

def test_calculate_max_score_sums_correct_path() -> None:
    graph = GraphIn(
        nodes=[
            _node("s", "start"),
            _node(
                "d",
                "decision",
                data={
                    "question": "?",
                    "options": [{"id": "o1", "text": "A"}, {"id": "o2", "text": "B"}],
                    "max_score": 8.0,
                },
            ),
            _node(
                "t",
                "text_input",
                data={"prompt": "?", "keywords": [], "max_score": 5.0},
            ),
            _node(
                "fm",
                "form",
                data={
                    "form_title": "?",
                    "fields": [
                        {"key": "a", "correct_value": "x", "score": 2.0},
                        {"key": "b", "correct_value": "y", "score": 3.0},
                    ],
                    "max_score": 5.0,
                },
            ),
            _node("f", "final"),
            _node("wrong_final", "final"),
        ],
        edges=[
            _edge("e0", "s", "d"),
            _edge("e_correct", "d", "t", is_correct=True, option_id="o1"),
            _edge("e_wrong", "d", "wrong_final", is_correct=False, option_id="o2"),
            _edge("e_t_fm", "t", "fm", score_delta=1.0),
            _edge("e_fm_f", "fm", "f"),
        ],
    )
    # Correct path: s → d (8) → t (5) → fm (5, sum of correct_value scores) → f
    # + 1.0 from score_delta on e_t_fm
    total = GraphEngine(graph).calculate_max_score()
    assert total == pytest.approx(19.0)


def test_calculate_max_score_zero_when_no_scoring_nodes() -> None:
    """Minimal start→data→final graph has nothing to score."""
    assert GraphEngine(_minimal_valid_graph()).calculate_max_score() == pytest.approx(0.0)
