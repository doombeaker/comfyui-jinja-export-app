import { memo, useState, type FC } from "react";
import { Handle, Position } from "@xyflow/react";
import type { GraphNode } from "../lib/graph";

export type WorkflowNodeData = GraphNode & {
  selectedFields: Record<string, boolean>;
  onToggleField: (nodeId: string, fieldName: string) => void;
  onFieldValueChange: (nodeId: string, fieldName: string, newValue: unknown) => void;
};

const WorkflowNode: FC<{ data: WorkflowNodeData; id: string }> = memo(({ data, id }) => {
  const { title, classType, fields, outputSlots, selectedFields, onToggleField, onFieldValueChange } = data;
  const nonLinkFields = fields.filter((f) => !f.isLink);
  const linkFields = fields.filter((f) => f.isLink);
  const hasAnySelected = nonLinkFields.some((f) => selectedFields[f.name]);
  const allSelected = nonLinkFields.length > 0 && nonLinkFields.every((f) => selectedFields[f.name]);

  const [editingName, setEditingName] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const startEdit = (fieldName: string, currentValue: unknown) => {
    setEditingName(fieldName);
    setEditText(String(currentValue ?? ""));
  };

  const commitEdit = () => {
    if (editingName === null) return;
    const original = fields.find((f) => f.name === editingName)?.value;
    let parsed: unknown = editText;
    if (typeof original === "number") {
      const num = Number(editText);
      if (!isNaN(num)) parsed = num;
    }
    onFieldValueChange(id, editingName, parsed);
    setEditingName(null);
  };

  return (
    <div className={`wf-node ${hasAnySelected ? "wf-node-active" : ""}`}>
      <div className="wf-node-header">
        <span className="wf-node-title">{title}</span>
        {nonLinkFields.length > 0 && (
          <button
            className={`wf-check-all ${allSelected ? "checked" : hasAnySelected ? "partial" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              nonLinkFields.forEach((f) => {
                if (allSelected) onToggleField(id, f.name);
                else if (!selectedFields[f.name]) onToggleField(id, f.name);
              });
            }}
            title={allSelected ? "Deselect all" : "Select all"}
          >
            {allSelected ? "✓" : hasAnySelected ? "−" : ""}
          </button>
        )}
      </div>
      <div className="wf-node-class">{classType}</div>

      {nonLinkFields.length > 0 && (
        <div className="wf-node-fields">
          {nonLinkFields.map((f) => {
            const sel = !!selectedFields[f.name];
            const isEditing = editingName === f.name;
            const displayVal = String(f.value ?? "");

            return (
              <div
                key={f.name}
                className={`wf-field ${sel ? "wf-field-selected" : ""}`}
              >
                <span
                  className={`wf-checkbox ${sel ? "checked" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleField(id, f.name);
                  }}
                >
                  {sel && "✓"}
                </span>
                <span className="wf-field-name">{f.name}</span>
                {isEditing ? (
                  <input
                    className="wf-value-input"
                    value={editText}
                    autoFocus
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingName(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="wf-field-value"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(f.name, f.value);
                    }}
                    title={displayVal}
                  >
                    {displayVal.length > 20 ? displayVal.substring(0, 20) + "…" : displayVal}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {linkFields.map((f, i) => (
        <Handle
          key={f.name}
          type="target"
          position={Position.Left}
          id={`in-${f.name}`}
          style={{ top: `${((i + 1) / (linkFields.length + 1)) * 100}%` }}
        />
      ))}

      {outputSlots.map((slotName, i) => (
        <Handle
          key={`out-${i}`}
          type="source"
          position={Position.Right}
          id={`out-${i}`}
          style={{ top: `${((i + 1) / (outputSlots.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
});

WorkflowNode.displayName = "WorkflowNode";
export default WorkflowNode;
