// components/BlockMappingTool.tsx
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../src/supabaseClient";
import "./BlockMappingOverlay.css";

export interface BlockMapping {
  id?: string;
  nome_bloco: string;
  x: number;
  y: number;
  width: number;
  height: number;
  implantacao_ref?: string;
}

interface BlockMappingToolProps {
  isActive: boolean;
  onToggle: (active: boolean) => void;
  implantacaoId: string;
  implantacaoName: string;
  availableBlocks: string[];
  activeLayer?: "primary" | "additional";
  onMappingsChange: (mappings: BlockMapping[]) => void;
  onSelectedBlockChange?: (block: string) => void;
  currentMappings?: BlockMapping[];
}

export function BlockMappingTool({
  isActive,
  onToggle,
  implantacaoId,
  implantacaoName,
  availableBlocks,
  activeLayer = "primary",
  onMappingsChange,
  onSelectedBlockChange,
  currentMappings = [],
}: BlockMappingToolProps) {
  const [selectedBlock, setSelectedBlock] = useState<string>("");

  // Usar currentMappings do parent em vez de estado local
  const existingMappings = currentMappings;

  const currentLayerRef = activeLayer === "additional"
    ? `${implantacaoName}+adicional`
    : implantacaoName;

  const loadExistingMappings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("blocos_mapping")
        .select("*")
        .eq("implantacao_id", implantacaoId)
        .eq("implantacao_ref", currentLayerRef);

      if (error) throw error;
      onMappingsChange(data || []);
    } catch (error) {
      console.error("Erro ao carregar mapeamentos de blocos:", error);
    }
  }, [implantacaoId, currentLayerRef, onMappingsChange]);

  useEffect(() => {
    if (isActive) {
      loadExistingMappings();
    }
  }, [isActive, loadExistingMappings]);

  /* Função para salvar mapeamento (será usada quando implementar funcionalidade de desenho interativo)
  const handleSaveMapping = async (mapping: BlockMapping) => {
    try {
      const { error } = await supabase
        .from("blocos_mapping")
        .upsert({
          implantacao_id: implantacaoId,
          nome_bloco: mapping.nome_bloco,
          x: mapping.x,
          y: mapping.y,
          width: mapping.width,
          height: mapping.height,
          implantacao_ref: currentLayerRef,
        })
        .select()
        .single();

      if (error) throw error;

      await loadExistingMappings();
      alert(`Mapeamento do bloco "${mapping.nome_bloco}" salvo com sucesso!`);
    } catch (error) {
      console.error("Erro ao salvar mapeamento:", error);
      alert("Erro ao salvar mapeamento. Tente novamente.");
    }
  };
  */

  useEffect(() => {
    if (onSelectedBlockChange) {
      onSelectedBlockChange(selectedBlock);
    }
  }, [selectedBlock, onSelectedBlockChange]);

  const handleDeleteMapping = async (mappingId: string) => {
    if (!confirm("Deseja remover este mapeamento?")) return;

    try {
      const { error } = await supabase
        .from("blocos_mapping")
        .delete()
        .eq("id", mappingId);

      if (error) throw error;

      await loadExistingMappings();
    } catch (error) {
      console.error("Erro ao deletar mapeamento:", error);
      alert("Erro ao deletar mapeamento. Tente novamente.");
    }
  };

  if (!isActive) return null;

  // Filtrar blocos que já foram mapeados
  const unmappedBlocks = availableBlocks.filter(
    block => !existingMappings.some(mapping => mapping.nome_bloco === block)
  );

  const mappedBlocks = availableBlocks.filter(
    block => existingMappings.some(mapping => mapping.nome_bloco === block)
  );

  return (
    <aside className="mapping-sidebar block-mapping-sidebar">
      <h3 className="sidebar-title">🎯 Mapear Blocos</h3>

      <div className="sidebar-controls">
        <div className="form-group">
          <label htmlFor="block-select">Selecione o bloco para mapear</label>
          <select
            id="block-select"
            value={selectedBlock}
            onChange={(e) => setSelectedBlock(e.target.value)}
            className="sidebar-input"
          >
            <option value="">Escolha um bloco...</option>
            {unmappedBlocks.map((block) => (
              <option key={block} value={block}>
                {block}
              </option>
            ))}
          </select>
        </div>

        {unmappedBlocks.length === 0 && (
          <p className="block-all-mapped-msg">
            ✅ Todos os blocos já foram mapeados!
          </p>
        )}

        {selectedBlock && (
          <div className="block-instructions">
            <p className="block-instructions-title">📐 Instruções:</p>
            <ol className="block-instructions-list">
              <li>Clique e arraste no mapa para desenhar um retângulo</li>
              <li>O mapeamento salva automaticamente ao soltar</li>
              <li>Use <kbd>Ctrl+C</kbd> para copiar um retângulo existente</li>
              <li>Use <kbd>Ctrl+V</kbd> para colar e reposicionar</li>
            </ol>
          </div>
        )}
      </div>

      <div className="unit-groups-container">
        {/* Blocos não mapeados */}
        {unmappedBlocks.length > 0 && (
          <div className="unit-group">
            <div className="group-header" style={{ cursor: "default" }}>
              <div className="group-header-title">
                <strong>Não Mapeados</strong>
                <span>{unmappedBlocks.length} BLOCOS</span>
              </div>
            </div>
            <div className="group-content">
              {unmappedBlocks.map((block) => (
                <div
                  key={block}
                  className={`unit-item ${selectedBlock === block ? "selected" : ""}`}
                  onClick={() => setSelectedBlock(block)}
                  style={{ cursor: "pointer" }}
                >
                  <span className="unit-status" style={{ background: "#6b7280" }} />
                  <span className="unit-name">{block}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blocos mapeados */}
        {mappedBlocks.length > 0 && (
          <div className="unit-group">
            <div className="group-header" style={{ cursor: "default" }}>
              <div className="group-header-title">
                <strong>Mapeados</strong>
                <span>{mappedBlocks.length} BLOCOS</span>
              </div>
            </div>
            <div className="group-content">
              {mappedBlocks.map((block) => {
                const mapping = existingMappings.find(m => m.nome_bloco === block);
                return (
                  <div key={block} className="unit-item" data-mapped="true">
                    <span className="unit-status" style={{ background: "var(--accent-green, #6ad700)" }} />
                    <span className="unit-name">{block}</span>
                    <button
                      className="select-unit-button block-remove-btn"
                      onClick={() => mapping?.id && handleDeleteMapping(mapping.id)}
                      title="Remover mapeamento"
                      style={{ color: "#ef4444" }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <button
        className="block-exit-btn"
        onClick={() => {
          setSelectedBlock("");
          onToggle(false);
        }}
      >
        Sair do Modo Mapeamento
      </button>
    </aside>
  );
}
