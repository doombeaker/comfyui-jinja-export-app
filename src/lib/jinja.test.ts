import { describe, it, expect } from "vitest";
import { parseApiFormat, toJinjaDefault, generateJinjaTemplate } from "./jinja";
import type { ApiFormat } from "./types";

describe("toJinjaDefault", () => {
  it("quotes strings", () => {
    expect(toJinjaDefault("hello")).toBe('"hello"');
  });

  it("leaves numbers as-is", () => {
    expect(toJinjaDefault(42)).toBe("42");
    expect(toJinjaDefault(3.14)).toBe("3.14");
  });

  it("leaves booleans as-is", () => {
    expect(toJinjaDefault(true)).toBe("true");
    expect(toJinjaDefault(false)).toBe("false");
  });

  it("handles null", () => {
    expect(toJinjaDefault(null)).toBe("null");
  });
});

describe("parseApiFormat", () => {
  it("parses a simple API format", () => {
    const data: ApiFormat = {
      "3": { inputs: { seed: 42, steps: 20 }, class_type: "KSampler" },
    };
    const groups = parseApiFormat(data);
    expect(groups).toHaveLength(1);
    expect(groups[0].nodeId).toBe("3");
    expect(groups[0].classType).toBe("KSampler");
    expect(groups[0].fields).toHaveLength(2);
    expect(groups[0].fields[0].fieldName).toBe("seed");
    expect(groups[0].fields[0].value).toBe(42);
    expect(groups[0].fields[0].isLink).toBe(false);
    expect(groups[0].fields[0].selected).toBe(false);
    expect(groups[0].fields[0].varName).toBe("seed");
  });

  it("marks link references with isLink=true and undefined value", () => {
    const data: ApiFormat = {
      "3": { inputs: { model: ["4", 0] }, class_type: "KSampler" },
    };
    const groups = parseApiFormat(data);
    const modelField = groups[0].fields.find((f) => f.fieldName === "model")!;
    expect(modelField.isLink).toBe(true);
    expect(modelField.value).toBeUndefined();
  });

  it("uses _meta.title when available", () => {
    const data: ApiFormat = {
      "3": { inputs: { seed: 1 }, class_type: "KSampler", _meta: { title: "K采样器" } },
    };
    expect(parseApiFormat(data)[0].title).toBe("K采样器");
  });

  it("falls back to class_type for title", () => {
    const data: ApiFormat = {
      "3": { inputs: { seed: 1 }, class_type: "KSampler" },
    };
    expect(parseApiFormat(data)[0].title).toBe("KSampler");
  });

  it("sorts nodes numerically by ID", () => {
    const data: ApiFormat = {
      "13": { inputs: { width: 512 }, class_type: "EmptyLatentImage" },
      "3": { inputs: { seed: 1 }, class_type: "KSampler" },
      "7": { inputs: { text: "bad" }, class_type: "CLIPTextEncode" },
    };
    const groups = parseApiFormat(data);
    expect(groups.map((g) => g.nodeId)).toEqual(["3", "7", "13"]);
  });

  it("skips nodes without inputs or class_type", () => {
    const data = {
      "3": { inputs: { seed: 1 }, class_type: "KSampler" },
      "4": { something: "else" },
    } as unknown as ApiFormat;
    const groups = parseApiFormat(data);
    expect(groups).toHaveLength(1);
    expect(groups[0].nodeId).toBe("3");
  });
});

describe("generateJinjaTemplate", () => {
  const baseData: ApiFormat = {
    "3": { inputs: { seed: 42, steps: 20, model: ["4", 0] }, class_type: "KSampler" },
    "6": { inputs: { text: "hello world", clip: ["4", 1] }, class_type: "CLIPTextEncode" },
  };

  it("returns full JSON with no replacements when nothing selected", () => {
    const groups = parseApiFormat(baseData);
    const template = generateJinjaTemplate(baseData, groups);
    expect(template).toContain('"seed": 42');
    expect(template).toContain('"steps": 20');
    expect(template).toContain('"text": "hello world"');
  });

  it("replaces selected string fields with Jinja syntax (quoted default)", () => {
    const groups = parseApiFormat(baseData);
    const textGroup = groups.find((g) => g.nodeId === "6")!;
    const textField = textGroup.fields.find((f) => f.fieldName === "text")!;
    textField.selected = true;

    const template = generateJinjaTemplate(baseData, groups);
    expect(template).toContain('{{ request.text|default("hello world") }}');
  });

  it("replaces selected number fields with Jinja syntax (unquoted default)", () => {
    const groups = parseApiFormat(baseData);
    const ksGroup = groups.find((g) => g.nodeId === "3")!;
    ksGroup.fields.find((f) => f.fieldName === "seed")!.selected = true;

    const template = generateJinjaTemplate(baseData, groups);
    expect(template).toContain("{{ request.seed|default(42) }}");
  });

  it("respects custom varName", () => {
    const groups = parseApiFormat(baseData);
    const ksGroup = groups.find((g) => g.nodeId === "3")!;
    const seedField = ksGroup.fields.find((f) => f.fieldName === "seed")!;
    seedField.selected = true;
    seedField.varName = "random_seed";

    const template = generateJinjaTemplate(baseData, groups);
    expect(template).toContain("{{ request.random_seed|default(42) }}");
  });

  it("replaces link fields when selected (value defaults to undefined)", () => {
    const groups = parseApiFormat(baseData);
    const ksGroup = groups.find((g) => g.nodeId === "3")!;
    const modelField = ksGroup.fields.find((f) => f.fieldName === "model")!;
    modelField.selected = true;

    const template = generateJinjaTemplate(baseData, groups);
    expect(template).toContain("{{ request.model|default(undefined) }}");
  });

  it("produces valid JSON structure with nested objects", () => {
    const groups = parseApiFormat(baseData);
    const template = generateJinjaTemplate(baseData, groups);
    expect(template.startsWith("{")).toBe(true);
    expect(template.endsWith("}")).toBe(true);
    expect(template).toContain('"3"');
    expect(template).toContain('"6"');
    expect(template).toContain('"class_type"');
  });

  it("handles multiple selected fields in the same node", () => {
    const groups = parseApiFormat(baseData);
    const ksGroup = groups.find((g) => g.nodeId === "3")!;
    ksGroup.fields.find((f) => f.fieldName === "seed")!.selected = true;
    ksGroup.fields.find((f) => f.fieldName === "steps")!.selected = true;

    const template = generateJinjaTemplate(baseData, groups);
    expect(template).toContain("{{ request.seed|default(42) }}");
    expect(template).toContain("{{ request.steps|default(20) }}");
  });

  it("handles selected fields across different nodes", () => {
    const groups = parseApiFormat(baseData);
    groups.find((g) => g.nodeId === "3")!.fields.find((f) => f.fieldName === "seed")!.selected = true;
    groups.find((g) => g.nodeId === "6")!.fields.find((f) => f.fieldName === "text")!.selected = true;

    const template = generateJinjaTemplate(baseData, groups);
    expect(template).toContain("{{ request.seed|default(42) }}");
    expect(template).toContain('{{ request.text|default("hello world") }}');
  });
});
