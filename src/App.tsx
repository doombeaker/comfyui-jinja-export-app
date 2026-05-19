import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { NodeGroup, ApiFormat } from "./lib/types";
import { parseApiFormat, generateJinjaTemplate } from "./lib/jinja";
import { parseGraph, autoLayout } from "./lib/graph";
import { detectFormat, convertWorkflowToApi } from "./lib/convert";
import WorkflowNode, { type WorkflowNodeData } from "./WorkflowNode";
import "./App.css";

const nodeTypes: NodeTypes = { workflow: WorkflowNode };

function App() {
  const [groups, setGroups] = useState<NodeGroup[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const apiDataRef = useRef<ApiFormat | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<Node<WorkflowNodeData>>([]);
  const [rfEdges, setRfEdges] = useEdgesState<Edge>([]);

  const hasWorkflow = apiDataRef.current !== null;
  const selectedCount = groups.reduce((acc, g) => acc + g.fields.filter((f) => f.selected).length, 0);
  const template = hasWorkflow ? generateJinjaTemplate(apiDataRef.current!, groups) : "";

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadJson = useCallback((jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed !== "object" || parsed === null) {
        showToast("JSON must be an object"); return;
      }

      const format = detectFormat(parsed);
      let data: ApiFormat;

      if (format === "workflow") {
        try { data = convertWorkflowToApi(parsed); }
        catch (e) { showToast(`Workflow conversion failed: ${(e as Error).message}`); return; }
      } else if (format === "api") {
        data = parsed as ApiFormat;
      } else {
        showToast("Not a valid ComfyUI JSON. Expected API or workflow format."); return;
      }

      apiDataRef.current = data;
      const parsedGroups = parseApiFormat(data);
      setGroups(parsedGroups);
      buildGraph(data, parsedGroups);
    } catch (e) {
      showToast(`Invalid JSON: ${(e as Error).message}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  const toggleField = useCallback((nodeId: string, fieldName: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.nodeId !== nodeId) return g;
        return { ...g, fields: g.fields.map((f) => f.fieldName === fieldName ? { ...f, selected: !f.selected } : f) };
      })
    );
  }, []);

  const setVarName = useCallback((nodeId: string, fieldName: string, varName: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.nodeId !== nodeId) return g;
        return { ...g, fields: g.fields.map((f) => f.fieldName === fieldName ? { ...f, varName } : f) };
      })
    );
  }, []);

  const fieldValueChange = useCallback((nodeId: string, fieldName: string, newValue: unknown) => {
    if (apiDataRef.current?.[nodeId]?.inputs) {
      apiDataRef.current[nodeId].inputs[fieldName] = newValue;
    }
    setGroups((prev) =>
      prev.map((g) => {
        if (g.nodeId !== nodeId) return g;
        return { ...g, fields: g.fields.map((f) => f.fieldName === fieldName ? { ...f, value: newValue } : f) };
      })
    );
    setRfNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId || n.type !== "workflow") return n;
        return { ...n, data: { ...n.data, fields: n.data.fields.map((f) => f.name === fieldName ? { ...f, value: newValue } : f) } };
      })
    );
  }, []);

  const buildGraph = useCallback((data: ApiFormat, parsedGroups: NodeGroup[]) => {
    const { nodes: gNodes, edges: gEdges } = parseGraph(data);
    const positions = autoLayout(gNodes, gEdges);

    const rfN: Node<WorkflowNodeData>[] = gNodes.map((n) => {
      const pos = positions.get(n.id) || { x: 0, y: 0 };
      const group = parsedGroups.find((g) => g.nodeId === n.id);
      const selFields: Record<string, boolean> = {};
      if (group) group.fields.forEach((f) => { selFields[f.fieldName] = f.selected; });
      return {
        id: n.id, type: "workflow", position: pos,
        data: { ...n, selectedFields: selFields, onToggleField: toggleField, onFieldValueChange: fieldValueChange },
      };
    });

    const rfE: Edge[] = gEdges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
      style: { stroke: "#555", strokeWidth: 2 },
    }));

    setRfNodes(rfN);
    setRfEdges(rfE);
  }, [toggleField, fieldValueChange, setRfNodes, setRfEdges]);

  const selectedFieldsMap = useMemo(() => {
    const map: Record<string, Record<string, boolean>> = {};
    for (const g of groups) { map[g.nodeId] = {}; for (const f of g.fields) { map[g.nodeId][f.fieldName] = f.selected; } }
    return map;
  }, [groups]);

  useEffect(() => {
    setRfNodes((prev) =>
      prev.map((n) => {
        if (n.type !== "workflow") return n;
        return { ...n, data: { ...n.data, selectedFields: selectedFieldsMap[n.id] || {} } };
      })
    );
  }, [selectedFieldsMap, setRfNodes]);

  const readFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => { if (typeof ev.target?.result === "string") loadJson(ev.target.result); };
    reader.readAsText(file);
  }, [loadJson]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    e.target.value = "";
  }, [readFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }, [readFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback(() => { setIsDragOver(false); }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(template).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }, [template]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>Jinja Export</h1>
          <span className="app-subtitle">ComfyUI Workflow → Jinja Template</span>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>Upload File</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileInput} hidden />
          {hasWorkflow && (
            <button className="btn btn-secondary" onClick={() => { apiDataRef.current = null; setGroups([]); setRfNodes([]); setRfEdges([]); setShowExport(false); }}>
              Clear
            </button>
          )}
        </div>
      </header>

      <div className="main-layout">
        <div
          className={`canvas-area ${isDragOver ? "drag-over" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onRfNodesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#333" gap={20} size={1} />
            <Controls />
          </ReactFlow>

          {!hasWorkflow && (
            <div className="canvas-empty">
              <div className="empty-icon">📂</div>
              <p className="empty-title">Drop a workflow JSON file here</p>
              <p className="empty-hint">or click <strong>Upload File</strong> above. Supports both API and workflow format.</p>
            </div>
          )}

          {isDragOver && <div className="drop-overlay">Drop JSON file to load</div>}
        </div>

        <div className="sidebar">
          {!showExport ? (
            <>
              <div className="sidebar-header">
                <h3>Selected <span className="count-badge">{selectedCount}</span></h3>
                {selectedCount > 0 && (
                  <button className="btn-text" onClick={() => setGroups((prev) => prev.map((g) => ({ ...g, fields: g.fields.map((f) => ({ ...f, selected: false })) })))}>
                    Clear
                  </button>
                )}
              </div>
              <div className="sidebar-content">
                {groups.map((g) => {
                  const selected = g.fields.filter((f) => f.selected);
                  if (selected.length === 0) return null;
                  return (
                    <div key={g.nodeId} className="selected-node">
                      <div className="selected-node-header">
                        <span className="node-title">{g.title}</span>
                        <span className="node-count">{selected.length}</span>
                      </div>
                      {selected.map((f) => {
                        const key = `${g.nodeId}-${f.fieldName}`;
                        return (
                          <div key={key} className="selected-field">
                            <span className="field-label">{f.fieldLabel}</span>
                            <span className="field-arrow">→</span>
                            {editingField === key ? (
                              <input
                                className="varname-input"
                                value={f.varName}
                                autoFocus
                                onChange={(e) => setVarName(g.nodeId, f.fieldName, e.target.value)}
                                onBlur={() => setEditingField(null)}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingField(null); }}
                              />
                            ) : (
                              <span className="varname" onClick={() => setEditingField(key)}>{f.varName}</span>
                            )}
                            <button className="btn-icon-sm" onClick={() => toggleField(g.nodeId, f.fieldName)}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {hasWorkflow && selectedCount === 0 && (
                  <div className="empty-state">
                    <p>Click checkboxes on the workflow nodes to select fields as Jinja variables.</p>
                  </div>
                )}
              </div>
              <div className="sidebar-footer">
                <button
                  className="btn btn-primary btn-block"
                  onClick={() => setShowExport(true)}
                  disabled={selectedCount === 0}
                >
                  Export Template
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="sidebar-header">
                <h3>Template</h3>
                <button className="btn-text" onClick={() => setShowExport(false)}>← Back</button>
              </div>
              <div className="sidebar-content">
                <pre className="template-output">{template}</pre>
              </div>
              <div className="sidebar-footer">
                <button className="btn btn-primary btn-block" onClick={handleCopy}>
                  {copied ? "Copied!" : "Copy to Clipboard"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  );
}

export default App;
