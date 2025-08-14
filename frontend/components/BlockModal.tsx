// frontend/src/components/BlockModal.tsx

interface BlockModalProps {
  show: boolean;
  onClose: () => void;
  unitData: string[] | null;
  onConfirm: () => void;
  isBlocking: boolean;
}

export function BlockModal({
  show,
  onClose,
  unitData,
  onConfirm,
  isBlocking,
}: BlockModalProps) {
  if (!show || !unitData) return null;

  const unitName = unitData[2] || "N/A";
  const title = isBlocking ? `Bloquear Unidade` : `Desbloquear Unidade`;
  const message = isBlocking
    ? `Tem certeza que deseja bloquear a unidade "${unitName}"? Ela ficará indisponível para reservas.`
    : `Esta unidade está bloqueada. Deseja torná-la "Disponível" para novas reservas?`;
  const buttonText = isBlocking
    ? "Sim, Bloquear Unidade"
    : "Sim, Tornar Disponível";

  // Usando classes condicionais para reutilizar estilos ou aplicar novos
  const confirmButtonClass = isBlocking
    ? "modal-block-button"
    : "modal-reserve-button";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>
          ×
        </button>
        <h2>
          {title}: <strong>{unitName}</strong>
        </h2>
        <p
          style={{ marginTop: "25px", marginBottom: "35px", lineHeight: "1.6" }}
        >
          {message}
        </p>
        <button
          className={confirmButtonClass}
          onClick={onConfirm}
          style={{ width: "100%" }}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}
