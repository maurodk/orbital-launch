import {
  BarChart3,
  Building2,
  CreditCard,
  History,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  Sparkles,
  TableProperties,
  Target,
} from "lucide-react";
import type { ComponentType } from "react";

type NavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  onClick: () => void;
  active?: boolean;
};

interface EnterpriseSidebarProps {
  activeView: "map" | "list" | "history";
  userDisplayName?: string;
  implantacoes: { nome: string; url: string }[];
  selectedImplantationName: string;
  onImplantationChange: (name: string) => void;
  onNewImplantationClick: () => void;
  onMapViewClick: () => void;
  onListViewClick: () => void;
  onHistoryClick: () => void;
  onBlockMappingClick?: () => void;
  onPaymentHistoryClick: () => void;
  onDiretoriaClick: () => void;
  onAdvertisingClick: () => void;
  onLogout: () => void;
}

export function EnterpriseSidebar({
  activeView,
  userDisplayName,
  implantacoes,
  selectedImplantationName,
  onImplantationChange,
  onNewImplantationClick,
  onMapViewClick,
  onListViewClick,
  onHistoryClick,
  onBlockMappingClick,
  onPaymentHistoryClick,
  onDiretoriaClick,
  onAdvertisingClick,
  onLogout,
}: EnterpriseSidebarProps) {
  const operationItems: NavItem[] = [
    {
      id: "operation",
      label: "Principal",
      icon: LayoutDashboard,
      onClick: onMapViewClick,
      active: activeView === "map",
    },
    {
      id: "list",
      label: "Lista",
      icon: TableProperties,
      onClick: onListViewClick,
      active: activeView === "list",
    },
    {
      id: "history",
      label: "Histórico",
      icon: History,
      onClick: onHistoryClick,
      active: activeView === "history",
    },
    {
      id: "payments",
      label: "Pagamentos",
      icon: CreditCard,
      onClick: onPaymentHistoryClick,
    },
  ];

  const adminItems: NavItem[] = [
    ...(onBlockMappingClick
      ? [
          {
            id: "blocks",
            label: "Mapear blocos",
            icon: Target,
            onClick: onBlockMappingClick,
          },
        ]
      : []),
    {
      id: "diretoria",
      label: "Diretoria",
      icon: BarChart3,
      onClick: onDiretoriaClick,
    },
    {
      id: "ads",
      label: "Propagandas",
      icon: MonitorPlay,
      onClick: onAdvertisingClick,
    },
  ];

  const renderNavButton = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        type="button"
        className={`enterprise-sidebar-link ${item.active ? "active" : ""}`}
        onClick={item.onClick}
      >
        <Icon size={18} />
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="enterprise-sidebar" aria-label="Navegação principal">
      <div className="enterprise-sidebar-brand">
        <div className="enterprise-sidebar-mark" aria-hidden="true">
          <Sparkles size={20} />
        </div>
        <div>
          <strong>Orbital Launch</strong>
          <span>Enterprise operations</span>
        </div>
      </div>

      <button
        type="button"
        className="enterprise-sidebar-primary"
        onClick={onNewImplantationClick}
      >
        <Building2 size={18} />
        <span>Criar implantação</span>
      </button>

      <div className="enterprise-sidebar-context">
        <span>Implantação ativa</span>
        {implantacoes.length > 0 ? (
          <select
            value={selectedImplantationName}
            onChange={(event) => onImplantationChange(event.target.value)}
            aria-label="Selecionar implantação ativa"
          >
            {implantacoes.map((implantacao) => (
              <option key={implantacao.nome} value={implantacao.nome}>
                {implantacao.nome}
              </option>
            ))}
          </select>
        ) : (
          <strong>Nenhuma selecionada</strong>
        )}
      </div>

      <nav className="enterprise-sidebar-section">
        <span className="enterprise-sidebar-section-title">Operação</span>
        {operationItems.map(renderNavButton)}
      </nav>

      <nav className="enterprise-sidebar-section">
        <span className="enterprise-sidebar-section-title">Admin</span>
        {adminItems.map(renderNavButton)}
      </nav>

      <div className="enterprise-sidebar-footer">
        {userDisplayName && <span>Logado como {userDisplayName}</span>}
        <button
          type="button"
          className="enterprise-sidebar-link danger"
          onClick={onLogout}
        >
          <LogOut size={18} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}
