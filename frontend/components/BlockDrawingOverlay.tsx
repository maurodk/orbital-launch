// components/BlockDrawingOverlay.tsx
import { useState, useCallback } from "react";

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

interface BlockDrawingOverlayProps {
  selectedBlock: string;
  onRectangleComplete: (rect: Rectangle) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function BlockDrawingOverlay({
  selectedBlock,
  onRectangleComplete,
  containerRef,
}: BlockDrawingOverlayProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);

  const getRelativePosition = useCallback(
    (clientX: number, clientY: number): Point | null => {
      if (!containerRef.current) return null;
      
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      
      return { x, y };
    },
    [containerRef]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
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
      if (!isDrawing || !startPoint) return;
      
      const point = getRelativePosition(e.clientX, e.clientY);
      if (!point) return;
      
      setCurrentPoint(point);
    },
    [isDrawing, startPoint, getRelativePosition]
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !startPoint || !currentPoint) return;
    
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);
    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);
    
    // Só salva se o retângulo tiver tamanho mínimo
    if (width > 1 && height > 1) {
      onRectangleComplete({ startX: x, startY: y, width, height });
    }
    
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  }, [isDrawing, startPoint, currentPoint, onRectangleComplete]);

  const rectangle = startPoint && currentPoint ? {
    left: Math.min(startPoint.x, currentPoint.x),
    top: Math.min(startPoint.y, currentPoint.y),
    width: Math.abs(currentPoint.x - startPoint.x),
    height: Math.abs(currentPoint.y - startPoint.y),
  } : null;

  if (!selectedBlock) return null;

  return (
    <div
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
        cursor: "crosshair",
        zIndex: 1000,
      }}
    >
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
          }}
        />
      )}
      
      {selectedBlock && !isDrawing && (
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(59, 130, 246, 0.95)",
            color: "white",
            padding: "12px 24px",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "600",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            pointerEvents: "none",
            zIndex: 1001,
          }}
        >
          🎯 Clique e arraste para mapear o bloco "{selectedBlock}"
        </div>
      )}
    </div>
  );
}
