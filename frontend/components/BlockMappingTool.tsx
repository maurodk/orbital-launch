// components/BlockMappingTool.tsx
import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (isActive) {
      loadExistingMappings();
    }
  }, [isActive, implantacaoId, currentLayerRef]);

  const loadExistingMappings = async () => {
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
  };

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

  return (
    <div className="block-mapping-controls">
      <h3>🎯 Mapear Blocos</h3>
      
      <label>Selecione o bloco:</label>
      <select
        value={selectedBlock}
        onChange={(e) => setSelectedBlock(e.target.value)}
      >
        <option value="">Escolha um bloco...</option>
        {unmappedBlocks.map((block) => (
          <option key={block} value={block}>
            {block}
          </option>
        ))}
      </select>
      
      {unmappedBlocks.length === 0 && (
        <p style={{ marginTop: "10px", fontSize: "13px", color: "#059669", fontWeight: "500" }}>
          ✅ Todos os blocos já foram mapeados!
        </p>
      )}

      {selectedBlock && (
        <div style={{ marginTop: "10px", padding: "10px", background: "#f0f9ff", borderRadius: "6px" }}>
          <p style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#0369a1" }}>
            <strong>Instruções:</strong>
          </p>
          <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#0c4a6e" }}>
            <li>Clique e arraste no mapa para desenhar um retângulo sobre o bloco</li>
            <li>O mapeamento será salvo automaticamente ao soltar o mouse</li>
            <li>Você pode remapear o mesmo bloco quantas vezes quiser</li>
          </ol>
        </div>
      )}

      <button
        className="secondary"
        onClick={() => {
          setSelectedBlock("");
          onToggle(false);
        }}
      >
        Sair do Modo Mapeamento
      </button>

      {existingMappings.length > 0 && (
        <div className="block-mapping-list">
          <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#6b7280" }}>
            Blocos Mapeados:
          </h4>
          {existingMappings.map((mapping) => (
            <div key={mapping.id} className="block-mapping-item">
              <span className="block-mapping-item-name">{mapping.nome_bloco}</span>
              <button onClick={() => mapping.id && handleDeleteMapping(mapping.id)}>
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
