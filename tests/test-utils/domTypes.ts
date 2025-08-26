import { NodeType } from '../../src/dom/views';

export interface DOMNode {
  nodeId: number;
  nodeType: NodeType;
  nodeName: string;
  nodeValue: string;
  attributes: string[];
  contentDocument?: DOMNode;
  frameId?: string;
}