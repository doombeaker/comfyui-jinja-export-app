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

type Step = "input" | "select" | "export";

const EXAMPLE_JSON = `{
  "3": {
    "inputs": {
      "seed": 156680208700286,
      "steps": 20,
      "cfg": 8,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1,
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    },
    "class_type": "KSampler",
    "_meta": { "title": "KSampler" }
  },
  "4": {
    "inputs": {
      "ckpt_name": "v1-5-pruned-emaonly-fp16.safetensors"
    },
    "class_type": "CheckpointLoaderSimple",
    "_meta": { "title": "Load Checkpoint" }
  },
  "5": {
    "inputs": {
      "width": 512,
      "height": 512,
      "batch_size": 1
    },
    "class_type": "EmptyLatentImage",
    "_meta": { "title": "Empty Latent Image" }
  },
  "6": {
    "inputs": {
      "text": "beautiful scenery nature glass bottle landscape, purple galaxy bottle",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Prompt)" }
  },
  "7": {
    "inputs": {
      "text": "text, watermark",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Negative Prompt)" }
  },
  "8": {
    "inputs": {
      "samples": ["3", 0],
      "vae": ["4", 2]
    },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "9": {
    "inputs": {
      "filename_prefix": "ComfyUI",
      "images": ["8", 0]
    },
    "class_type": "SaveImage",
    "_meta": { "title": "Save Image" }
  }
}`;

const nodeTypes: NodeTypes = { workflow: WorkflowNode };

function App() {
  const [step, setStep] = useState<Step>("input");
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState("");
  const [groups, setGroups] = useState<NodeGroup[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const apiDataRef = useRef<ApiFormat | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<Node<WorkflowNodeData>>([]);
  const [rfEdges, setRfEdges] = useEdgesState<Edge>([]);

  const selectedFieldsMap = useMemo(() => {
    const map: Record<string, Record<string, boolean>> = {};
    for (const g of groups) {
      map[g.nodeId] = {};
      for (const f of g.fields) {
        map[g.nodeId][f.fieldName] = f.selected;
      }
    }
    return map;
  }, [groups]);

  const toggleField = useCallback((nodeId: string, fieldName: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.nodeId !== nodeId) return g;
        return {
          ...g,
          fields: g.fields.map((f) =>
            f.fieldName === fieldName ? { ...f, selected: !f.selected } : f
          ),
        };
      })
    );
  }, []);

  const setVarName = useCallback((nodeId: string, fieldName: string, varName: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.nodeId !== nodeId) return g;
        return {
          ...g,
          fields: g.fields.map((f) =>
            f.fieldName === fieldName ? { ...f, varName } : f
          ),
        };
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
        return {
          ...g,
          fields: g.fields.map((f) =>
            f.fieldName === fieldName ? { ...f, value: newValue } : f
          ),
        };
      })
    );
    setRfNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId || n.type !== "workflow") return n;
        return {
          ...n,
          data: {
            ...n.data,
            fields: n.data.fields.map((f) =>
              f.name === fieldName ? { ...f, value: newValue } : f
            ),
          },
        };
      })
    );
  }, []);

  const handleParse = useCallback(() => {
    setParseError("");
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed !== "object" || parsed === null) { setParseError("JSON must be an object"); return; }

      const format = detectFormat(parsed);
      let data: ApiFormat;

      if (format === "workflow") {
        try {
          data = convertWorkflowToApi(parsed);
        } catch (e) {
          setParseError(`Workflow conversion failed: ${(e as Error).message}`);
          return;
        }
      } else if (format === "api") {
        data = parsed as ApiFormat;
      } else {
        setParseError("Not a valid ComfyUI JSON. Expected API format or workflow format.");
        return;
      }

      apiDataRef.current = data;
      const groups = parseApiFormat(data);
      setGroups(groups);
      buildGraph(data, groups);
      setStep("select");
    } catch (e) {
      setParseError(`Invalid JSON: ${(e as Error).message}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonText]);

  const buildGraph = useCallback((data: ApiFormat, parsedGroups: NodeGroup[]) => {
    const { nodes: gNodes, edges: gEdges } = parseGraph(data);
    const positions = autoLayout(gNodes, gEdges);

    const rfN: Node<WorkflowNodeData>[] = gNodes.map((n) => {
      const pos = positions.get(n.id) || { x: 0, y: 0 };
      const group = parsedGroups.find((g) => g.nodeId === n.id);
      const selFields: Record<string, boolean> = {};
      if (group) group.fields.forEach((f) => { selFields[f.fieldName] = f.selected; });
      return {
        id: n.id,
        type: "workflow",
        position: pos,
        data: {
          ...n,
          selectedFields: selFields,
          onToggleField: toggleField,
          onFieldValueChange: fieldValueChange,
        },
      };
    });

    const rfE: Edge[] = gEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      style: { stroke: "#555", strokeWidth: 2 },
    }));

    setRfNodes(rfN);
    setRfEdges(rfE);
  }, [toggleField, fieldValueChange, setRfNodes, setRfEdges]);

  useEffect(() => {
    setRfNodes((prev) =>
      prev.map((n) => {
        if (n.type !== "workflow") return n;
        return {
          ...n,
          data: {
            ...n.data,
            selectedFields: selectedFieldsMap[n.id] || {},
          },
        };
      })
    );
  }, [selectedFieldsMap, setRfNodes]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { if (typeof ev.target?.result === "string") setJsonText(ev.target.result); };
    reader.readAsText(file);
  }, []);

  const selectedCount = groups.reduce((acc, g) => acc + g.fields.filter((f) => f.selected).length, 0);
  const template = apiDataRef.current ? generateJinjaTemplate(apiDataRef.current, groups) : "";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(template).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }, [template]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Jinja Export</h1>
        <p className="app-subtitle">ComfyUI Workflow API JSON → Jinja Template</p>
      </header>

      <nav className="steps-bar">
        <button className={`step-btn ${step === "input" ? "active" : ""}`} onClick={() => step !== "input" && setStep("input")}>
          <span className="step-num">1</span> Import
        </button>
        <div className="step-line" />
        <button className={`step-btn ${step === "select" ? "active" : ""}`} disabled={!apiDataRef.current}>
          <span className="step-num">2</span> Select
        </button>
        <div className="step-line" />
        <button className={`step-btn ${step === "export" ? "active" : ""}`} disabled={selectedCount === 0}>
          <span className="step-num">3</span> Export
        </button>
      </nav>

      <main className="app-main">
        {step === "input" && (
          <div className="input-panel">
            <div className="input-actions">
              <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>Upload File</button>
              <button className="btn btn-secondary" onClick={() => setJsonText(EXAMPLE_JSON)}>Load Example</button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} hidden />
            </div>
            <textarea
              className="json-input"
              placeholder="Paste your ComfyUI API or workflow format JSON here..."
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
            {parseError && <p className="error-msg">{parseError}</p>}
            <button className="btn btn-primary btn-block" onClick={handleParse} disabled={!jsonText.trim()}>
              Parse & Continue
            </button>
          </div>
        )}

        {step === "select" && (
          <div className="select-panel">
            <div className="select-sidebar">
              <div className="sidebar-header">
                <h3>Selected ({selectedCount})</h3>
                <button className="btn-text" onClick={() => setGroups((prev) => prev.map((g) => ({ ...g, fields: g.fields.map((f) => ({ ...f, selected: false })) })))}>
                  Clear
                </button>
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
                {selectedCount === 0 && (
                  <div className="empty-state">
                    <p>Click checkboxes on the workflow nodes to select fields as Jinja variables.</p>
                  </div>
                )}
              </div>
              <div className="sidebar-footer">
                <button className="btn btn-primary btn-block" onClick={() => setStep("export")} disabled={selectedCount === 0}>
                  Next: Export
                </button>
              </div>
            </div>
            <div className="select-canvas">
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
            </div>
          </div>
        )}

        {step === "export" && (
          <div className="export-panel">
            <h3>Generated Jinja Template</h3>
            <pre className="template-output">{template}</pre>
            <div className="export-actions">
              <button className="btn btn-secondary" onClick={() => setStep("select")}>← Back</button>
              <button className="btn btn-primary" onClick={handleCopy}>{copied ? "Copied!" : "Copy to Clipboard"}</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
