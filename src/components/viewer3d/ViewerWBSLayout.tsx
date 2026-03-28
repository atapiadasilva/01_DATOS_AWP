'use client';

import React, { useCallback, useRef, useState } from 'react';
import APSViewer from './APSViewer';
import WBSGanttPanel from './WBSGanttPanel';
import { GripHorizontal } from 'lucide-react';

export default function ViewerWBSLayout() {
  const [viewerPct,    setViewerPct]    = useState(55);
  const [wbsMinimized, setWbsMinimized] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging     = useRef(false);

  const [viewerSelection,      setViewerSelection]      = useState<string[]>([]);
  const [highlightExternalIds, setHighlightExternalIds] = useState<string[] | undefined>(undefined);
  const [modelUrn,             setModelUrn]             = useState('');

  // ── Resize drag ────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (mv: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct  = Math.round(((mv.clientY - rect.top) / rect.height) * 100);
      setViewerPct(Math.min(85, Math.max(20, pct)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',  onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  };

  const handleHighlight = useCallback((ids: string[]) => {
    setHighlightExternalIds(ids.length ? [...ids] : undefined);
  }, []);

  return (
    <div ref={containerRef}
      className="flex flex-col w-full flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-slate-900">

      {/* ── 3D Viewer ───────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 overflow-hidden"
        style={{ height: wbsMinimized ? 'calc(100% - 36px)' : `${viewerPct}%` }}
      >
        <APSViewer
          onSelectionChange={setViewerSelection}
          onModelUrnReady={setModelUrn}
          highlightExternalIds={highlightExternalIds}
        />
      </div>

      {/* ── Resize handle (hidden when WBS minimized) ───────────────────────── */}
      {!wbsMinimized && (
        <div
          onMouseDown={onMouseDown}
          className="shrink-0 h-2 bg-slate-700 hover:bg-blue-600 cursor-row-resize
            flex items-center justify-center transition-colors group"
          title="Arrastrar para redimensionar"
        >
          <GripHorizontal className="w-8 h-2 text-slate-500 group-hover:text-white transition-colors" />
        </div>
      )}

      {/* ── WBS / Gantt panel ───────────────────────────────────────────────── */}
      <div className={`flex flex-col overflow-hidden bg-white min-h-0 ${wbsMinimized ? '' : 'flex-1'}`}
        style={wbsMinimized ? { height: 36 } : undefined}>
        <WBSGanttPanel
          modelUrn={modelUrn}
          viewerSelection={viewerSelection}
          onHighlightElements={handleHighlight}
          minimized={wbsMinimized}
          onToggleMinimize={() => setWbsMinimized(p => !p)}
        />
      </div>
    </div>
  );
}
