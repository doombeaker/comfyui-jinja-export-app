import { describe, it, expect } from "vitest";
import { parseGraph, autoLayout } from "./graph";
import type { ApiFormat } from "./types";

const SAMPLE_API: ApiFormat = {
  "3": {
    inputs: { seed: 42, steps: 20, model: ["4", 0], positive: ["6", 0] },
    class_type: "KSampler",
    _meta: { title: "KSampler" },
  },
  "4": {
    inputs: { ckpt_name: "model.safetensors" },
    class_type: "CheckpointLoaderSimple",
    _meta: { title: "Load Checkpoint" },
  },
  "6": {
    inputs: { text: "hello", clip: ["4", 1] },
    class_type: "CLIPTextEncode",
    _meta: { title: "CLIP Encode" },
  },
};

describe("parseGraph", () => {
  it("creates nodes for each API node", () => {
    const { nodes } = parseGraph(SAMPLE_API);
    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.id)).toContain("3");
    expect(nodes.map((n) => n.id)).toContain("4");
    expect(nodes.map((n) => n.id)).toContain("6");
  });

  it("separates link fields from value fields", () => {
    const { nodes } = parseGraph(SAMPLE_API);
    const ks = nodes.find((n) => n.id === "3")!;
    const nonLink = ks.fields.filter((f) => !f.isLink);
    const link = ks.fields.filter((f) => f.isLink);
    expect(nonLink.map((f) => f.name)).toEqual(["seed", "steps"]);
    expect(link.map((f) => f.name)).toEqual(["model", "positive"]);
  });

  it("creates edges from link references", () => {
    const { edges } = parseGraph(SAMPLE_API);
    expect(edges.length).toBeGreaterThanOrEqual(2);

    const modelEdge = edges.find((e) => e.targetHandle === "in-model");
    expect(modelEdge).toBeDefined();
    expect(modelEdge!.source).toBe("4");
    expect(modelEdge!.sourceHandle).toBe("out-0");

    const clipEdge = edges.find((e) => e.targetHandle === "in-clip");
    expect(clipEdge).toBeDefined();
    expect(clipEdge!.source).toBe("4");
    expect(clipEdge!.sourceHandle).toBe("out-1");
  });

  it("derives outputSlots from edges (not from processing order)", () => {
    const { nodes } = parseGraph(SAMPLE_API);
    const ckpt = nodes.find((n) => n.id === "4")!;
    expect(ckpt.outputSlots.length).toBeGreaterThanOrEqual(2);
  });

  it("handles node with no output connections", () => {
    const { nodes } = parseGraph({
      "9": { inputs: { filename_prefix: "ComfyUI" }, class_type: "SaveImage" },
    });
    const saveNode = nodes.find((n) => n.id === "9")!;
    expect(saveNode.outputSlots).toEqual([]);
  });

  it("sorts nodes numerically", () => {
    const data: ApiFormat = {
      "13": { inputs: { width: 512 }, class_type: "EmptyLatentImage" },
      "3": { inputs: { seed: 1 }, class_type: "KSampler" },
      "7": { inputs: { text: "bad" }, class_type: "CLIPTextEncode" },
    };
    const { nodes } = parseGraph(data);
    expect(nodes.map((n) => n.id)).toEqual(["3", "7", "13"]);
  });

  it("preserves node titles from _meta", () => {
    const { nodes } = parseGraph(SAMPLE_API);
    expect(nodes.find((n) => n.id === "6")!.title).toBe("CLIP Encode");
  });

  it("uses class_type as title when _meta is absent", () => {
    const data: ApiFormat = {
      "3": { inputs: { seed: 1 }, class_type: "KSampler" },
    };
    const { nodes } = parseGraph(data);
    expect(nodes[0].title).toBe("KSampler");
  });
});

describe("autoLayout", () => {
  it("returns a position for every node", () => {
    const { nodes, edges } = parseGraph(SAMPLE_API);
    const positions = autoLayout(nodes, edges);
    for (const n of nodes) {
      const pos = positions.get(n.id);
      expect(pos).toBeDefined();
      expect(typeof pos!.x).toBe("number");
      expect(typeof pos!.y).toBe("number");
    }
  });

  it("positions source nodes to the left of target nodes", () => {
    const { nodes, edges } = parseGraph(SAMPLE_API);
    const positions = autoLayout(nodes, edges);

    const node4 = positions.get("4")!;
    const node3 = positions.get("3")!;
    expect(node4.x).toBeLessThan(node3.x);
  });

  it("handles a workflow with no edges", () => {
    const data: ApiFormat = {
      "3": { inputs: { seed: 1 }, class_type: "KSampler" },
      "4": { inputs: { ckpt_name: "model.safetensors" }, class_type: "CheckpointLoaderSimple" },
    };
    const { nodes, edges } = parseGraph(data);
    const positions = autoLayout(nodes, edges);
    expect(positions.size).toBe(2);
  });

  it("handles a single node", () => {
    const data: ApiFormat = {
      "3": { inputs: { seed: 1 }, class_type: "KSampler" },
    };
    const { nodes, edges } = parseGraph(data);
    const positions = autoLayout(nodes, edges);
    expect(positions.size).toBe(1);
    const pos = positions.get("3")!;
    expect(typeof pos.x).toBe("number");
  });
});

describe("outputSlots regression", () => {
  it("KSampler output slot is populated even though it is processed before its downstream node", () => {
    const api: ApiFormat = {
      "3": {
        inputs: { seed: 1, steps: 20, model: ["16", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["13", 0] },
        class_type: "KSampler",
      },
      "6": { inputs: { text: "hello", clip: ["18", 0] }, class_type: "CLIPTextEncode" },
      "7": { inputs: { text: "bad", clip: ["18", 0] }, class_type: "CLIPTextEncode" },
      "8": { inputs: { samples: ["3", 0], vae: ["17", 0] }, class_type: "VAEDecode" },
      "9": { inputs: { filename_prefix: "ComfyUI", images: ["8", 0] }, class_type: "SaveImage" },
      "13": { inputs: { width: 1024, height: 1024, batch_size: 1 }, class_type: "EmptySD3LatentImage" },
      "16": { inputs: { unet_name: "model.safetensors" }, class_type: "UNETLoader" },
      "17": { inputs: { vae_name: "ae.safetensors" }, class_type: "VAELoader" },
      "18": { inputs: { clip_name: "clip.safetensors" }, class_type: "CLIPLoader" },
    };

    const { nodes, edges } = parseGraph(api);

    const ksampler = nodes.find((n) => n.id === "3")!;
    expect(ksampler.outputSlots.length).toBeGreaterThan(0);

    const vaeDecodeEdge = edges.find((e) => e.target === "8" && e.targetHandle === "in-samples");
    expect(vaeDecodeEdge).toBeDefined();
    expect(vaeDecodeEdge!.source).toBe("3");
    expect(vaeDecodeEdge!.sourceHandle).toBe("out-0");

    const vaeDec = nodes.find((n) => n.id === "8")!;
    expect(vaeDec.outputSlots.length).toBeGreaterThan(0);

    const saveImg = nodes.find((n) => n.id === "9")!;
    expect(saveImg.outputSlots).toEqual([]);
  });
});
