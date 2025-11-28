// frontend/components/PixOptionsModal.tsx

import "./PixOptionsModal.css";

interface PixOptionsModalProps {
  show: boolean;
  onClose: () => void;
  onSelectOption: (option: "pending" | "new" | "history") => void;
  hasPendingPix: boolean;
  unitName: string;
}

export function PixOptionsModal({
  show,
  onClose,
  onSelectOption,
  hasPendingPix,
  unitName,
}: PixOptionsModalProps) {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content pix-options-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-button" onClick={onClose}>
          &times;
        </button>
        <h2>Gerenciar PIX - Unidade {unitName}</h2>
        <p className="pix-options-subtitle">Escolha uma opção:</p>

        <div className="pix-options-buttons">
          {hasPendingPix && (
            <button
              className="pix-option-button pending"
              onClick={() => onSelectOption("pending")}
            >
              <div className="option-icon">📱</div>
              <div className="option-text">
                <strong>PIX GERADO</strong>
                <span>Ver QR Code pendente</span>
              </div>
            </button>
          )}

          <button
            className="pix-option-button new"
            onClick={() => onSelectOption("new")}
          >
            <div className="option-icon">➕</div>
            <div className="option-text">
              <strong>GERAR NOVO QRCODE</strong>
              <span>Criar novo PIX</span>
            </div>
          </button>

          <button
            className="pix-option-button history"
            onClick={() => onSelectOption("history")}
          >
            <div className="option-icon">📋</div>
            <div className="option-text">
              <strong>HISTÓRICO PIX</strong>
              <span>Ver todos os PIX desta unidade</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
