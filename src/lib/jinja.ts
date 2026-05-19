import type { ApiFormat, NodeGroup, NodeField } from "./types";

function isLinkRef(v: unknown): boolean {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "number";
}

export function parseApiFormat(data: ApiFormat): NodeGroup[] {
  const groups: NodeGroup[] = [];

  for (const [nodeId, node] of Object.entries(data)) {
    if (!node.inputs || !node.class_type) continue;

    const title = node._meta?.title || node.class_type;
    const fields: NodeField[] = [];

    for (const [fieldName, value] of Object.entries(node.inputs)) {
      const isLink = isLinkRef(value);
      fields.push({
        nodeId,
        fieldName,
        fieldLabel: fieldName,
        value: isLink ? undefined : value,
        isLink,
        selected: false,
        varName: fieldName,
      });
    }

    groups.push({ nodeId, title, classType: node.class_type, fields });
  }

  groups.sort((a, b) => {
    const na = parseInt(a.nodeId, 10);
    const nb = parseInt(b.nodeId, 10);
    return isNaN(na) || isNaN(nb) ? a.nodeId.localeCompare(b.nodeId) : na - nb;
  });

  return groups;
}

export function toJinjaDefault(val: unknown): string {
  if (typeof val === "string") return JSON.stringify(val);
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return String(val);
  if (val === null) return "null";
  return JSON.stringify(val);
}

export function generateJinjaTemplate(
  data: ApiFormat,
  groups: NodeGroup[]
): string {
  const replaced = JSON.parse(JSON.stringify(data));

  for (const group of groups) {
    for (const field of group.fields) {
      if (!field.selected) continue;
      if (!replaced[group.nodeId]?.inputs) continue;
      const defaultVal = toJinjaDefault(field.value);
      replaced[group.nodeId].inputs[field.fieldName] =
        `{{ request.${field.varName}|default(${defaultVal}) }}`;
    }
  }

  return toJinjaJson(replaced, 0);
}

function toJinjaJson(obj: unknown, depth: number): string {
  const pad = "  ".repeat(depth);
  const pad1 = "  ".repeat(depth + 1);

  if (obj === null) return "null";
  if (typeof obj === "number") return String(obj);
  if (typeof obj === "boolean") return String(obj);
  if (typeof obj === "string") {
    if (obj.startsWith("{{ request.") && obj.endsWith(" }}")) return obj;
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    const items = obj.map((v) => toJinjaJson(v, depth + 1));
    return `[${items.join(", ")}]`;
  }
  if (typeof obj === "object" && obj !== null) {
    const entries = Object.entries(obj as Record<string, unknown>);
    const fields = entries.map(([k, v]) => {
      const val = toJinjaJson(v, depth + 1);
      return `${pad1}${JSON.stringify(k)}: ${val}`;
    });
    return `{\n${fields.join(",\n")}\n${pad}}`;
  }
  return String(obj);
}
