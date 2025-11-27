// frontend/components/Header.tsx

interface HeaderProps {
  title?: string;
  isFixed?: boolean;
}

export function Header({
  title = "Simulador de Implantação",
  isFixed = true,
}: HeaderProps) {
  return (
    <header
      style={{
        position: isFixed ? "fixed" : "absolute",
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: "#1e1e1e",
        boxShadow: "0 2px 8px rgba(106, 215, 0, 0.3)",
        borderBottom: "2px solid #6ad700",
        zIndex: 9998,
        padding: "15px 20px",
        display: "flex",
        alignItems: "center",
        gap: "20px",
        height: "70px",
      }}
    >
      <img
        src="/logo.png"
        alt="VCA Construtora"
        style={{
          height: "40px",
          width: "auto",
          filter:
            "drop-shadow(0 0 20px rgba(106, 215, 0, 0.6)) drop-shadow(0 0 40px rgba(106, 215, 0, 0.4))",
        }}
      />
      <div
        style={{
          width: "2px",
          height: "40px",
          background:
            "linear-gradient(to bottom, transparent, #6ad700, transparent)",
          flexShrink: 0,
        }}
      />
      <h1
        style={{
          margin: 0,
          fontSize: "20px",
          fontWeight: "bold",
          color: "#eaeaea",
          flex: 1,
        }}
      >
        {title}
      </h1>

      <style>
        {`
          @media (max-width: 768px) {
            header {
              padding: 8px 12px !important;
              height: 60px !important;
              gap: 12px !important;
            }
            header h1 {
              font-size: 14px !important;
            }
            header img {
              height: 28px !important;
            }
          }
          
          @media (max-width: 425px) {
            header {
              padding: 6px 10px !important;
              height: 55px !important;
              gap: 10px !important;
            }
            header h1 {
              font-size: 12px !important;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            header img {
              height: 24px !important;
            }
          }
          
          @media (max-width: 320px) {
            header {
              padding: 5px 8px !important;
              height: 50px !important;
              gap: 8px !important;
            }
            header h1 {
              font-size: 11px !important;
            }
            header img {
              height: 22px !important;
            }
          }
        `}
      </style>
    </header>
  );
}
