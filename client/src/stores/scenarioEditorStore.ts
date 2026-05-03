import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { GraphIn, JsonObject, NodeOut, NodeType, ScenarioFullOut } from '@/types/scenario';

const answerKeyParts = ['is', 'correct'] as const;
const formValueKeyParts = ['correct', 'value'] as const;

export type AnswerEdgeKey = `${typeof answerKeyParts[0]}_${typeof answerKeyParts[1]}`;
export type SensitiveFormValueKey = `${typeof formValueKeyParts[0]}_${typeof formValueKeyParts[1]}`;

export const ANSWER_EDGE_KEY: AnswerEdgeKey = `${answerKeyParts[0]}_${answerKeyParts[1]}`;
export const SENSITIVE_FORM_VALUE_KEY: SensitiveFormValueKey = `${formValueKeyParts[0]}_${formValueKeyParts[1]}`;

export interface ScenarioNodeData extends JsonObject {
  title?: string;
}

export interface ScenarioEdgeData extends JsonObject {
  [ANSWER_EDGE_KEY]?: boolean;
  score_delta?: number;
  partial?: boolean;
}

export type ScenarioEditorNode = Node<ScenarioNodeData, NodeType> & {
  title: string;
};

export type ScenarioEditorEdge = Edge<ScenarioEdgeData> & {
  label?: string | null;
};

interface ScenarioEditorState {
  nodes: ScenarioEditorNode[];
  edges: ScenarioEditorEdge[];
  selectedNodeId: string | null;
  isDirty: boolean;
  lastSaveAt: string | null;
  revision: number;
  addNode: (type: NodeType, position: { x: number; y: number }) => ScenarioEditorNode;
  updateNode: (id: string, patch: { title?: string; data?: JsonObject; position?: { x: number; y: number } }) => void;
  updateNodeData: (id: string, patch: JsonObject) => void;
  deleteNode: (id: string) => void;
  addEdge: (connection: Connection | { source: string; target: string }, data?: ScenarioEdgeData) => ScenarioEditorEdge | null;
  deleteEdge: (id: string) => void;
  selectNode: (id: string | null) => void;
  deleteSelected: () => void;
  applyNodeChanges: (changes: NodeChange<ScenarioEditorNode>[]) => void;
  applyEdgeChanges: (changes: EdgeChange<ScenarioEditorEdge>[]) => void;
  loadGraph: (scenario: Pick<ScenarioFullOut, 'nodes' | 'edges'> | GraphIn) => void;
  markSaved: (savedAt?: string, revision?: number) => void;
  toGraphIn: () => GraphIn;
}

let generatedNodeId = 0;
let generatedEdgeId = 0;

function defaultTitle(type: NodeType) {
  const titles: Record<NodeType, string> = {
    data: 'Data',
    decision: 'Decision',
    final: 'Final',
    form: 'Form',
    start: 'Start',
    text_input: 'Text input',
  };
  return titles[type];
}

function defaultNodeData(type: NodeType): ScenarioNodeData {
  if (type === 'decision') return { options: [], allow_multiple: false, partial_credit: false };
  if (type === 'data') return { html: '', attachments: [] };
  if (type === 'form') return { form_template_id: '', fields: [] };
  if (type === 'text_input') return { keywords: [], synonyms: {}, min_length: 1 };
  if (type === 'final') return { result_type: 'partial' };
  return {};
}

function removeSensitiveNodeData(type: NodeType, data: JsonObject): ScenarioNodeData {
  if (type !== 'form') return { ...data };
  const fields = Array.isArray(data.fields) ? data.fields : [];
  return {
    ...data,
    fields: fields.map((field) => {
      if (!field || typeof field !== 'object') return field;
      const clone = { ...(field as JsonObject) };
      delete clone[SENSITIVE_FORM_VALUE_KEY];
      return clone;
    }),
  };
}

function toEditorNode(node: NodeOut): ScenarioEditorNode {
  const data = removeSensitiveNodeData(node.type, node.data ?? {});
  return {
    id: node.id,
    data: { ...defaultNodeData(node.type), ...data, title: node.title },
    position: {
      x: Number(node.position?.x ?? 0),
      y: Number(node.position?.y ?? 0),
    },
    title: node.title,
    type: node.type,
  };
}

function toEditorEdge(edge: GraphIn['edges'][number]): ScenarioEditorEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'choice',
    data: { ...(edge.data ?? {}) },
  };
}

function toNodeOut(node: ScenarioEditorNode): NodeOut {
  const { title: _title, ...data } = node.data;
  return {
    id: node.id,
    type: node.type ?? 'data',
    position: { x: node.position.x, y: node.position.y },
    data,
    title: node.title,
  };
}

function toEdgeOut(edge: ScenarioEditorEdge): GraphIn['edges'][number] {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? null,
    data: { ...(edge.data ?? {}) },
  };
}

export const useScenarioEditorStore = create<ScenarioEditorState>()(
  immer((set, get) => ({
    edges: [],
    isDirty: false,
    lastSaveAt: null,
    nodes: [],
    revision: 0,
    selectedNodeId: null,

    addNode: (type, position) => {
      const id = `${type}-${Date.now()}-${generatedNodeId++}`;
      const title = defaultTitle(type);
      const node: ScenarioEditorNode = {
        id,
        type,
        position,
        title,
        data: { ...defaultNodeData(type), title },
      };
      set((state) => {
        state.nodes.push(node);
        state.selectedNodeId = id;
        state.isDirty = true;
        state.revision += 1;
      });
      return node;
    },

    updateNode: (id, patch) => {
      set((state) => {
        const node = state.nodes.find((item) => item.id === id);
        if (!node) return;
        if (patch.title !== undefined) {
          node.title = patch.title;
          node.data.title = patch.title;
        }
        if (patch.data) node.data = { ...node.data, ...patch.data };
        if (patch.position) node.position = patch.position;
        state.isDirty = true;
        state.revision += 1;
      });
    },

    updateNodeData: (id, patch) => {
      set((state) => {
        const node = state.nodes.find((item) => item.id === id);
        if (!node) return;
        node.data = { ...node.data, ...patch };
        state.isDirty = true;
        state.revision += 1;
      });
    },

    deleteNode: (id) => {
      set((state) => {
        state.nodes = state.nodes.filter((node) => node.id !== id);
        state.edges = state.edges.filter((edge) => edge.source !== id && edge.target !== id);
        if (state.selectedNodeId === id) state.selectedNodeId = null;
        state.isDirty = true;
        state.revision += 1;
      });
    },

    addEdge: (connection, data = {}) => {
      if (!connection.source || !connection.target) return null;
      const edge: ScenarioEditorEdge = {
        id: `edge-${Date.now()}-${generatedEdgeId++}`,
        source: connection.source,
        target: connection.target,
        type: 'choice',
        label: null,
        data: {
          [ANSWER_EDGE_KEY]: false,
          score_delta: 0,
          partial: false,
          ...data,
        },
      };
      set((state) => {
        state.edges.push(edge);
        state.isDirty = true;
        state.revision += 1;
      });
      return edge;
    },

    deleteEdge: (id) => {
      set((state) => {
        state.edges = state.edges.filter((edge) => edge.id !== id);
        state.isDirty = true;
        state.revision += 1;
      });
    },

    selectNode: (id) => {
      set((state) => {
        state.selectedNodeId = id;
      });
    },

    deleteSelected: () => {
      const selected = get().selectedNodeId;
      if (selected) get().deleteNode(selected);
    },

    applyNodeChanges: (changes) => {
      set((state) => {
        for (const change of changes) {
          if (change.type === 'remove') {
            state.nodes = state.nodes.filter((node) => node.id !== change.id);
            state.edges = state.edges.filter((edge) => edge.source !== change.id && edge.target !== change.id);
            continue;
          }
          if (change.type === 'position' && change.position) {
            const node = state.nodes.find((item) => item.id === change.id);
            if (node) node.position = change.position;
          }
        }
        state.isDirty = true;
        state.revision += 1;
      });
    },

    applyEdgeChanges: (changes) => {
      set((state) => {
        for (const change of changes) {
          if (change.type === 'remove') {
            state.edges = state.edges.filter((edge) => edge.id !== change.id);
          }
        }
        state.isDirty = true;
        state.revision += 1;
      });
    },

    loadGraph: (scenario) => {
      set((state) => {
        state.nodes = scenario.nodes.map(toEditorNode);
        state.edges = scenario.edges.map(toEditorEdge);
        state.selectedNodeId = null;
        state.isDirty = false;
        state.lastSaveAt = null;
        state.revision = 0;
      });
    },

    markSaved: (savedAt, revision) => {
      set((state) => {
        if (revision !== undefined && revision !== state.revision) return;
        state.isDirty = false;
        state.lastSaveAt = savedAt ?? new Date().toISOString();
      });
    },

    toGraphIn: () => ({
      edges: get().edges.map(toEdgeOut),
      nodes: get().nodes.map(toNodeOut),
    }),
  })),
);
