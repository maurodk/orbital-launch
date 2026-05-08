import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../src/supabaseClient";
import {
  FiChevronDown,
  FiClock,
  FiDollarSign,
  FiEdit,
  FiFileText,
  FiGrid,
  FiLayers,
  FiLock,
  FiMoreHorizontal,
  FiRefreshCw,
  FiSearch,
  FiTag,
  FiTrash2,
  FiUnlock,
  FiUser,
  FiUserPlus,
  FiUsers,
  FiX,
} from "react-icons/fi";

interface ReservationListProps {
  unidades: [string[], number][];
  onUnitClick: (unitIndex: number) => void;
  onHistoryClick: (unitName: string) => void;
  onChangeUnitClick: (unitIndex: number) => void;
  onBlockClick: (unitIndex: number) => void;
  onPrintClick: (unitIndex: number) => void;
  onPixClick: (unitIndex: number) => void;
  onPaymentClick: (unitIndex: number) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: "all" | "Disponível" | "Reservada" | "Bloqueada";
  setStatusFilter: (
    status: "all" | "Disponível" | "Reservada" | "Bloqueada"
  ) => void;
  totalUnidades: number;
  isSelectionMode: boolean;
  selectedUnits: Set<number>;
  onToggleUnitSelection: (unitIndex: number) => void;
  onToggleSelectionMode: () => void;
  onBulkBlock: () => void;
}

type GroupBy = "status" | "block" | "broker";

type UnitStatusKey = "disponivel" | "reservada" | "bloqueada" | "other";

interface UnitRecord {
  originalIndex: number;
  unitName: string;
  blockName: string;
  typology: string;
  area: string;
  clientName: string;
  brokerName: string;
  rawStatus: string;
  statusKey: UnitStatusKey;
  motivo: string;
  paymentStatus: string;
  isProcessing: boolean;
  isSpontaneous: boolean;
}

const normalizeStatus = (status: string): UnitStatusKey => {
  const normalized = (status || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (normalized === "disponivel") return "disponivel";
  if (normalized === "reservada") return "reservada";
  if (normalized === "bloqueada") return "bloqueada";
  return "other";
};

const statusLabelMap: Record<UnitStatusKey, string> = {
  disponivel: "Disponível",
  reservada: "Reservada",
  bloqueada: "Bloqueada",
  other: "Em análise",
};

const groupByLabels: Record<GroupBy, string> = {
  status: "Status",
  block: "Bloco",
  broker: "Corretor",
};

export function ReservationList({
  unidades,
  onUnitClick,
  onChangeUnitClick,
  onBlockClick,
  onHistoryClick,
  onPrintClick,
  onPixClick,
  onPaymentClick,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  totalUnidades,
  isSelectionMode,
  selectedUnits,
  onToggleUnitSelection,
  onToggleSelectionMode,
  onBulkBlock,
}: ReservationListProps) {
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openActionMenu, setOpenActionMenu] = useState<number | null>(null);
  const [isPaymentProcessed, setIsPaymentProcessed] = useState(false);
  const [canChangeOrCancel, setCanChangeOrCancel] = useState(true);
  const [isSelectionProcessing, setIsSelectionProcessing] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const records = useMemo<UnitRecord[]>(() => {
    return unidades.map(([unitData, originalIndex]) => {
      const rawStatus = unitData[11] || "Disponível";
      const statusKey = normalizeStatus(rawStatus);

      return {
        originalIndex,
        unitName: unitData[2] || "Unidade sem nome",
        blockName: unitData[3] || "Sem bloco",
        typology: unitData[4] || "Não informada",
        area: unitData[5] || "—",
        clientName: unitData[7] || "Sem cliente",
        brokerName: unitData[9] || "Sem corretor",
        rawStatus,
        statusKey,
        motivo: unitData[19] || "",
        paymentStatus: (unitData[20] || "").toString().toLowerCase(),
        isProcessing: (unitData[20] || "").toString().toLowerCase() === "processando",
        isSpontaneous: !unitData[6],
      };
    });
  }, [unidades]);

  const statusSummary = useMemo(() => {
    return records.reduce(
      (acc, record) => {
        acc.total += 1;
        acc[record.statusKey] += 1;
        if (record.isProcessing) acc.processing += 1;
        return acc;
      },
      {
        total: 0,
        disponivel: 0,
        reservada: 0,
        bloqueada: 0,
        other: 0,
        processing: 0,
      }
    );
  }, [records]);

  const groupedRecords = useMemo(() => {
    const groups = new Map<string, UnitRecord[]>();

    records.forEach((record) => {
      let key = "";

      if (groupBy === "status") {
        key = statusLabelMap[record.statusKey];
      } else if (groupBy === "block") {
        key = record.blockName;
      } else {
        key = record.brokerName;
      }

      const current = groups.get(key) || [];
      current.push(record);
      groups.set(key, current);
    });

    return Array.from(groups.entries()).map(([label, items]) => ({
      id: `${groupBy}-${label}`,
      label,
      items,
    }));
  }, [groupBy, records]);

  const visibleGroups = useMemo(() => {
    if (groupBy !== "block") return groupedRecords;

    return groupedRecords.map((group) => ({
      ...group,
      label: group.label.replace(/^BLOCO\s+/i, "Bloco "),
    }));
  }, [groupBy, groupedRecords]);

  const selectedRecord =
    selectedUnitIndex !== null
      ? records.find((record) => record.originalIndex === selectedUnitIndex) || null
      : null;

  useEffect(() => {
    if (
      selectedUnitIndex !== null &&
      !records.some((record) => record.originalIndex === selectedUnitIndex)
    ) {
      setSelectedUnitIndex(null);
    }
  }, [records, selectedUnitIndex]);

  useEffect(() => {
    setOpenGroups({});
  }, [groupBy]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenActionMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (!selectedRecord) {
        setIsPaymentProcessed(false);
        setCanChangeOrCancel(true);
        setIsSelectionProcessing(false);
        return;
      }

      if (selectedRecord.isProcessing) {
        setIsSelectionProcessing(true);
        setIsPaymentProcessed(false);
        return;
      }

      setIsSelectionProcessing(false);

      try {
        const { data, error } = await supabase
          .from("historico")
          .select("acao, timestamp_iso")
          .eq("unidade_nome", selectedRecord.unitName)
          .order("timestamp_iso", { ascending: false })
          .limit(10);

        if (error || !data || data.length === 0) {
          setIsPaymentProcessed(false);
          setCanChangeOrCancel(true);
          return;
        }

        const mostRecentAction = data[0]?.acao || "";
        if (mostRecentAction === "Erro ao registrar pagamento (Worker)") {
          setIsPaymentProcessed(false);
          setCanChangeOrCancel(true);
          return;
        }

        const paymentAction = "Pagamento Registrado";
        const workerProcessAction = "Reserva processada (Worker)";
        const fullResetActions = ["Cancelada", "Reservada"];

        const paymentIndex = data.findIndex((item) => item.acao === paymentAction);
        const workerProcessIndex = data.findIndex(
          (item) => item.acao === workerProcessAction
        );

        if (paymentIndex === -1) {
          setIsPaymentProcessed(false);
          setCanChangeOrCancel(true);
          return;
        }

        const hasFullResetBeforePayment = data
          .slice(0, paymentIndex)
          .some((item) => fullResetActions.includes(item.acao));

        if (hasFullResetBeforePayment) {
          setIsPaymentProcessed(false);
          setCanChangeOrCancel(true);
          return;
        }

        const hasWorkerProcessBeforePayment =
          workerProcessIndex !== -1 && workerProcessIndex < paymentIndex;

        setIsPaymentProcessed(true);
        setCanChangeOrCancel(hasWorkerProcessBeforePayment);
      } catch (error) {
        console.error("Erro ao verificar status do pagamento:", error);
        setIsPaymentProcessed(false);
        setCanChangeOrCancel(true);
      }
    };

    checkPaymentStatus();
  }, [selectedRecord]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  };

  const handleReserveOrCancel = (record: UnitRecord) => {
    onUnitClick(record.originalIndex);
    setOpenActionMenu(null);
  };

  const handleSelectDetail = (record: UnitRecord) => {
    setSelectedUnitIndex(record.originalIndex);
    setOpenActionMenu(null);
  };

  const handlePayment = (record: UnitRecord) => {
    onPaymentClick(record.originalIndex);
    setOpenActionMenu(null);
  };

  const handlePix = (record: UnitRecord) => {
    onPixClick(record.originalIndex);
    setOpenActionMenu(null);
  };

  const handlePrint = (record: UnitRecord) => {
    onPrintClick(record.originalIndex);
    setOpenActionMenu(null);
  };

  const handleHistory = (record: UnitRecord) => {
    onHistoryClick(record.unitName);
    setOpenActionMenu(null);
  };

  const handleChangeUnit = (record: UnitRecord) => {
    onChangeUnitClick(record.originalIndex);
    setOpenActionMenu(null);
  };

  const handleToggleBlock = (record: UnitRecord) => {
    onBlockClick(record.originalIndex);
    setOpenActionMenu(null);
  };

  const getPrimaryAction = (record: UnitRecord) => {
    if (record.statusKey === "disponivel") {
      return {
        label: "Reservar",
        tone: "primary",
        icon: <FiUserPlus size={16} />,
        onClick: () => handleReserveOrCancel(record),
        disabled: false,
      };
    }

    if (record.statusKey === "bloqueada") {
      return {
        label: "Desbloquear",
        tone: "warning",
        icon: <FiUnlock size={16} />,
        onClick: () => handleToggleBlock(record),
        disabled: false,
      };
    }

    if (record.isProcessing) {
      return {
        label: "Processando",
        tone: "muted",
        icon: <FiRefreshCw size={16} />,
        onClick: () => handleSelectDetail(record),
        disabled: true,
      };
    }

    return {
      label: "Gerenciar",
      tone: "secondary",
      icon: <FiEdit size={16} />,
      onClick: () => handleSelectDetail(record),
      disabled: false,
    };
  };

  const getMenuItems = (record: UnitRecord) => {
    const items = [
      {
        label: "Ver histórico",
        icon: <FiClock size={15} />,
        onClick: () => handleHistory(record),
      },
      {
        label: "Imprimir termo",
        icon: <FiFileText size={15} />,
        onClick: () => handlePrint(record),
      },
    ];

    if (record.statusKey === "disponivel") {
      items.push({
        label: "Bloquear unidade",
        icon: <FiLock size={15} />,
        onClick: () => handleToggleBlock(record),
      });
    }

    if (record.statusKey === "bloqueada") {
      items.push({
        label: "Desbloquear unidade",
        icon: <FiUnlock size={15} />,
        onClick: () => handleToggleBlock(record),
      });
    }

    if (record.statusKey === "reservada" || record.statusKey === "other") {
      if (record.paymentStatus !== "pago") {
        items.push({
          label: "Gerar PIX",
          icon: <FiDollarSign size={15} />,
          onClick: () => handlePix(record),
        });
      }

      items.push({
        label: "Montar pagamento",
        icon: <FiDollarSign size={15} />,
        onClick: () => handlePayment(record),
      });

      items.push({
        label: "Trocar unidade",
        icon: <FiRefreshCw size={15} />,
        onClick: () => handleChangeUnit(record),
      });

      items.push({
        label: "Cancelar reserva",
        icon: <FiTrash2 size={15} />,
        onClick: () => handleReserveOrCancel(record),
      });
    }

    return items;
  };

  const detailActions = selectedRecord
    ? [
        {
          label: "Histórico",
          description: "Consultar timeline completa da unidade.",
          icon: <FiClock size={18} />,
          tone: "neutral",
          onClick: () => handleHistory(selectedRecord),
          disabled: false,
        },
        {
          label:
            selectedRecord.statusKey === "disponivel"
              ? "Reservar"
              : selectedRecord.statusKey === "bloqueada"
                ? "Desbloquear"
                : "Cancelar reserva",
          description:
            selectedRecord.statusKey === "disponivel"
              ? "Iniciar o fluxo comercial desta unidade."
              : selectedRecord.statusKey === "bloqueada"
                ? "Liberar a unidade novamente para venda."
                : "Liberar a unidade e encerrar a reserva atual.",
          icon:
            selectedRecord.statusKey === "disponivel" ? (
              <FiUserPlus size={18} />
            ) : selectedRecord.statusKey === "bloqueada" ? (
              <FiUnlock size={18} />
            ) : (
              <FiTrash2 size={18} />
            ),
          tone:
            selectedRecord.statusKey === "disponivel"
              ? "primary"
              : selectedRecord.statusKey === "bloqueada"
                ? "warning"
                : "danger",
          onClick:
            selectedRecord.statusKey === "bloqueada"
              ? () => handleToggleBlock(selectedRecord)
              : () => handleReserveOrCancel(selectedRecord),
          disabled: false,
        },
        {
          label: "Pagamento",
          description:
            isSelectionProcessing
              ? "Fluxo em processamento pelo worker."
              : isPaymentProcessed
                ? "Pagamento já processado para esta reserva."
                : selectedRecord.isSpontaneous
                  ? "Indisponível para reservas espontâneas."
                  : "Registrar ou visualizar pagamento e plano.",
          icon: <FiDollarSign size={18} />,
          tone: "secondary",
          onClick: () => handlePayment(selectedRecord),
          disabled:
            isPaymentProcessed ||
            isSelectionProcessing ||
            selectedRecord.isSpontaneous ||
            selectedRecord.statusKey === "bloqueada",
        },
        {
          label: "Gerar PIX",
          description: "Abrir o fluxo de cobrança por PIX.",
          icon: <FiDollarSign size={18} />,
          tone: "neutral",
          onClick: () => handlePix(selectedRecord),
          disabled:
            selectedRecord.statusKey !== "reservada" &&
            selectedRecord.statusKey !== "other",
        },
        {
          label: "Trocar unidade",
          description:
            canChangeOrCancel
              ? "Mover a reserva para outra unidade."
              : "Aguardando processamento do plano para liberar a troca.",
          icon: <FiRefreshCw size={18} />,
          tone: "neutral",
          onClick: () => handleChangeUnit(selectedRecord),
          disabled:
            selectedRecord.statusKey !== "reservada" &&
            selectedRecord.statusKey !== "other"
              ? true
              : !canChangeOrCancel || isSelectionProcessing,
        },
        {
          label: "Imprimir termo",
          description: "Abrir configuração de impressão da unidade.",
          icon: <FiFileText size={18} />,
          tone: "neutral",
          onClick: () => handlePrint(selectedRecord),
          disabled: false,
        },
      ]
    : [];

  return (
    <div className="reservation-list-container reservation-workboard" ref={rootRef}>
      <div className="reservation-workboard-header">
        <div className="reservation-workboard-intro">
          <span className="reservation-workboard-kicker">Lista operacional</span>
          <h2>Unidades com leitura comercial imediata</h2>
          <p>
            Status, cliente e corretor visíveis na linha. O restante fica no
            detalhe lateral, sem poluir a navegação principal.
          </p>
        </div>

        <div className="reservation-workboard-summary">
          <div className="reservation-summary-strip">
            <div className="reservation-summary-item primary">
              <span>Exibidas</span>
              <strong>{statusSummary.total}</strong>
              <small>de {totalUnidades}</small>
            </div>
            <div className="reservation-summary-item success">
              <span>Disponíveis</span>
              <strong>{statusSummary.disponivel}</strong>
            </div>
            <div className="reservation-summary-item info">
              <span>Reservadas</span>
              <strong>{statusSummary.reservada}</strong>
            </div>
            <div className="reservation-summary-item danger">
              <span>Bloqueadas</span>
              <strong>{statusSummary.bloqueada}</strong>
            </div>
          </div>
          <div className="reservation-summary-footnote">
            <span>
              <strong>{statusSummary.processing}</strong> em processamento
            </span>
            <span>
              <strong>{visibleGroups.length}</strong> grupos em{" "}
              {groupByLabels[groupBy].toLowerCase()}
            </span>
          </div>
        </div>
      </div>

      <div className="list-filters-sticky">
        <div className="list-filters-header">
          <div className="search-input-wrapper">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por unidade, bloco ou tipologia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="reservation-secondary-controls">
          <div className="status-filter-buttons">
            <button
              className={statusFilter === "all" ? "active" : ""}
              onClick={() => setStatusFilter("all")}
            >
              Todas
            </button>
            <button
              className={statusFilter === "Disponível" ? "active" : ""}
              onClick={() => setStatusFilter("Disponível")}
            >
              Disponíveis
            </button>
            <button
              className={statusFilter === "Reservada" ? "active" : ""}
              onClick={() => setStatusFilter("Reservada")}
            >
              Reservadas
            </button>
            <button
              className={statusFilter === "Bloqueada" ? "active" : ""}
              onClick={() => setStatusFilter("Bloqueada")}
            >
              Bloqueadas
            </button>
          </div>
        </div>

        <div className="reservation-utility-row">
          <div className="reservation-group-toggle">
            <span>Agrupar por</span>
            <div className="reservation-segmented-control">
              <button
                className={groupBy === "status" ? "active" : ""}
                onClick={() => setGroupBy("status")}
              >
                <FiTag size={14} />
                Status
              </button>
              <button
                className={groupBy === "block" ? "active" : ""}
                onClick={() => setGroupBy("block")}
              >
                <FiLayers size={14} />
                Bloco
              </button>
              <button
                className={groupBy === "broker" ? "active" : ""}
                onClick={() => setGroupBy("broker")}
              >
                <FiUsers size={14} />
                Corretor
              </button>
            </div>
          </div>

          <div className="selection-mode-controls">
            <button onClick={onToggleSelectionMode} className="selection-mode-button">
              {isSelectionMode
                ? `Seleção: ${selectedUnits.size} unidade(s)`
                : "Seleção em cadeia"}
            </button>

            {isSelectionMode && selectedUnits.size > 0 && (
              <button onClick={onBulkBlock} className="bulk-block-button">
                Bloquear selecionadas
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="reservation-content-grid">
        <div className="reservation-list-column">
          <div className="reservation-list-stage">
          {records.length === 0 ? (
            <div className="reservation-empty-state">
              <FiGrid size={28} />
              <strong>Nenhuma unidade encontrada</strong>
              <p>Revise os filtros ou faça uma nova busca para continuar.</p>
            </div>
          ) : (
            visibleGroups.map((group) => {
              const isGroupOpen = Boolean(openGroups[group.id]);

              return (
                <section key={group.id} className="reservation-group-card">
                  <button
                    className="reservation-group-header"
                    onClick={() => toggleGroup(group.id)}
                  >
                    <div>
                      <span className="reservation-group-label">
                        {groupByLabels[groupBy]}
                      </span>
                      <strong>{group.label}</strong>
                    </div>
                    <div className="reservation-group-meta">
                      <span>{group.items.length} unidades</span>
                      <FiChevronDown
                        className={isGroupOpen ? "open" : ""}
                        size={16}
                      />
                    </div>
                  </button>

                  {isGroupOpen && (
                  <div className="reservation-group-body">
                    {group.items.map((record) => {
                      const primaryAction = getPrimaryAction(record);
                      const isSelected = selectedUnitIndex === record.originalIndex;
                      const menuItems = getMenuItems(record);
                      const isActionMenuOpen = openActionMenu === record.originalIndex;
                      const selectionDisabled = record.statusKey !== "disponivel";

                      return (
                        <article
                          key={record.originalIndex}
                          className={`reservation-row-card ${
                            isSelected ? "is-selected" : ""
                          } ${record.statusKey}`}
                          onClick={() => handleSelectDetail(record)}
                        >
                          <div className="reservation-row-main">
                            <div className="reservation-row-title">
                              {isSelectionMode && (
                                <input
                                  type="checkbox"
                                  checked={selectedUnits.has(record.originalIndex)}
                                  disabled={selectionDisabled}
                                  onChange={() =>
                                    onToggleUnitSelection(record.originalIndex)
                                  }
                                  onClick={(event) => event.stopPropagation()}
                                  aria-label={`Selecionar ${record.unitName}`}
                                  className="selection-checkbox"
                                />
                              )}

                              <div>
                                <strong>{record.unitName}</strong>
                                <div className="reservation-row-subtitle">
                                  <span>{record.blockName}</span>
                                  <span>{record.typology}</span>
                                  <span>{record.area}</span>
                                </div>
                              </div>
                            </div>

                            <div className="reservation-row-relationships">
                              <div className="reservation-row-pill">
                                <FiUser size={14} />
                                <span>{record.clientName}</span>
                              </div>
                              <div className="reservation-row-pill muted">
                                <FiUsers size={14} />
                                <span>{record.brokerName}</span>
                              </div>
                            </div>
                          </div>

                          <div className="reservation-row-side">
                            <div className="reservation-row-status-cluster">
                              <span className={`status-badge ${record.statusKey}`}>
                                {record.rawStatus}
                              </span>
                              {record.isProcessing && (
                                <span className="reservation-inline-flag warning">
                                  Pagamento em processamento
                                </span>
                              )}
                              {record.statusKey === "bloqueada" && record.motivo && (
                                <span className="reservation-inline-flag danger">
                                  {record.motivo}
                                </span>
                              )}
                              {record.isSpontaneous &&
                                (record.statusKey === "reservada" ||
                                  record.statusKey === "other") && (
                                  <span className="reservation-inline-flag muted">
                                    Reserva espontânea
                                  </span>
                                )}
                            </div>

                            <div className="reservation-row-actions">
                              <button
                                className={`reservation-primary-action ${primaryAction.tone}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  primaryAction.onClick();
                                }}
                                disabled={primaryAction.disabled}
                              >
                                {primaryAction.icon}
                                {primaryAction.label}
                              </button>

                              <div className="reservation-action-menu-shell">
                                <button
                                  className="reservation-menu-trigger"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setOpenActionMenu((current) =>
                                      current === record.originalIndex
                                        ? null
                                        : record.originalIndex
                                    );
                                  }}
                                  title="Mais ações"
                                >
                                  <FiMoreHorizontal size={16} />
                                </button>

                                {isActionMenuOpen && (
                                  <div
                                    className="reservation-action-menu"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    {menuItems.map((item) => (
                                      <button
                                        key={`${record.originalIndex}-${item.label}`}
                                        className="reservation-action-menu-item"
                                        onClick={item.onClick}
                                      >
                                        {item.icon}
                                        <span>{item.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  )}
                </section>
              );
            })
          )}
          </div>
        </div>

        <aside className="reservation-detail-panel">
          {selectedRecord ? (
            <>
              <div className="reservation-detail-header">
                <div>
                  <span className="reservation-workboard-kicker">Painel da unidade</span>
                  <h3>{selectedRecord.unitName}</h3>
                  <p>
                    {selectedRecord.blockName} • {selectedRecord.typology} •{" "}
                    {selectedRecord.area}
                  </p>
                </div>
                <button
                  className="reservation-detail-close"
                  onClick={() => setSelectedUnitIndex(null)}
                  aria-label="Fechar painel da unidade"
                >
                  <FiX size={16} />
                </button>
              </div>

              <div className="reservation-detail-status">
                <span className={`status-badge ${selectedRecord.statusKey}`}>
                  {selectedRecord.rawStatus}
                </span>
                {selectedRecord.isProcessing && (
                  <span className="reservation-inline-flag warning">
                    Worker processando pagamento
                  </span>
                )}
                {selectedRecord.paymentStatus === "pago" && (
                  <span className="reservation-inline-flag success">
                    Pagamento concluído
                  </span>
                )}
              </div>

              <div className="reservation-detail-grid">
                <div className="reservation-detail-card">
                  <span>Cliente</span>
                  <strong>{selectedRecord.clientName}</strong>
                </div>
                <div className="reservation-detail-card">
                  <span>Corretor</span>
                  <strong>{selectedRecord.brokerName}</strong>
                </div>
                <div className="reservation-detail-card">
                  <span>Bloco</span>
                  <strong>{selectedRecord.blockName}</strong>
                </div>
                <div className="reservation-detail-card">
                  <span>Tipologia</span>
                  <strong>{selectedRecord.typology}</strong>
                </div>
              </div>

              {selectedRecord.motivo && (
                <div className="reservation-detail-note danger">
                  <strong>Motivo do bloqueio</strong>
                  <p>{selectedRecord.motivo}</p>
                </div>
              )}

              {selectedRecord.statusKey === "reservada" ||
              selectedRecord.statusKey === "other" ? (
                <div className="reservation-detail-note">
                  <strong>Estado do fluxo</strong>
                  <p>
                    {isSelectionProcessing
                      ? "Pagamento em processamento. Aguarde a finalização do worker para liberar novas ações."
                      : isPaymentProcessed
                        ? canChangeOrCancel
                          ? "Pagamento já registrado. Troca e cancelamento liberados."
                          : "Pagamento já registrado. Aguardando processamento final para troca/cancelamento."
                        : selectedRecord.isSpontaneous
                          ? "Reserva espontânea. A montagem de pagamento fica indisponível neste cenário."
                          : "Fluxo comercial apto para pagamento, PIX e ajustes."}
                  </p>
                </div>
              ) : null}

              <div className="reservation-detail-actions">
                {detailActions.map((action) => (
                  <button
                    key={action.label}
                    className={`reservation-detail-action ${action.tone}`}
                    onClick={action.onClick}
                    disabled={action.disabled}
                  >
                    <div className="reservation-detail-action-icon">{action.icon}</div>
                    <div>
                      <strong>{action.label}</strong>
                      <span>{action.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="reservation-detail-empty">
              <FiGrid size={28} />
              <strong>Selecione uma unidade</strong>
              <p>
                Abra qualquer linha da lista para ver detalhes, bloqueios, pagamento e
                ações disponíveis em um só lugar.
              </p>
            </div>
          )}
        </aside>
      </div>

      <style>{`
        .reservation-workboard {
          display: flex;
          flex-direction: column;
          gap: 12px;
          height: min(1120px, calc(100vh - 52px));
          min-height: 780px;
          width: 100%;
          max-width: 100%;
          overflow: hidden;
          box-sizing: border-box;
        }

        .reservation-workboard-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 440px);
          gap: 12px;
          align-items: stretch;
          min-width: 0;
        }

        .reservation-workboard-intro,
        .reservation-detail-panel,
        .reservation-group-card,
        .reservation-empty-state {
          border: 1px solid rgba(226, 232, 240, 0.09);
          border-radius: 8px;
          background: linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(15, 23, 42, 0.96));
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
        }

        .reservation-workboard-intro {
          padding: 14px 16px;
        }

        .reservation-workboard-kicker {
          display: inline-flex;
          color: #60a5fa;
          font-size: 0.76rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          margin-bottom: 6px;
        }

        .reservation-workboard-intro h2 {
          margin: 0;
          font-size: 1.08rem;
          color: #f8fafc;
        }

        .reservation-workboard-intro p {
          margin: 6px 0 0;
          color: #b6c2d2;
          line-height: 1.4;
          max-width: 72ch;
          font-size: 0.86rem;
        }

        .reservation-workboard-summary {
          padding: 10px;
          border-radius: 8px;
          background: linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(15, 23, 42, 0.96));
          border: 1px solid rgba(226, 232, 240, 0.09);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }

        .reservation-summary-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }

        .reservation-summary-item {
          padding: 9px 8px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(226, 232, 240, 0.08);
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .reservation-summary-item span,
        .reservation-summary-item small,
        .reservation-summary-footnote {
          color: #94a3b8;
        }

        .reservation-summary-item strong {
          font-size: 1.15rem;
          color: #f8fafc;
          line-height: 1;
        }

        .reservation-summary-item.success strong { color: #34d399; }
        .reservation-summary-item.info strong { color: #60a5fa; }
        .reservation-summary-item.danger strong { color: #fb7185; }
        .reservation-summary-item.warning strong { color: #fbbf24; }

        .reservation-summary-footnote {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 0.74rem;
          padding: 0 2px;
        }

        .reservation-workboard .list-filters-sticky {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow: visible;
          padding: 14px;
          min-height: 136px;
          border: 1px solid rgba(226, 232, 240, 0.09);
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.72);
          flex: 0 0 auto;
        }

        .reservation-workboard .list-filters-header {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          display: block;
          box-sizing: border-box;
        }

        .reservation-workboard .search-input-wrapper {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
          min-height: 46px;
        }

        .reservation-workboard .search-input {
          width: 100%;
          box-sizing: border-box;
          min-height: 46px;
        }

        .reservation-workboard .status-filter-buttons {
          width: 100%;
          max-width: 100%;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
          box-sizing: border-box;
        }

        .reservation-workboard .status-filter-buttons button {
          width: 100%;
          min-width: 0;
          padding: 0 8px;
          white-space: nowrap;
        }

        .reservation-summary-footnote strong {
          color: #e2e8f0;
        }

        .reservation-utility-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        .reservation-secondary-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 10px;
          width: 100%;
          min-width: 0;
        }

        .reservation-group-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
        }

        .reservation-group-toggle > span {
          color: #94a3b8;
          font-size: 0.84rem;
          font-weight: 700;
        }

        .reservation-segmented-control {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(226, 232, 240, 0.08);
          min-width: 0;
        }

        .reservation-segmented-control button {
          min-height: 34px;
          padding: 0 10px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #b6c2d2;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .reservation-segmented-control button.active {
          background: #2563eb;
          color: #ffffff;
          box-shadow: 0 10px 26px rgba(37, 99, 235, 0.22);
        }

        .reservation-content-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.85fr);
          gap: 14px;
          min-height: 0;
          flex: 1 1 auto;
          width: 100%;
          max-width: 100%;
          overflow: hidden;
        }

        .reservation-list-column {
          min-height: 0;
          height: 100%;
          overflow-x: hidden;
          overflow-y: auto;
          border: 1px solid rgba(226, 232, 240, 0.09);
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.28);
          padding: 8px;
          box-sizing: border-box;
          scrollbar-gutter: stable;
        }

        .reservation-list-stage {
          min-height: 0;
          height: auto;
          overflow: visible;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-right: 0;
        }

        .reservation-list-column,
        .reservation-detail-panel {
          scrollbar-width: thin;
          scrollbar-color: rgba(96, 165, 250, 0.55) rgba(15, 23, 42, 0.55);
        }

        .reservation-list-column::-webkit-scrollbar,
        .reservation-detail-panel::-webkit-scrollbar {
          width: 10px;
        }

        .reservation-list-column::-webkit-scrollbar-track,
        .reservation-detail-panel::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.55);
          border-radius: 999px;
        }

        .reservation-list-column::-webkit-scrollbar-thumb,
        .reservation-detail-panel::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(96, 165, 250, 0.72), rgba(37, 99, 235, 0.72));
          border: 2px solid rgba(15, 23, 42, 0.55);
          border-radius: 999px;
        }

        .reservation-list-column::-webkit-scrollbar-thumb:hover,
        .reservation-detail-panel::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(147, 197, 253, 0.92), rgba(59, 130, 246, 0.92));
        }

        .reservation-group-card {
          overflow: visible;
          border-radius: 8px;
        }

        .reservation-group-card:has(.reservation-action-menu) {
          position: relative;
          z-index: 30;
        }

        .reservation-group-header {
          width: 100%;
          border: 0;
          background: rgba(255, 255, 255, 0.03);
          color: #f8fafc;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 14px;
          cursor: pointer;
          text-align: left;
        }

        .reservation-group-label {
          display: block;
          color: #94a3b8;
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .reservation-group-header strong {
          font-size: 0.96rem;
          line-height: 1.2;
        }

        .reservation-group-meta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #94a3b8;
          font-size: 0.8rem;
          white-space: nowrap;
          padding-left: 10px;
        }

        .reservation-group-meta span {
          min-height: 24px;
          padding: 0 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(226, 232, 240, 0.08);
          display: inline-flex;
          align-items: center;
        }

        .reservation-group-meta svg {
          transition: transform 0.2s ease;
        }

        .reservation-group-meta svg.open {
          transform: rotate(180deg);
        }

        .reservation-group-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 8px;
        }

        .reservation-row-card {
          border: 1px solid rgba(226, 232, 240, 0.08);
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.78);
          padding: 12px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        }

        .reservation-row-card:hover {
          transform: translateY(-1px);
          border-color: rgba(96, 165, 250, 0.34);
          box-shadow: 0 18px 34px rgba(0, 0, 0, 0.18);
        }

        .reservation-row-card.is-selected {
          border-color: rgba(37, 99, 235, 0.48);
          box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.2), 0 18px 34px rgba(0, 0, 0, 0.22);
        }

        .reservation-row-main {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 12px;
        }

        .reservation-row-title {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .reservation-row-title strong {
          display: block;
          color: #f8fafc;
          font-size: 1rem;
          line-height: 1.15;
        }

        .reservation-row-subtitle {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 6px;
          color: #94a3b8;
          font-size: 0.82rem;
        }

        .reservation-row-subtitle span:not(:last-child)::after {
          content: "•";
          margin-left: 8px;
          color: rgba(148, 163, 184, 0.5);
        }

        .reservation-row-relationships {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .reservation-row-pill {
          min-height: 34px;
          padding: 0 12px;
          border-radius: 999px;
          background: rgba(59, 130, 246, 0.12);
          color: #dbeafe;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          max-width: 100%;
        }

        .reservation-row-pill.muted {
          background: rgba(148, 163, 184, 0.12);
          color: #cbd5e1;
        }

        .reservation-row-pill span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .reservation-row-side {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
          min-width: 280px;
        }

        .reservation-row-status-cluster {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }

        .status-badge {
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          color: #061412;
        }

        .status-badge.disponivel {
          background: rgba(34, 197, 94, 0.2);
          border-color: rgba(34, 197, 94, 0.34);
          color: #d9fbe8;
        }

        .status-badge.reservada {
          background: rgba(59, 130, 246, 0.2);
          border-color: rgba(59, 130, 246, 0.34);
          color: #dbeafe;
        }

        .status-badge.bloqueada {
          background: rgba(244, 63, 94, 0.18);
          border-color: rgba(244, 63, 94, 0.3);
          color: #ffe4e6;
        }

        .status-badge.other {
          background: rgba(148, 163, 184, 0.16);
          border-color: rgba(148, 163, 184, 0.24);
          color: #e2e8f0;
        }

        .reservation-inline-flag {
          min-height: 30px;
          padding: 0 10px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          font-size: 0.74rem;
          font-weight: 700;
        }

        .reservation-inline-flag.warning {
          background: rgba(245, 158, 11, 0.16);
          color: #fde68a;
        }

        .reservation-inline-flag.danger {
          background: rgba(244, 63, 94, 0.14);
          color: #fecdd3;
        }

        .reservation-inline-flag.success {
          background: rgba(34, 197, 94, 0.14);
          color: #bbf7d0;
        }

        .reservation-inline-flag.muted {
          background: rgba(148, 163, 184, 0.12);
          color: #cbd5e1;
        }

        .reservation-row-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .reservation-primary-action,
        .reservation-menu-trigger,
        .reservation-detail-close {
          border: 0;
          cursor: pointer;
        }

        .reservation-primary-action {
          min-height: 40px;
          padding: 0 14px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 800;
        }

        .reservation-primary-action.primary {
          background: #2563eb;
          color: #ffffff;
        }

        .reservation-primary-action.secondary {
          background: rgba(59, 130, 246, 0.16);
          color: #dbeafe;
        }

        .reservation-primary-action.warning {
          background: rgba(245, 158, 11, 0.18);
          color: #fde68a;
        }

        .reservation-primary-action.muted {
          background: rgba(148, 163, 184, 0.14);
          color: #cbd5e1;
        }

        .reservation-primary-action:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .reservation-action-menu-shell {
          position: relative;
          z-index: 50;
        }

        .reservation-menu-trigger {
          position: relative;
          z-index: 1;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          color: #dbeafe;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .reservation-action-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 220px;
          padding: 8px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.98);
          border: 1px solid rgba(226, 232, 240, 0.08);
          box-shadow: 0 18px 34px rgba(0, 0, 0, 0.26);
          z-index: 100;
        }

        .reservation-action-menu-item {
          width: 100%;
          min-height: 38px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #e2e8f0;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          cursor: pointer;
        }

        .reservation-action-menu-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .reservation-detail-panel {
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-height: 0;
          height: 100%;
          overflow-y: auto;
        }

        .reservation-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .reservation-detail-header h3 {
          margin: 0;
          color: #f8fafc;
          font-size: 1.25rem;
        }

        .reservation-detail-header p {
          margin: 8px 0 0;
          color: #94a3b8;
        }

        .reservation-detail-close {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          color: #e2e8f0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .reservation-detail-status {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .reservation-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .reservation-detail-card,
        .reservation-detail-note {
          padding: 14px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.76);
          border: 1px solid rgba(226, 232, 240, 0.08);
        }

        .reservation-detail-card span,
        .reservation-detail-note strong {
          color: #94a3b8;
          display: block;
        }

        .reservation-detail-card strong {
          display: block;
          margin-top: 6px;
          color: #f8fafc;
          line-height: 1.4;
        }

        .reservation-detail-note p {
          margin: 8px 0 0;
          color: #dbe2ec;
          line-height: 1.6;
        }

        .reservation-detail-note.danger {
          border-color: rgba(244, 63, 94, 0.22);
          background: rgba(127, 29, 29, 0.18);
        }

        .reservation-detail-actions {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .reservation-detail-action {
          border: 1px solid rgba(226, 232, 240, 0.08);
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.76);
          color: #f8fafc;
          padding: 14px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          text-align: left;
          cursor: pointer;
        }

        .reservation-detail-action.primary {
          border-color: rgba(37, 99, 235, 0.36);
        }

        .reservation-detail-action.warning {
          border-color: rgba(245, 158, 11, 0.36);
        }

        .reservation-detail-action.danger {
          border-color: rgba(244, 63, 94, 0.32);
        }

        .reservation-detail-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .reservation-detail-action-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .reservation-detail-action strong,
        .reservation-detail-empty strong,
        .reservation-empty-state strong {
          display: block;
          color: #f8fafc;
        }

        .reservation-detail-action span,
        .reservation-detail-empty p,
        .reservation-empty-state p {
          display: block;
          margin-top: 4px;
          color: #94a3b8;
          line-height: 1.5;
        }

        .reservation-detail-empty,
        .reservation-empty-state {
          min-height: 220px;
          padding: 22px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 10px;
          color: #94a3b8;
        }

        .selection-mode-controls {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .selection-mode-button,
        .bulk-block-button {
          min-height: 40px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1px solid rgba(226, 232, 240, 0.1);
          font-weight: 800;
          cursor: pointer;
        }

        .selection-mode-button {
          background: rgba(15, 23, 42, 0.76);
          color: #f8fafc;
        }

        .bulk-block-button {
          background: rgba(244, 63, 94, 0.16);
          color: #ffe4e6;
          border-color: rgba(244, 63, 94, 0.24);
        }

        .selection-checkbox {
          width: 18px;
          height: 18px;
          margin-top: 2px;
          accent-color: #2563eb;
        }

        @media (max-width: 1180px) {
          .reservation-workboard-header,
          .reservation-content-grid {
            grid-template-columns: 1fr;
          }

          .reservation-workboard {
            height: auto;
            min-height: 0;
            overflow: visible;
          }

          .reservation-list-column {
            height: min(640px, 62vh);
          }

          .reservation-detail-panel {
            min-height: 320px;
            max-height: 520px;
          }
        }

        @media (max-width: 960px) {
          .reservation-summary-strip {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .reservation-row-card {
            grid-template-columns: 1fr;
          }

          .reservation-row-side {
            min-width: 0;
            align-items: flex-start;
          }

          .reservation-row-status-cluster {
            justify-content: flex-start;
          }
        }

        @media (max-width: 640px) {
          .reservation-workboard-header {
            gap: 14px;
          }

          .reservation-summary-strip,
          .reservation-detail-grid {
            grid-template-columns: 1fr;
          }

          .reservation-secondary-controls {
            align-items: stretch;
            flex-direction: column;
          }

          .reservation-workboard .status-filter-buttons {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .reservation-workboard .list-filters-sticky {
            min-height: 190px;
          }

          .reservation-row-title,
          .reservation-row-actions,
          .reservation-utility-row,
          .reservation-group-toggle {
            align-items: stretch;
            flex-direction: column;
          }

          .reservation-row-actions {
            width: 100%;
          }

          .reservation-primary-action,
          .reservation-menu-trigger {
            width: 100%;
            justify-content: center;
          }

          .reservation-action-menu {
            left: 0;
            right: auto;
            width: min(100%, 280px);
          }

          .reservation-summary-footnote {
            flex-direction: column;
            gap: 6px;
          }

          .reservation-group-header {
            gap: 10px;
            align-items: flex-start;
          }

          .reservation-group-meta {
            padding-left: 0;
            width: auto;
          }
        }
      `}</style>
    </div>
  );
}
