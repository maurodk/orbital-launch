// frontend/components/HamburgerMenu.tsx

import { useState } from "react";
import { LogOut } from "lucide-react";

interface HamburgerMenuProps {
  onNewImplantationClick: () => void;
  onMapViewClick: () => void;
  onListViewClick: () => void;
  onHistoryClick: () => void;
  onBlockMappingClick?: () => void;
  onLogout?: () => void;
}

export function HamburgerMenu({
  onNewImplantationClick,
  onMapViewClick,
  onListViewClick,
  onHistoryClick,
  onBlockMappingClick,
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
      style={{ position: "fixed", top: "15px", right: "20px", zIndex: 10000 }}
    >
      {/* Botão Hamburger */}
      <button
        onClick={toggleMenu}
        style={{
          width: "36px",
          height: "36px",
          border: "none",
          backgroundColor: "transparent",
          color: "#6ad700",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          padding: "8px",
          transition: "all 0.3s ease",
        }}
        aria-label="Menu"
      >
        <span
          style={{
            width: "20px",
            height: "2px",
            backgroundColor: "#6ad700",
            borderRadius: "2px",
            transition: "all 0.3s ease",
            transform: isOpen ? "rotate(45deg) translate(4px, 4px)" : "none",
          }}
        />
        <span
          style={{
            width: "20px",
            height: "2px",
            backgroundColor: "#6ad700",
            borderRadius: "2px",
            transition: "all 0.3s ease",
            opacity: isOpen ? 0 : 1,
          }}
        />
        <span
          style={{
            width: "20px",
            height: "2px",
            backgroundColor: "#6ad700",
            borderRadius: "2px",
            transition: "all 0.3s ease",
            transform: isOpen ? "rotate(-45deg) translate(4px, -4px)" : "none",
          }}
        />
      </button>

      {/* Menu Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "45px",
            right: 0,
            backgroundColor: "#1e1e1e",
            borderRadius: "8px",
            border: "1px solid #6ad700",
            boxShadow: "0 4px 12px rgba(106, 215, 0, 0.3)",
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
            onClick={() => handleItemClick(onNewImplantationClick)}
            style={{
              width: "100%",
              padding: "12px 20px",
              border: "none",
              backgroundColor: "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "14px",
              color: "#6ad700",
              fontWeight: "bold",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#2a2a2a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            + Novo Lançamento
          </button>

          <div
            style={{
              height: "1px",
              backgroundColor: "#2a2a2a",
              margin: "5px 0",
            }}
          />

          <button
            onClick={() => handleItemClick(onMapViewClick)}
            style={{
              width: "100%",
              padding: "12px 20px",
              border: "none",
              backgroundColor: "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "14px",
              color: "#eaeaea",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#2a2a2a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Mapa Visual
          </button>

          <button
            onClick={() => handleItemClick(onListViewClick)}
            style={{
              width: "100%",
              padding: "12px 20px",
              border: "none",
              backgroundColor: "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "14px",
              color: "#eaeaea",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#2a2a2a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Lista para Reserva
          </button>

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
              color: "#eaeaea",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#2a2a2a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Histórico Geral
          </button>

          {onBlockMappingClick && (
            <>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "#2a2a2a",
                  margin: "5px 0",
                }}
              />
              <button
                onClick={() => handleItemClick(onBlockMappingClick)}
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  border: "none",
                  backgroundColor: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "#eaeaea",
                  transition: "background-color 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#2a2a2a";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                🎯 Mapear Blocos
              </button>
            </>
          )}

          {onLogout && (
            <>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "#2a2a2a",
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
                  color: "#d9534f",
                  transition: "background-color 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#2a2a2a";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <LogOut size={16} />
                Sair
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
