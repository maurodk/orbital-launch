// frontend/components/HamburgerMenu.tsx

import { useState } from "react";

interface HamburgerMenuProps {
  onHistoryClick: () => void;
  onMappingClick: () => void;
  onLogout?: () => void;
}

export function HamburgerMenu({
  onHistoryClick,
  onMappingClick,
  onLogout,
}: HamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleItemClick = (callback: () => void) => {
    callback();
    setIsOpen(false);
  };

  return (
    <div
      style={{ position: "fixed", top: "20px", right: "20px", zIndex: 10000 }}
    >
      {/* Botão Hamburger */}
      <button
        onClick={toggleMenu}
        style={{
          width: "50px",
          height: "50px",
          borderRadius: "50%",
          border: "none",
          backgroundColor: "#007bff",
          color: "white",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "5px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          transition: "all 0.3s ease",
        }}
        aria-label="Menu"
      >
        <span
          style={{
            width: "25px",
            height: "3px",
            backgroundColor: "white",
            borderRadius: "2px",
            transition: "all 0.3s ease",
            transform: isOpen ? "rotate(45deg) translate(5px, 5px)" : "none",
          }}
        />
        <span
          style={{
            width: "25px",
            height: "3px",
            backgroundColor: "white",
            borderRadius: "2px",
            transition: "all 0.3s ease",
            opacity: isOpen ? 0 : 1,
          }}
        />
        <span
          style={{
            width: "25px",
            height: "3px",
            backgroundColor: "white",
            borderRadius: "2px",
            transition: "all 0.3s ease",
            transform: isOpen ? "rotate(-45deg) translate(5px, -5px)" : "none",
          }}
        />
      </button>

      {/* Menu Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "60px",
            right: 0,
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            minWidth: "200px",
            overflow: "hidden",
            animation: "slideDown 0.3s ease",
          }}
        >
          <style>
            {`
              @keyframes slideDown {
                from {
                  opacity: 0;
                  transform: translateY(-10px);
                }
                to {
                  opacity: 1;
                  transform: translateY(0);
                }
              }
            `}
          </style>

          <button
            onClick={() => handleItemClick(onHistoryClick)}
            style={{
              width: "100%",
              padding: "12px 20px",
              border: "none",
              backgroundColor: "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "14px",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f0f0f0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            📊 Histórico
          </button>

          <button
            onClick={() => handleItemClick(onMappingClick)}
            style={{
              width: "100%",
              padding: "12px 20px",
              border: "none",
              backgroundColor: "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "14px",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f0f0f0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            🗺️ Mapeamento
          </button>

          {onLogout && (
            <>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "#e0e0e0",
                  margin: "5px 0",
                }}
              />
              <button
                onClick={() => handleItemClick(onLogout)}
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  border: "none",
                  backgroundColor: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "#dc3545",
                  transition: "background-color 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#fff0f0";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                🚪 Sair
              </button>
            </>
          )}
        </div>
      )}

      {/* Overlay para fechar o menu clicando fora */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "transparent",
            zIndex: -1,
          }}
        />
      )}
    </div>
  );
}
