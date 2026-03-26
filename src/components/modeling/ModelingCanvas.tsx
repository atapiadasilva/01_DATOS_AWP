'use client';

import React, { useCallback } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  Connection, 
  Edge, 
  Node,
  NodeDragHandler,
  useNodesState,
  useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';
import EntityNode from './EntityNode';
import DeletableEdge from './DeletableEdge';

const nodeTypes = {
  entityNode: EntityNode,
};

const edgeTypes = {
  deletableEdge: DeletableEdge,
};

interface ModelingCanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onSaveRelationship: (connection: Connection) => Promise<void>;
  onDeleteRelationship: (edgeId: string) => Promise<void>;
  onSaveNodePosition?: (nodeId: string, x: number, y: number) => Promise<void>;
}

export default function ModelingCanvas({ 
  initialNodes, 
  initialEdges, 
  onSaveRelationship,
  onDeleteRelationship,
  onSaveNodePosition
}: ModelingCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  React.useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const onConnect = useCallback(
    async (params: Connection) => {
      await onSaveRelationship(params);
    },
    [onSaveRelationship]
  );

  const onEdgesDelete = useCallback(
    async (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        await onDeleteRelationship(edge.id);
      }
    },
    [onDeleteRelationship]
  );

  // Persistir posición del nodo al soltarlo (H3 de auditoría)
  const onNodeDragStop: NodeDragHandler = useCallback(
    async (_, node) => {
      if (onSaveNodePosition) {
        await onSaveNodePosition(node.id, node.position.x, node.position.y);
      }
    },
    [onSaveNodePosition]
  );

  return (
    <div className="w-full h-[80vh] border border-slate-200 rounded-xl overflow-hidden bg-slate-50 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
      >
        <Background color="#cbd5e1" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
