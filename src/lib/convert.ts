import type { ApiFormat } from "./types";

interface WFNode {
  id: number;
  type: string;
  inputs?: { name: string; type: string; link: number | null }[];
  outputs?: { name: string; type: string; links: number[] | null }[];
  widgets_values?: unknown[];
  properties?: Record<string, unknown>;
  title?: string;
  mode?: number;
}

type WFLink = [number, number, number, number, number, string];

interface WorkflowFormat {
  nodes: WFNode[];
  links: WFLink[];
}

export type FormatType = "api" | "workflow";

export function detectFormat(json: unknown): FormatType | null {
  if (typeof json !== "object" || json === null) return null;
  const obj = json as Record<string, unknown>;

  if (Array.isArray(obj.nodes) && Array.isArray(obj.links)) return "workflow";

  const keys = Object.keys(obj);
  if (
    keys.length > 0 &&
    keys.every((k) => {
      const v = obj[k];
      return (
        typeof v === "object" &&
        v !== null &&
        typeof (v as Record<string, unknown>).class_type === "string"
      );
    })
  )
    return "api";

  return null;
}

type WidgetSpec = { name: string; consumes: number };

const NODE_DEFS: Record<string, WidgetSpec[]> = {
  KSampler: [
    { name: "seed", consumes: 2 },
    { name: "steps", consumes: 1 },
    { name: "cfg", consumes: 1 },
    { name: "sampler_name", consumes: 1 },
    { name: "scheduler", consumes: 1 },
    { name: "denoise", consumes: 1 },
  ],
  KSamplerAdvanced: [
    { name: "add_noise", consumes: 1 },
    { name: "noise_seed", consumes: 2 },
    { name: "steps", consumes: 1 },
    { name: "cfg", consumes: 1 },
    { name: "sampler_name", consumes: 1 },
    { name: "scheduler", consumes: 1 },
    { name: "denoise", consumes: 1 },
    { name: "start_at_step", consumes: 1 },
    { name: "end_at_step", consumes: 1 },
    { name: "return_with_leftover_noise", consumes: 1 },
  ],
  SamplerCustom: [
    { name: "add_noise", consumes: 1 },
    { name: "noise_seed", consumes: 2 },
    { name: "cfg", consumes: 1 },
    { name: "sampler_name", consumes: 1 },
    { name: "scheduler", consumes: 1 },
    { name: "sigmas", consumes: 1 },
    { name: "start_at", consumes: 1 },
    { name: "end_at", consumes: 1 },
  ],
  SamplerCustomAdvanced: [
    { name: "add_noise", consumes: 1 },
    { name: "noise_seed", consumes: 2 },
    { name: "cfg", consumes: 1 },
    { name: "sampler_name", consumes: 1 },
    { name: "scheduler", consumes: 1 },
  ],
  CLIPTextEncode: [{ name: "text", consumes: 1 }],
  CLIPSetLastLayer: [{ name: "stop_at_clip_layer", consumes: 1 }],
  CheckpointLoaderSimple: [{ name: "ckpt_name", consumes: 1 }],
  CheckpointLoader: [
    { name: "config_name", consumes: 1 },
    { name: "ckpt_name", consumes: 1 },
  ],
  UNETLoader: [
    { name: "unet_name", consumes: 1 },
    { name: "weight_dtype", consumes: 1 },
    { name: "model_version_id", consumes: 1 },
  ],
  CLIPLoader: [
    { name: "clip_name", consumes: 1 },
    { name: "type", consumes: 1 },
    { name: "device", consumes: 1 },
    { name: "model_version_id", consumes: 1 },
  ],
  VAELoader: [
    { name: "vae_name", consumes: 1 },
    { name: "model_version_id", consumes: 1 },
  ],
  DualCLIPLoader: [
    { name: "clip_name1", consumes: 1 },
    { name: "clip_name2", consumes: 1 },
    { name: "type", consumes: 1 },
  ],
  TripleCLIPLoader: [
    { name: "clip_name1", consumes: 1 },
    { name: "clip_name2", consumes: 1 },
    { name: "clip_name3", consumes: 1 },
  ],
  EmptyLatentImage: [
    { name: "width", consumes: 1 },
    { name: "height", consumes: 1 },
    { name: "batch_size", consumes: 1 },
  ],
  EmptySD3LatentImage: [
    { name: "width", consumes: 1 },
    { name: "height", consumes: 1 },
    { name: "batch_size", consumes: 1 },
  ],
  EmptyHunyuanLatentVideo: [
    { name: "width", consumes: 1 },
    { name: "height", consumes: 1 },
    { name: "length", consumes: 1 },
    { name: "batch_size", consumes: 1 },
  ],
  EmptyLatentAudio: [{ name: "batch_size", consumes: 1 }],
  VAEDecode: [],
  VAEEncode: [],
  SaveImage: [{ name: "filename_prefix", consumes: 1 }],
  PreviewImage: [],
  LoraLoader: [
    { name: "lora_name", consumes: 1 },
    { name: "strength_model", consumes: 1 },
    { name: "strength_clip", consumes: 1 },
  ],
  LoraLoaderModelOnly: [
    { name: "lora_name", consumes: 1 },
    { name: "strength_model", consumes: 1 },
  ],
  ControlNetLoader: [{ name: "control_net_name", consumes: 1 }],
  ControlNetApply: [{ name: "strength", consumes: 1 }],
  ControlNetApplyAdvanced: [
    { name: "strength", consumes: 1 },
    { name: "start_percent", consumes: 1 },
    { name: "end_percent", consumes: 1 },
  ],
  SetUnionControlNetType: [{ name: "type", consumes: 1 }],
  ImageScale: [
    { name: "upscale_method", consumes: 1 },
    { name: "width", consumes: 1 },
    { name: "height", consumes: 1 },
    { name: "crop", consumes: 1 },
  ],
  ImageScaleBy: [
    { name: "upscale_method", consumes: 1 },
    { name: "scale_by", consumes: 1 },
  ],
  ImageInvert: [],
  ImageBatch: [],
  ImageCompositeMasked: [
    { name: "x", consumes: 1 },
    { name: "y", consumes: 1 },
    { name: "resize_source", consumes: 1 },
  ],
  LatentUpscale: [
    { name: "upscale_method", consumes: 1 },
    { name: "width", consumes: 1 },
    { name: "height", consumes: 1 },
    { name: "crop", consumes: 1 },
  ],
  LatentUpscaleBy: [
    { name: "upscale_method", consumes: 1 },
    { name: "scale_by", consumes: 1 },
  ],
  LatentComposite: [
    { name: "x", consumes: 1 },
    { name: "y", consumes: 1 },
    { name: "feather", consumes: 1 },
  ],
  LatentBlend: [{ name: "blend_factor", consumes: 1 }],
  ConditioningCombine: [],
  ConditioningAverage: [{ name: "conditioning_to_strength", consumes: 1 }],
  ConditioningSetArea: [
    { name: "width", consumes: 1 },
    { name: "height", consumes: 1 },
    { name: "x", consumes: 1 },
    { name: "y", consumes: 1 },
    { name: "strength", consumes: 1 },
  ],
  ConditioningSetAreaPercentage: [
    { name: "width", consumes: 1 },
    { name: "height", consumes: 1 },
    { name: "x", consumes: 1 },
    { name: "y", consumes: 1 },
    { name: "strength", consumes: 1 },
  ],
  ConditioningSetAreaStrength: [{ name: "strength", consumes: 1 }],
  ConditioningMaskCombine: [],
  ConditioningSetMask: [
    { name: "strength", consumes: 1 },
    { name: "set_cond_area", consumes: 1 },
  ],
  VideoLinearCFGGuidance: [{ name: "min_cfg", consumes: 1 }],
  HypernetworkLoader: [
    { name: "hypernetwork_name", consumes: 1 },
    { name: "strength", consumes: 1 },
  ],
  SetLatentNoiseMask: [],
  RebatchLatents: [{ name: "batch_size", consumes: 1 }],
  RebatchImages: [{ name: "batch_size", consumes: 1 }],
  ImageScaleToTotalPixels: [
    { name: "upscale_method", consumes: 1 },
    { name: "megapixels", consumes: 1 },
  ],
  CLIPTextEncodeSDXL: [
    { name: "text", consumes: 1 },
  ],
  CLIPTextEncodeSDXLRefiner: [
    { name: "text", consumes: 1 },
  ],
  StyleModelLoader: [{ name: "style_model_name", consumes: 1 }],
  UpscaleModelLoader: [{ name: "model_name", consumes: 1 }],
  UpscaleImage: [],
  UNetSelfAttentionMultiply: [{ name: "multiply", consumes: 1 }],
  UNetCrossAttentionMultiply: [{ name: "multiply", consumes: 1 }],
  UNetTemporalAttentionMultiply: [{ name: "multiply", consumes: 1 },
    { name: "start_sigma", consumes: 1 },
    { name: "end_sigma", consumes: 1 },
  ],
  VAEDecodeTiled: [{ name: "tile_size", consumes: 1 }],
  VAEEncodeTiled: [{ name: "tile_size", consumes: 1 }],
};

export function convertWorkflowToApi(data: unknown): ApiFormat {
  const wf = data as WorkflowFormat;

  if (!Array.isArray(wf.nodes) || !Array.isArray(wf.links)) {
    throw new Error("Invalid workflow format: missing nodes or links array");
  }

  const linkMap = new Map<number, { sourceNodeId: string; sourceOutputSlot: number }>();
  for (const link of wf.links) {
    linkMap.set(link[0], { sourceNodeId: String(link[1]), sourceOutputSlot: link[2] });
  }

  const result: ApiFormat = {};

  for (const node of wf.nodes) {
    const nodeId = String(node.id);
    const inputs: Record<string, unknown> = {};

    if (node.widgets_values && node.widgets_values.length > 0) {
      const def = NODE_DEFS[node.type];
      let idx = 0;

      if (def) {
        for (const spec of def) {
          if (idx >= node.widgets_values.length) break;
          inputs[spec.name] = node.widgets_values[idx];
          idx += spec.consumes;
        }
        while (idx < node.widgets_values.length) {
          inputs[`extra_${idx}`] = node.widgets_values[idx];
          idx++;
        }
      } else {
        for (let i = 0; i < node.widgets_values.length; i++) {
          inputs[`param_${i}`] = node.widgets_values[i];
        }
      }
    }

    if (node.inputs) {
      for (const input of node.inputs) {
        if (input.link != null) {
          const link = linkMap.get(input.link);
          if (link) {
            inputs[input.name] = [link.sourceNodeId, link.sourceOutputSlot];
          }
        }
      }
    }

    result[nodeId] = {
      inputs,
      class_type: node.type,
      _meta: { title: node.title || node.type },
    };
  }

  return result;
}
