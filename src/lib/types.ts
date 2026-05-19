export interface ApiNode {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: { title: string };
}

export type ApiFormat = Record<string, ApiNode>;

export interface NodeField {
  nodeId: string;
  fieldName: string;
  fieldLabel: string;
  value: unknown;
  isLink: boolean;
  selected: boolean;
  varName: string;
}

export interface NodeGroup {
  nodeId: string;
  title: string;
  classType: string;
  fields: NodeField[];
}
