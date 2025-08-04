interface Implantation {
  nome: string;
  url: string;
}

interface ImplantationSwitcherProps {
  implantacoes: Implantation[];
  selected: string;
  onChange: (newName: string) => void;
}

export function ImplantationSwitcher({
  implantacoes,
  selected,
  onChange,
}: ImplantationSwitcherProps) {
  if (!implantacoes || implantacoes.length === 0) {
    return null;
  }

  return (
    <div className="implantation-switcher">
      <select value={selected} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Selecione uma Implantação
        </option>
        {implantacoes.map((imp) => (
          <option key={imp.nome} value={imp.nome}>
            {imp.nome}
          </option>
        ))}
      </select>
    </div>
  );
}
