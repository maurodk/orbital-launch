// frontend/components/Header.tsx

interface HeaderProps {
  title?: string;
}

export function Header({ title = "Simulador de Implantação" }: HeaderProps) {
  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: "white",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        zIndex: 9998,
        padding: "15px 20px",
        display: "flex",
        alignItems: "center",
        gap: "20px",
        height: "70px",
      }}
    >
      <img
        src="/logo-vca.png"
        alt="VCA Construtora"
        style={{
          height: "40px",
          width: "auto",
        }}
      />
      <h1
        style={{
          margin: 0,
          fontSize: "20px",
          fontWeight: "bold",
          color: "#333",
          flex: 1,
        }}
      >
        {title}
      </h1>

      <style>
        {`
          @media (max-width: 768px) {
            header h1 {
              font-size: 16px !important;
            }
            header img {
              height: 30px !important;
            }
            header {
              padding: 10px 15px !important;
              height: 60px !important;
            }
          }
        `}
      </style>
    </header>
  );
}
