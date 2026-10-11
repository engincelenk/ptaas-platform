'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ReactFlow, type Node, type Edge, Background, Controls, MiniMap,
  BackgroundVariant, useNodesState, useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';

interface Asset {
  id: string;
  value: string;
  type: string;
  status: string;
  httpStatus: number | null;
  technologies: string[];
  dnsIssues: string[];
  ipAddresses: string[];
}

const STATUS_COLOR: Record<string, string> = {
  SUGGESTED: '#3B82F6',
  ACTIVE: '#22C55E',
  OFFLINE: '#EF4444',
  IGNORED: '#9CA3AF',
};

function buildGraph(rootDomain: string, assets: Asset[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Root node
  nodes.push({
    id: 'root',
    type: 'default',
    position: { x: 400, y: 50 },
    data: { label: rootDomain },
    style: {
      background: '#0F172A',
      color: '#FFFFFF',
      border: '2px solid #3B82F6',
      borderRadius: 8,
      fontWeight: 'bold',
      fontSize: 13,
      padding: '8px 16px',
    },
  });

  // Subdomain nodes in a circle around root
  const subdomains = assets.filter((a) => a.type === 'SUBDOMAIN');
  const ips = assets.filter((a) => a.type === 'IP');
  const total = subdomains.length;
  const radius = Math.max(200, total * 40);

  subdomains.forEach((asset, i) => {
    const angle = (2 * Math.PI * i) / total - Math.PI / 2;
    const x = 400 + radius * Math.cos(angle);
    const y = 250 + radius * 0.6 * Math.sin(angle);
    const hasDnsIssues = asset.dnsIssues.length > 0;
    const color = STATUS_COLOR[asset.status] ?? '#6B7280';

    nodes.push({
      id: asset.id,
      type: 'default',
      position: { x, y },
      data: {
        label: (
          <div className="text-center">
            <div className="font-mono text-xs truncate max-w-[140px]">{asset.value}</div>
            {asset.httpStatus && (
              <div className={`text-xs mt-0.5 ${asset.httpStatus < 400 ? 'text-green-400' : 'text-red-400'}`}>
                HTTP {asset.httpStatus}
              </div>
            )}
            {hasDnsIssues && <div className="text-xs text-yellow-400">⚠ DNS issues</div>}
          </div>
        ),
      },
      style: {
        background: '#1E293B',
        color: '#F1F5F9',
        border: `2px solid ${hasDnsIssues ? '#EAB308' : color}`,
        borderRadius: 6,
        fontSize: 11,
        minWidth: 140,
        padding: '6px 10px',
      },
    });

    edges.push({
      id: `root-${asset.id}`,
      source: 'root',
      target: asset.id,
      style: { stroke: '#334155', strokeWidth: 1.5 },
      animated: asset.status === 'SUGGESTED',
    });

    // IP nodes for each asset
    asset.ipAddresses.slice(0, 2).forEach((ip, j) => {
      const ipId = `ip-${asset.id}-${j}`;
      nodes.push({
        id: ipId,
        type: 'default',
        position: { x: x + (j === 0 ? -60 : 60), y: y + 80 },
        data: { label: ip },
        style: {
          background: '#0F172A',
          color: '#94A3B8',
          border: '1px solid #334155',
          borderRadius: 4,
          fontSize: 10,
          padding: '4px 8px',
        },
      });
      edges.push({
        id: `${asset.id}-${ipId}`,
        source: asset.id,
        target: ipId,
        style: { stroke: '#1E293B', strokeWidth: 1 },
      });
    });
  });

  return { nodes, edges };
}

export default function AssetGraphPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    apiClient
      .get<Asset[]>(`/projects/${projectId}/asm/assets`)
      .then((data) => {
        setAssets(data);
        // Derive root domain from first asset's rootDomain field — fallback to project
        const rootDomain = data[0]
          ? data[0].value.split('.').slice(-2).join('.')
          : 'root';
        const { nodes: n, edges: e } = buildGraph(rootDomain, data);
        setNodes(n);
        setEdges(e);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const asset = assets.find((a) => a.id === node.id);
      setSelectedAsset(asset ?? null);
    },
    [assets],
  );

  if (loading) {
    return (
      <div className="h-[600px] flex items-center justify-center text-muted-foreground">
        Loading asset graph…
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="h-[600px] flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No assets discovered yet.</p>
        <Link
          href={`/projects/${projectId}/assets`}
          className="text-sm underline hover:text-foreground"
        >
          Start Discovery →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/projects/${projectId}/assets`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Asset List
          </Link>
          <h1 className="text-xl font-semibold mt-1">Asset Graph</h1>
        </div>
        <div className="text-sm text-muted-foreground">{assets.length} assets</div>
      </div>

      <div className="relative h-[600px] rounded-xl border overflow-hidden bg-slate-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} color="#1E293B" gap={24} />
          <Controls className="bg-slate-900 border-slate-700" />
          <MiniMap
            nodeColor={(n) => (n.style as any)?.border?.split(' ')[2] ?? '#334155'}
            maskColor="rgba(15,23,42,0.8)"
            className="bg-slate-900 border-slate-700"
          />
        </ReactFlow>

        {/* Detail panel */}
        {selectedAsset && (
          <div className="absolute top-4 right-4 w-72 rounded-xl border bg-slate-900/95 p-4 shadow-xl text-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-blue-400 truncate">{selectedAsset.value}</span>
              <button onClick={() => setSelectedAsset(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">{selectedAsset.status}</Badge>
              {selectedAsset.httpStatus && (
                <Badge variant={selectedAsset.httpStatus < 400 ? 'secondary' : 'destructive'}>
                  HTTP {selectedAsset.httpStatus}
                </Badge>
              )}
            </div>
            {selectedAsset.technologies.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Technologies</p>
                <div className="flex flex-wrap gap-1">
                  {selectedAsset.technologies.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                  ))}
                </div>
              </div>
            )}
            {selectedAsset.dnsIssues.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">DNS Issues</p>
                <div className="flex flex-wrap gap-1">
                  {selectedAsset.dnsIssues.map((issue) => (
                    <Badge key={issue} variant="destructive" className="text-xs">{issue}</Badge>
                  ))}
                </div>
              </div>
            )}
            {selectedAsset.ipAddresses.length > 0 && (
              <p className="text-xs text-muted-foreground">
                IPs: {selectedAsset.ipAddresses.join(', ')}
              </p>
            )}
            <Link
              href={`/projects/${projectId}/assets`}
              className="block text-xs text-blue-400 hover:underline mt-1"
            >
              Manage this asset →
            </Link>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        {Object.entries(STATUS_COLOR).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
            {status}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-yellow-400" />
          DNS Issues
        </span>
      </div>
    </div>
  );
}
