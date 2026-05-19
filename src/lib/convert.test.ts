import { describe, it, expect } from "vitest";
import { detectFormat, convertWorkflowToApi } from "./convert";
import type { ApiFormat } from "./types";

describe("detectFormat", () => {
  it("detects API format", () => {
    const api = { "3": { inputs: { seed: 1 }, class_type: "KSampler" } };
    expect(detectFormat(api)).toBe("api");
  });

  it("detects API format with multiple nodes", () => {
    const api = {
      "3": { inputs: { seed: 1 }, class_type: "KSampler" },
      "6": { inputs: { text: "hello" }, class_type: "CLIPTextEncode" },
    };
    expect(detectFormat(api)).toBe("api");
  });

  it("detects workflow format", () => {
    const wf = { nodes: [{ id: 3, type: "KSampler" }], links: [] };
    expect(detectFormat(wf)).toBe("workflow");
  });

  it("returns null for null", () => {
    expect(detectFormat(null)).toBe(null);
  });

  it("returns null for empty object", () => {
    expect(detectFormat({})).toBe(null);
  });

  it("returns null for array", () => {
    expect(detectFormat([1, 2, 3])).toBe(null);
  });

  it("returns null for random object", () => {
    expect(detectFormat({ foo: "bar" })).toBe(null);
  });

  it("returns null for string", () => {
    expect(detectFormat("hello")).toBe(null);
  });
});

describe("convertWorkflowToApi", () => {
  it("converts a minimal workflow with one node", () => {
    const wf = {
      nodes: [
        { id: 3, type: "KSampler", widgets_values: [42, "randomize", 20, 8, "euler", "normal", 1] },
      ],
      links: [],
    };
    const api = convertWorkflowToApi(wf);
    expect(api["3"].class_type).toBe("KSampler");
    expect(api["3"].inputs.seed).toBe(42);
    expect(api["3"].inputs.steps).toBe(20);
    expect(api["3"].inputs.cfg).toBe(8);
    expect(api["3"].inputs.sampler_name).toBe("euler");
    expect(api["3"].inputs.scheduler).toBe("normal");
    expect(api["3"].inputs.denoise).toBe(1);
    expect(api["3"]._meta.title).toBe("KSampler");
  });

  it("handles KSampler seed consuming 2 slots (skips control_after_generate)", () => {
    const wf = {
      nodes: [
        { id: 1, type: "KSampler", widgets_values: [999, "fixed", 10, 2, "euler_ancestral", "karras", 0.8] },
      ],
      links: [],
    };
    const api = convertWorkflowToApi(wf);
    expect(api["1"].inputs.seed).toBe(999);
    expect(api["1"].inputs.steps).toBe(10);
    expect(api["1"].inputs.cfg).toBe(2);
    expect(api["1"].inputs.denoise).toBe(0.8);
  });

  it("resolves link connections to [nodeId, slot] format", () => {
    const wf = {
      nodes: [
        { id: 4, type: "CheckpointLoaderSimple", widgets_values: ["model.safetensors"], inputs: [] },
        { id: 6, type: "CLIPTextEncode", widgets_values: ["hello world"], inputs: [{ name: "clip", type: "CLIP", link: 1 }] },
      ],
      links: [[1, 4, 1, 6, 0, "CLIP"]],
    };
    const api = convertWorkflowToApi(wf);
    expect(api["6"].inputs.clip).toEqual(["4", 1]);
  });

  it("uses node title for _meta", () => {
    const wf = {
      nodes: [{ id: 6, type: "CLIPTextEncode", title: "Positive Prompt", widgets_values: ["hello"], inputs: [] }],
      links: [],
    };
    const api = convertWorkflowToApi(wf);
    expect(api["6"]._meta.title).toBe("Positive Prompt");
  });

  it("falls back to type when no title", () => {
    const wf = {
      nodes: [{ id: 6, type: "CLIPTextEncode", widgets_values: ["hello"], inputs: [] }],
      links: [],
    };
    const api = convertWorkflowToApi(wf);
    expect(api["6"]._meta.title).toBe("CLIPTextEncode");
  });

  it("handles nodes without widgets_values", () => {
    const wf = {
      nodes: [
        { id: 8, type: "VAEDecode", inputs: [{ name: "samples", type: "LATENT", link: 1 }, { name: "vae", type: "VAE", link: 2 }] },
        { id: 3, type: "KSampler" },
        { id: 17, type: "VAELoader" },
      ],
      links: [[1, 3, 0, 8, 0, "LATENT"], [2, 17, 0, 8, 1, "VAE"]],
    };
    const api = convertWorkflowToApi(wf);
    expect(api["8"].inputs.samples).toEqual(["3", 0]);
    expect(api["8"].inputs.vae).toEqual(["17", 0]);
  });

  it("handles UNETLoader with model_version_id", () => {
    const wf = {
      nodes: [{ id: 16, type: "UNETLoader", widgets_values: ["model.safetensors", "fp8_e4m3fn_fast", 39763], inputs: [] }],
      links: [],
    };
    const api = convertWorkflowToApi(wf);
    expect(api["16"].inputs.unet_name).toBe("model.safetensors");
    expect(api["16"].inputs.weight_dtype).toBe("fp8_e4m3fn_fast");
    expect(api["16"].inputs.model_version_id).toBe(39763);
  });

  it("handles VAELoader with model_version_id", () => {
    const wf = {
      nodes: [{ id: 17, type: "VAELoader", widgets_values: ["ae.safetensors", 39762], inputs: [] }],
      links: [],
    };
    const api = convertWorkflowToApi(wf);
    expect(api["17"].inputs.vae_name).toBe("ae.safetensors");
    expect(api["17"].inputs.model_version_id).toBe(39762);
  });

  it("handles CLIPLoader with device and model_version_id", () => {
    const wf = {
      nodes: [{ id: 18, type: "CLIPLoader", widgets_values: ["clip.safetensors", "lumina2", "default", 39764], inputs: [] }],
      links: [],
    };
    const api = convertWorkflowToApi(wf);
    expect(api["18"].inputs.clip_name).toBe("clip.safetensors");
    expect(api["18"].inputs.type).toBe("lumina2");
    expect(api["18"].inputs.device).toBe("default");
    expect(api["18"].inputs.model_version_id).toBe(39764);
  });

  it("handles unknown node types with param_N naming", () => {
    const wf = {
      nodes: [{ id: 99, type: "MyCustomNode", widgets_values: ["val1", 42, true], inputs: [] }],
      links: [],
    };
    const api = convertWorkflowToApi(wf);
    expect(api["99"].inputs.param_0).toBe("val1");
    expect(api["99"].inputs.param_1).toBe(42);
    expect(api["99"].inputs.param_2).toBe(true);
  });

  it("handles extra widget values beyond definition with extra_N naming", () => {
    const wf = {
      nodes: [{ id: 9, type: "SaveImage", widgets_values: ["ComfyUI", 99, "extra"], inputs: [] }],
      links: [],
    };
    const api = convertWorkflowToApi(wf);
    expect(api["9"].inputs.filename_prefix).toBe("ComfyUI");
    expect(api["9"].inputs.extra_1).toBe(99);
    expect(api["9"].inputs.extra_2).toBe("extra");
  });

  it("throws on invalid workflow (no nodes)", () => {
    expect(() => convertWorkflowToApi({ links: [] })).toThrow("missing nodes or links");
  });

  it("throws on invalid workflow (no links)", () => {
    expect(() => convertWorkflowToApi({ nodes: [] })).toThrow("missing nodes or links");
  });

  it("converts a full complex workflow matching expected API format", () => {
    const wf = {
      nodes: [
        { id: 3, type: "KSampler", inputs: [{ name: "model", type: "MODEL", link: 10 }, { name: "positive", type: "CONDITIONING", link: 11 }, { name: "negative", type: "CONDITIONING", link: 12 }, { name: "latent_image", type: "LATENT", link: 13 }], widgets_values: [1096743135907963, "randomize", 6, 1, "euler", "simple", 1], title: "K采样器" },
        { id: 6, type: "CLIPTextEncode", inputs: [{ name: "clip", type: "CLIP", link: 14 }], widgets_values: ["hello prompt"], title: "Positive" },
        { id: 7, type: "CLIPTextEncode", inputs: [{ name: "clip", type: "CLIP", link: 15 }], widgets_values: ["bad"], title: "Negative" },
        { id: 8, type: "VAEDecode", inputs: [{ name: "samples", type: "LATENT", link: 16 }, { name: "vae", type: "VAE", link: 17 }] },
        { id: 9, type: "SaveImage", inputs: [{ name: "images", type: "IMAGE", link: 18 }], widgets_values: ["ComfyUI"] },
        { id: 13, type: "EmptySD3LatentImage", inputs: [], widgets_values: [1024, 1024, 1] },
        { id: 16, type: "UNETLoader", inputs: [], widgets_values: ["z_image_turbo_bf16.safetensors", "fp8_e4m3fn_fast", 39763] },
        { id: 17, type: "VAELoader", inputs: [], widgets_values: ["ae.safetensors", 39762] },
        { id: 18, type: "CLIPLoader", inputs: [], widgets_values: ["qwen_3_4b.safetensors", "lumina2", "default", 39764] },
      ],
      links: [
        [10, 16, 0, 3, 0, "MODEL"],
        [11, 6, 0, 3, 1, "CONDITIONING"],
        [12, 7, 0, 3, 2, "CONDITIONING"],
        [13, 13, 0, 3, 3, "LATENT"],
        [14, 18, 0, 6, 0, "CLIP"],
        [15, 18, 0, 7, 0, "CLIP"],
        [16, 3, 0, 8, 0, "LATENT"],
        [17, 17, 0, 8, 1, "VAE"],
        [18, 8, 0, 9, 0, "IMAGE"],
      ],
    };

    const api = convertWorkflowToApi(wf);

    expect(api["3"].class_type).toBe("KSampler");
    expect(api["3"]._meta.title).toBe("K采样器");
    expect(api["3"].inputs.seed).toBe(1096743135907963);
    expect(api["3"].inputs.steps).toBe(6);
    expect(api["3"].inputs.cfg).toBe(1);
    expect(api["3"].inputs.sampler_name).toBe("euler");
    expect(api["3"].inputs.scheduler).toBe("simple");
    expect(api["3"].inputs.denoise).toBe(1);
    expect(api["3"].inputs.model).toEqual(["16", 0]);
    expect(api["3"].inputs.positive).toEqual(["6", 0]);
    expect(api["3"].inputs.negative).toEqual(["7", 0]);
    expect(api["3"].inputs.latent_image).toEqual(["13", 0]);

    expect(api["6"].inputs.text).toBe("hello prompt");
    expect(api["6"].inputs.clip).toEqual(["18", 0]);

    expect(api["8"].inputs.samples).toEqual(["3", 0]);
    expect(api["8"].inputs.vae).toEqual(["17", 0]);

    expect(api["9"].inputs.filename_prefix).toBe("ComfyUI");
    expect(api["9"].inputs.images).toEqual(["8", 0]);

    expect(api["13"].inputs.width).toBe(1024);
    expect(api["13"].inputs.height).toBe(1024);
    expect(api["13"].inputs.batch_size).toBe(1);
  });
});
