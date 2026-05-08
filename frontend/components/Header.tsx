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
        backgroundColor: "var(--surface-panel, #172225)",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.24)",
        borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.09))",
        zIndex: 9998,
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        height: "56px",
      }}
    >
      <img
        src="/logo.png"
        alt="VCA Construtora"
        style={{
          height: "32px",
          width: "auto",
          filter: "drop-shadow(0 6px 14px rgba(0, 0, 0, 0.28))",
        }}
      />
      <div
        style={{
          width: "2px",
          height: "40px",
          background:
            "linear-gradient(to bottom, transparent, var(--color-accent, #d99a26), transparent)",
          flexShrink: 0,
        }}
      />
      <h1
        style={{
          margin: 0,
          fontSize: "20px",
          fontWeight: "bold",
          color: "var(--text-primary, #eef5f6)",
          flex: 1,
        }}
      >
        {title}
      </h1>

      <style>
        {`
          @media (max-width: 768px) {
              header {
                padding: 6px 10px !important;
                height: 52px !important;
                gap: 10px !important;
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
              height: 50px !important;
              gap: 8px !important;
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
              height: 46px !important;
              gap: 6px !important;
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
