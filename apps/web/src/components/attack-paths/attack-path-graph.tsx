'use client';

import { useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

interface AttackNode {
  id: string;
  label: string;
  severity: string;
  owasp: string | null;
  cvssScore: number | null;
  priorityScore: number | null;
  position: { x: number; y: number };
}

interface AttackEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

const SEVERITY_BG: Record<string, string> = {
  CRITICAL: '#fef2f2',
  HIGH:     '#fff7ed',
  MEDIUM:   '#fefce8',
  LOW:      '#f0fdf4',
  INFO:     '#f8fafc',
};

const SEVERITY_BORDER: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#eab308',
  LOW:      '#22c55e',
  INFO:     '#94a3b8',
};

function FindingNode({ data }: NodeProps) {
  const bg = SEVERITY_BG[data.severity] ?? '#f8fafc';
  const border = SEVERITY_BORDER[data.severity] ?? '#94a3b8';

  return (
    <div
      style={{
        background: bg,
        border: `2px solid ${border}`,
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 200,
        maxWidth: 240,
        fontSize: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: border }} />
      <div style={{ fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{data.label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ background: border, color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
          {data.severity}
        </span>
        {data.owasp && (
          <span style={{ background: '#e2e8f0', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>
            {data.owasp.split('–')[0]?.trim()}
          </span>
        )}
        {data.cvssScore && (
          <span style={{ background: '#e2e8f0', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>
            CVSS {data.cvssScore}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: border }} />
    </div>
  );
}

const nodeTypes = { finding: FindingNode };

interface Props {
  nodes: AttackNode[];
  edges: AttackEdge[];
}

export function AttackPathGraph({ nodes: rawNodes, edges: rawEdges }: Props) {
  const rfNodes: Node[] = rawNodes.map((n) => ({
    id: n.id,
    type: 'finding',
    position: n.position,
    data: {
      label: n.label,
      severity: n.severity,
      owasp: n.owasp,
      cvssScore: n.cvssScore,
      priorityScore: n.priorityScore,
    },
  }));

  const rfEdges: Edge[] = rawEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    style: { stroke: '#6366f1', strokeWidth: 2 },
    labelStyle: { fontSize: 10, fontWeight: 600, fill: '#6366f1' },
    labelBgStyle: { fill: '#eef2ff', fillOpacity: 0.9 },
    type: 'smoothstep',
  }));

  const [nodes, , onNodesChange] = useNodesState(rfNodes);
  const [edges, , onEdgesChange] = useEdgesState(rfEdges);

  return (
    <div style={{ height: 280, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} />
        <MiniMap nodeColor={(n) => SEVERITY_BORDER[(n.data as any).severity] ?? '#94a3b8'} pannable zoomable />
      </ReactFlow>
    </div>
  );
}
