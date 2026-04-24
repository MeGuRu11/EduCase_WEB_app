"""Graph engine — scenario navigation + publish-time validation.

See PROJECT_DESIGN §10 and ADDENDUM §B.3 (decision partial credit) /
§T.2 (student sanitisation happens in ``scenario_service``, not here).

The engine operates on a ``GraphIn`` (or the ``nodes`` / ``edges`` fields of
a ``ScenarioFullOut``) so the same logic works for both persisted scenarios
and in-memory preview sessions (§UI.1).
"""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Iterable
from dataclasses import dataclass

from schemas.scenario import EdgeOut, GraphIn, NodeOut, ScenarioFullOut


class GraphValidationError(Exception):
    """Raised by navigation helpers when the graph is malformed at runtime.

    Publish-time validation returns a list of errors instead of raising — see
    ``GraphEngine.validate_graph``.
    """


@dataclass
class _CycleResult:
    has_cycle: bool
    involved_nodes: list[str]


class GraphEngine:
    """Stateless operations over a ``GraphIn``.

    One instance per graph is cheap — construction builds O(V+E) adjacency
    maps that all subsequent methods reuse.
    """

    def __init__(self, graph: GraphIn | ScenarioFullOut) -> None:
        nodes: Iterable[NodeOut] = graph.nodes
        edges: Iterable[EdgeOut] = graph.edges

        self._nodes: dict[str, NodeOut] = {n.id: n for n in nodes}
        self._edges: dict[str, EdgeOut] = {e.id: e for e in edges}
        self._outgoing: dict[str, list[EdgeOut]] = defaultdict(list)
        self._incoming: dict[str, list[EdgeOut]] = defaultdict(list)
        for edge in self._edges.values():
            self._outgoing[edge.source].append(edge)
            self._incoming[edge.target].append(edge)

    # ─────────────────── navigation ───────────────────

    def get_start_node(self) -> NodeOut:
        starts = [n for n in self._nodes.values() if n.type == "start"]
        if not starts:
            raise GraphValidationError("Нет стартового узла (start)")
        if len(starts) > 1:
            raise GraphValidationError(
                f"Стартовых узлов должно быть ровно один, найдено {len(starts)}"
            )
        return starts[0]

    def get_next_node(
        self, current_node_id: str, selected_edge_id: str | None
    ) -> NodeOut | None:
        """Return the node reached by ``selected_edge_id`` from ``current_node_id``.

        For ``final`` nodes — where navigation has ended — pass ``selected_edge_id=None``
        and receive ``None`` back. For all other nodes ``selected_edge_id`` must be the
        id of an outgoing edge; if the edge is missing, ``GraphValidationError`` is raised.
        """
        current = self._nodes.get(current_node_id)
        if current is None:
            raise GraphValidationError(f"Узел '{current_node_id}' не найден")
        if current.type == "final":
            return None
        if selected_edge_id is None:
            raise GraphValidationError(
                f"Требуется selected_edge_id для узла '{current_node_id}' "
                f"(type={current.type})"
            )
        edge = self._edges.get(selected_edge_id)
        if edge is None or edge.source != current_node_id:
            raise GraphValidationError(
                f"Недопустимый переход: edge '{selected_edge_id}' "
                f"не исходит из '{current_node_id}'"
            )
        target = self._nodes.get(edge.target)
        if target is None:
            raise GraphValidationError(
                f"Ребро '{selected_edge_id}' указывает на несуществующий узел '{edge.target}'"
            )
        return target

    def validate_transition(self, from_node_id: str, to_node_id: str) -> bool:
        """Does any edge connect ``from_node_id`` → ``to_node_id``?"""
        return any(e.target == to_node_id for e in self._outgoing.get(from_node_id, []))

    def outgoing(self, node_id: str) -> list[EdgeOut]:
        return list(self._outgoing.get(node_id, []))

    # ─────────────────── publish validation ───────────────────

    def validate_graph(self) -> list[str]:
        """Collect all publish-time errors. Empty list → graph is valid."""
        errors: list[str] = []

        # 1. exactly one start
        starts = [n for n in self._nodes.values() if n.type == "start"]
        if not starts:
            errors.append("Граф невалиден: нет стартового узла (start)")
        elif len(starts) > 1:
            errors.append(
                f"Граф невалиден: стартовых узлов должно быть ровно один, найдено {len(starts)}"
            )

        # 2. at least one final
        finals = [n for n in self._nodes.values() if n.type == "final"]
        if not finals:
            errors.append("Граф невалиден: нет финального узла (final)")

        # 3. edges reference existing nodes
        for edge in self._edges.values():
            if edge.source not in self._nodes:
                errors.append(
                    f"Ребро '{edge.id}' ссылается на несуществующий source-узел '{edge.source}'"
                )
            if edge.target not in self._nodes:
                errors.append(
                    f"Ребро '{edge.id}' ссылается на несуществующий target-узел '{edge.target}'"
                )

        # 4. reachability from start (BFS)
        if starts:
            reachable = self._reachable_from(starts[0].id)
            for node in self._nodes.values():
                if node.id not in reachable:
                    errors.append(f"Узел '{node.id}' недостижим из стартового узла")

        # 5. no dead ends except final
        for node in self._nodes.values():
            if node.type == "final":
                continue
            if not self._outgoing.get(node.id):
                errors.append(
                    f"Узел '{node.id}' (type={node.type}) не имеет исходящих рёбер"
                )

        # 6. decision-specific constraints (§B.3)
        for node in self._nodes.values():
            if node.type != "decision":
                continue
            out = self._outgoing.get(node.id, [])
            if len(out) < 2:
                errors.append(
                    f"Decision-узел '{node.id}' должен иметь минимум 2 исходящих ребра"
                )
            if out and not any(e.data.get("is_correct") for e in out):
                errors.append(
                    f"Decision-узел '{node.id}' должен иметь хотя бы одно "
                    f"правильное ребро (is_correct=true)"
                )

        # 7. cycle detection (MVP forbids cycles)
        cycle = self._find_cycle()
        if cycle.has_cycle:
            errors.append(
                "Граф содержит цикл (cycle): "
                + " → ".join(cycle.involved_nodes)
            )

        return errors

    # ─────────────────── scoring ───────────────────

    def calculate_max_score(self) -> float:
        """Maximum score achievable along the best-scoring reachable path.

        Strategy: dynamic programming over the DAG (only meaningful once
        ``validate_graph`` has confirmed there are no cycles). For each node we
        store the best cumulative score of a path leading to it; the answer is
        the maximum over all ``final`` nodes.
        """
        try:
            start = self.get_start_node()
        except GraphValidationError:
            return 0.0

        topo = self._topological_order(start.id)
        if topo is None:
            # graph has a cycle — fall back to BFS-best-effort (no cycles should
            # reach here in practice because publish is gated on validate_graph).
            return 0.0

        best: dict[str, float] = {n_id: float("-inf") for n_id in self._nodes}
        best[start.id] = self._node_score(self._nodes[start.id])

        for node_id in topo:
            base = best[node_id]
            if base == float("-inf"):
                continue
            for edge in self._outgoing.get(node_id, []):
                if edge.target not in self._nodes:
                    continue
                edge_gain = edge.data.get("score_delta", 0.0) if edge.data.get("is_correct", True) else 0.0
                node_gain = self._node_score(self._nodes[edge.target])
                candidate = base + float(edge_gain) + node_gain
                if candidate > best[edge.target]:
                    best[edge.target] = candidate

        finals = [n for n in self._nodes.values() if n.type == "final"]
        if not finals:
            return 0.0
        best_final = max((best[f.id] for f in finals if best[f.id] != float("-inf")), default=0.0)
        return max(best_final, 0.0)

    @staticmethod
    def _node_score(node: NodeOut) -> float:
        data = node.data or {}
        if node.type == "decision":
            return float(data.get("max_score", 0.0))
        if node.type == "text_input":
            return float(data.get("max_score", 0.0))
        if node.type == "form":
            fields = data.get("fields") or []
            if "max_score" in data:
                return float(data["max_score"])
            total = 0.0
            for field in fields:
                if isinstance(field, dict):
                    total += float(field.get("score", 0.0))
            return total
        return 0.0

    # ─────────────────── internals ───────────────────

    def _reachable_from(self, start_id: str) -> set[str]:
        visited: set[str] = set()
        queue: deque[str] = deque([start_id])
        while queue:
            current = queue.popleft()
            if current in visited:
                continue
            visited.add(current)
            for edge in self._outgoing.get(current, []):
                if edge.target in self._nodes and edge.target not in visited:
                    queue.append(edge.target)
        return visited

    def _topological_order(self, start_id: str) -> list[str] | None:
        """Kahn's algorithm restricted to nodes reachable from ``start_id``.

        Returns ``None`` when a cycle is detected in the reachable sub-graph.
        """
        reachable = self._reachable_from(start_id)
        in_degree: dict[str, int] = {n_id: 0 for n_id in reachable}
        for node_id in reachable:
            for edge in self._outgoing.get(node_id, []):
                if edge.target in reachable:
                    in_degree[edge.target] += 1

        queue: deque[str] = deque([n for n, d in in_degree.items() if d == 0])
        order: list[str] = []
        while queue:
            current = queue.popleft()
            order.append(current)
            for edge in self._outgoing.get(current, []):
                if edge.target not in reachable:
                    continue
                in_degree[edge.target] -= 1
                if in_degree[edge.target] == 0:
                    queue.append(edge.target)
        if len(order) != len(reachable):
            return None
        return order

    def _find_cycle(self) -> _CycleResult:
        WHITE, GRAY, BLACK = 0, 1, 2  # noqa: N806 — DFS tri-colour is the classic CLRS idiom.
        color: dict[str, int] = {n_id: WHITE for n_id in self._nodes}
        parent: dict[str, str | None] = {n_id: None for n_id in self._nodes}
        cycle_path: list[str] = []

        def dfs(start_id: str) -> bool:
            stack: list[tuple[str, int]] = [(start_id, 0)]
            parent[start_id] = None
            while stack:
                node_id, idx = stack[-1]
                if idx == 0:
                    color[node_id] = GRAY
                edges = self._outgoing.get(node_id, [])
                if idx < len(edges):
                    stack[-1] = (node_id, idx + 1)
                    target = edges[idx].target
                    if target not in self._nodes:
                        continue
                    if color[target] == WHITE:
                        parent[target] = node_id
                        stack.append((target, 0))
                    elif color[target] == GRAY:
                        # Reconstruct the cycle path: target → ... → node_id → target
                        path = [target, node_id]
                        cursor: str | None = parent[node_id]
                        while cursor is not None and cursor != target:
                            path.append(cursor)
                            cursor = parent[cursor]
                        if cursor == target:
                            path.append(target)
                        cycle_path.extend(reversed(path))
                        return True
                else:
                    color[node_id] = BLACK
                    stack.pop()
            return False

        for node_id in self._nodes:
            if color[node_id] == WHITE and dfs(node_id):
                return _CycleResult(has_cycle=True, involved_nodes=cycle_path)
        return _CycleResult(has_cycle=False, involved_nodes=[])
