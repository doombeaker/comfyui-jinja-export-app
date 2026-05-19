import type { ApiFormat } from "./types";
import dagre from "dagre";

export interface GraphNode {
  id: string;
  title: string;
  classType: string;
  fields: { name: string; value: unknown; isLink: boolean }[];
  outputSlots: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export function parseGraph(data: ApiFormat): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const [nodeId, node] of Object.entries(data)) {
    if (!node.inputs || !node.class_type) continue;

    const fields: GraphNode["fields"] = [];

    for (const [fieldName, value] of Object.entries(node.inputs)) {
      const isLink = Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "number";
      if (isLink) {
        const [srcId, srcSlot] = value as [string, number];
        const edgeId = `e-${srcId}-${srcSlot}-${nodeId}-${fieldName}`;
        const sourceHandle = `out-${srcSlot}`;
        const targetHandle = `in-${fieldName}`;
        edges.push({ id: edgeId, source: srcId, sourceHandle, target: nodeId, targetHandle });
        fields.push({ name: fieldName, value: null, isLink: true });
      } else {
        fields.push({ name: fieldName, value, isLink: false });
      }
    }

    nodes.push({
      id: nodeId,
      title: node._meta?.title || node.class_type,
      classType: node.class_type,
      fields,
      outputSlots: [],
    });
  }

  const outputSlotMap = new Map<string, string[]>();
  for (const e of edges) {
    const slotIdx = parseInt(e.sourceHandle.replace("out-", ""), 10);
    if (!outputSlotMap.has(e.source)) outputSlotMap.set(e.source, []);
    const slots = outputSlotMap.get(e.source)!;
    while (slots.length <= slotIdx) slots.push(`output_${slots.length}`);
    slots[slotIdx] = e.targetHandle.replace("in-", "");
  }

  for (const n of nodes) {
    n.outputSlots = outputSlotMap.get(n.id) || [];
  }

  nodes.sort((a, b) => {
    const na = parseInt(a.id, 10);
    const nb = parseInt(b.id, 10);
    return isNaN(na) || isNaN(nb) ? a.id.localeCompare(b.id) : na - nb;
  });

  return { nodes, edges };
}

export function autoLayout(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 80 });

  for (const n of nodes) {
    const fieldCount = n.fields.filter((f) => !f.isLink).length;
    const h = 50 + fieldCount * 28 + 20;
    g.setNode(n.id, { width: 260, height: h });
  }

  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const pos = g.node(n.id);
    if (pos) {
      positions.set(n.id, { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 });
    }
  }
  return positions;
}
