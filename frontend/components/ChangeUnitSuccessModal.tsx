interface ChangeUnitSuccessModalProps {
  show: boolean;
  onClose: () => void;
  changeData: { oldUnitName: string; newUnitName: string } | null;
}

export function ChangeUnitSuccessModal({
  show,
  onClose,
  changeData,
}: ChangeUnitSuccessModalProps) {
  if (!show || !changeData) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content success-modal"
        style={{ textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="success-checkmark">
          <div className="check-icon"></div>
        </div>
        <div className="success-content">
          <h2 className="success-title">Troca Realizada com Sucesso!</h2>
          <div className="success-message">
            <p className="success-unit">
              A reserva foi movida da unidade{" "}
              <span className="unit-highlight">{changeData.oldUnitName}</span>{" "}
              para a unidade{" "}
              <span className="unit-highlight">{changeData.newUnitName}</span>.
            </p>
            <p className="success-subtitle">
              A página será atualizada em breve.
            </p>
          </div>
          <div className="success-actions">
            <button
              className="success-close-button"
              onClick={onClose}
              autoFocus
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
