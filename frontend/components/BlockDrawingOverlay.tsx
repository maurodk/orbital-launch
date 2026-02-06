// components/BlockDrawingOverlay.tsx
import { useState, useCallback, useEffect, useRef } from "react";

interface Point {
  x: number;
  y: number;
}

interface Rectangle {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

interface BlockMapping {
  id?: string;
  nome_bloco: string;
  x: number;
  y: number;
  width: number;
  height: number;
  implantacao_ref?: string;
}

interface PastedRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  blockName: string;
}

interface BlockDrawingOverlayProps {
  selectedBlock: string;
  onRectangleComplete: (rect: Rectangle) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  existingMappings?: BlockMapping[];
  availableBlocks?: string[];
  onPasteMapping?: (blockName: string, rect: Rectangle) => void;
}

export function BlockDrawingOverlay({
  selectedBlock,
  onRectangleComplete,
  existingMappings = [],
  onPasteMapping,
}: BlockDrawingOverlayProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [copiedRect, setCopiedRect] = useState<{ width: number; height: number } | null>(null);
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null);
  const [pastedRects, setPastedRects] = useState<PastedRect[]>([]);
  const [draggingPastedId, setDraggingPastedId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point | null>(null);
  const [showBlockSelector, setShowBlockSelector] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const getRelativePosition = useCallback(
    (clientX: number, clientY: number): Point | null => {
      if (!overlayRef.current) return null;

      const rect = overlayRef.current.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;

      return { x, y };
    },
    []
  );

  // Keyboard shortcut: CTRL+C to copy selected block rectangle, CTRL+V to paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "c" && selectedMappingId) {
        e.preventDefault();
        const mapping = existingMappings.find(m => m.id === selectedMappingId);
        if (mapping) {
          setCopiedRect({ width: mapping.width, height: mapping.height });
        }
      }

      if (e.ctrlKey && e.key === "v" && copiedRect) {
        e.preventDefault();
        const newId = `pasted-${Date.now()}`;
        setPastedRects((prev) => [
          ...prev,
          {
            id: newId,
            x: 50 - copiedRect.width / 2,
            y: 50 - copiedRect.height / 2,
            width: copiedRect.width,
            height: copiedRect.height,
            blockName: "",
          },
        ]);
      }

      if (e.key === "Escape") {
        setSelectedMappingId(null);
        setShowBlockSelector(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedMappingId, copiedRect, existingMappings]);

  // Drawing handlers (only active when a block is selected for new mapping)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest(".block-pasted-rect, .block-selectable-overlay")) {
        return;
      }

      if (!selectedBlock) return;

      const point = getRelativePosition(e.clientX, e.clientY);
      if (!point) return;

      setIsDrawing(true);
      setStartPoint(point);
      setCurrentPoint(point);
    },
    [selectedBlock, getRelativePosition]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingPastedId && dragOffset) {
        const point = getRelativePosition(e.clientX, e.clientY);
        if (!point) return;

        setPastedRects((prev) =>
          prev.map((r) =>
            r.id === draggingPastedId
              ? { ...r, x: point.x - dragOffset.x, y: point.y - dragOffset.y }
              : r
          )
        );
        return;
      }

      if (!isDrawing || !startPoint) return;

      const point = getRelativePosition(e.clientX, e.clientY);
      if (!point) return;

      setCurrentPoint(point);
    },
    [isDrawing, startPoint, getRelativePosition, draggingPastedId, dragOffset]
  );

  const handleMouseUp = useCallback(() => {
    if (draggingPastedId) {
      setDraggingPastedId(null);
      setDragOffset(null);
      return;
    }

    if (!isDrawing || !startPoint || !currentPoint) return;

    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);
    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);

    if (width > 1 && height > 1) {
      onRectangleComplete({ startX: x, startY: y, width, height });
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  }, [isDrawing, startPoint, currentPoint, onRectangleComplete, draggingPastedId]);

  const handleMappingClick = (e: React.MouseEvent, mappingId: string) => {
    e.stopPropagation();
    setSelectedMappingId((prev) => (prev === mappingId ? null : mappingId));
  };

  const handlePastedMouseDown = (e: React.MouseEvent, pastedId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const point = getRelativePosition(e.clientX, e.clientY);
    if (!point) return;

    const rect = pastedRects.find((r) => r.id === pastedId);
    if (!rect) return;

    setDraggingPastedId(pastedId);
    setDragOffset({ x: point.x - rect.x, y: point.y - rect.y });
  };

  const handlePastedClick = (e: React.MouseEvent, pastedId: string) => {
    e.stopPropagation();
    if (draggingPastedId) return;
    setShowBlockSelector((prev) => (prev === pastedId ? null : pastedId));
  };

  const handleAssignBlock = (pastedId: string, blockName: string) => {
    const rect = pastedRects.find((r) => r.id === pastedId);
    if (!rect || !onPasteMapping) return;

    onPasteMapping(blockName, {
      startX: rect.x,
      startY: rect.y,
      width: rect.width,
      height: rect.height,
    });

    setPastedRects((prev) => prev.filter((r) => r.id !== pastedId));
    setShowBlockSelector(null);
  };

  const handleRemovePasted = (e: React.MouseEvent, pastedId: string) => {
    e.stopPropagation();
    setPastedRects((prev) => prev.filter((r) => r.id !== pastedId));
    setShowBlockSelector(null);
  };

  const rectangle =
    startPoint && currentPoint
      ? {
          left: Math.min(startPoint.x, currentPoint.x),
          top: Math.min(startPoint.y, currentPoint.y),
          width: Math.abs(currentPoint.x - startPoint.x),
          height: Math.abs(currentPoint.y - startPoint.y),
        }
      : null;

  return (
    <div
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        cursor: selectedBlock ? "crosshair" : "default",
        zIndex: 1000,
      }}
    >
      {/* Drawing preview rectangle */}
      {rectangle && (
        <div
          style={{
            position: "absolute",
            left: `${rectangle.left}%`,
            top: `${rectangle.top}%`,
            width: `${rectangle.width}%`,
            height: `${rectangle.height}%`,
            border: "3px dashed #3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            pointerEvents: "none",
            boxSizing: "border-box",
            borderRadius: "4px",
          }}
        />
      )}

      {/* Clickable overlays on existing mappings for selection/copy */}
      {existingMappings.map((mapping) => (
        <div
          key={`selectable-${mapping.id || mapping.nome_bloco}`}
          className={`block-selectable-overlay block-mapping-outline ${selectedMappingId === mapping.id ? "selected" : ""} ${copiedRect && selectedMappingId === mapping.id ? "copied" : ""}`}
          style={{
            left: `${mapping.x}%`,
            top: `${mapping.y}%`,
            width: `${mapping.width}%`,
            height: `${mapping.height}%`,
            zIndex: 1001,
          }}
          onClick={(e) => handleMappingClick(e, mapping.id || mapping.nome_bloco)}
          title={`${mapping.nome_bloco}${selectedMappingId === mapping.id ? " — Ctrl+C para copiar" : ""}`}
        >
          <span className="block-mapping-label">
            {mapping.nome_bloco}
            {selectedMappingId === mapping.id && " ✓"}
          </span>
        </div>
      ))}

      {/* Pasted rectangles that can be dragged and assigned */}
      {pastedRects.map((rect) => (
        <div
          key={rect.id}
          className="block-pasted-rect block-mapping-outline pasted"
          style={{
            left: `${rect.x}%`,
            top: `${rect.y}%`,
            width: `${rect.width}%`,
            height: `${rect.height}%`,
            zIndex: 1002,
          }}
          onMouseDown={(e) => handlePastedMouseDown(e, rect.id)}
          onClick={(e) => handlePastedClick(e, rect.id)}
        >
          <span className="block-mapping-label">
            {rect.blockName || "Clique para definir"}
          </span>
          <button
            onClick={(e) => handleRemovePasted(e, rect.id)}
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              background: "rgba(239, 68, 68, 0.85)",
              color: "white",
              border: "none",
              borderRadius: "50%",
              width: "18px",
              height: "18px",
              fontSize: "11px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              padding: 0,
              zIndex: 1003,
            }}
            title="Remover"
          >
            ✕
          </button>

          {/* Block name input dropdown */}
          {showBlockSelector === rect.id && (
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: "100%",
                left: "0",
                marginTop: "4px",
                background: "#1e1e1e",
                border: "1px solid #444",
                borderRadius: "8px",
                padding: "10px",
                minWidth: "180px",
                zIndex: 1010,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}
            >
              <p
                style={{
                  margin: "0 0 6px 0",
                  fontSize: "11px",
                  color: "#9ca3af",
                  fontWeight: 600,
                }}
              >
                Nome do bloco:
              </p>
              <input
                type="text"
                autoFocus
                placeholder="Digite o nome do bloco..."
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  border: "1px solid #555",
                  borderRadius: "4px",
                  background: "#2a2a2a",
                  color: "#eaeaea",
                  fontSize: "13px",
                  boxSizing: "border-box",
                  marginBottom: "6px",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) handleAssignBlock(rect.id, val);
                  }
                  if (e.key === "Escape") {
                    setShowBlockSelector(null);
                  }
                }}
              />
              <button
                onClick={() => setShowBlockSelector(null)}
                style={{
                  width: "100%",
                  padding: "4px",
                  background: "transparent",
                  border: "1px solid #555",
                  borderRadius: "4px",
                  color: "#9ca3af",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Status indicators at top */}
      {!isDrawing && (
        <div
          style={{
            position: "absolute",
            top: "12px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "8px",
            alignItems: "center",
            zIndex: 1001,
            pointerEvents: "none",
          }}
        >
          {selectedBlock && (
            <div
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.92)",
                color: "white",
                padding: "8px 18px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                boxShadow: "0 4px 6px rgba(0, 0, 0, 0.15)",
              }}
            >
              🎯 Desenhe o retângulo para "{selectedBlock}"
            </div>
          )}
          {copiedRect && (
            <div
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.92)",
                color: "white",
                padding: "8px 18px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                boxShadow: "0 4px 6px rgba(0, 0, 0, 0.15)",
              }}
            >
              📋 Copiado — Ctrl+V para colar
            </div>
          )}
          {!selectedBlock && !copiedRect && existingMappings.length > 0 && (
            <div
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                color: "#d1d5db",
                padding: "8px 18px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "500",
                boxShadow: "0 4px 6px rgba(0, 0, 0, 0.15)",
              }}
            >
              Clique em um retângulo → Ctrl+C para copiar → Ctrl+V para colar
            </div>
          )}
        </div>
      )}
    </div>
  );
}
