// src/styles/selectStyles.ts
import { type StylesConfig } from "react-select";

export const createCustomSelectStyles = <OptionType,>(): StylesConfig<OptionType, false> => ({
  control: (provided) => ({
    ...provided,
    backgroundColor: "#2a2a2a",
    borderColor: "#444",
    boxShadow: "none",
    "&:hover": {
      borderColor: "#6ad700",
    },
    padding: "4px",
  }),
  input: (provided) => ({
    ...provided,
    color: "#EAEAEA",
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: "#1E1E1E",
    border: "1px solid #444",
    zIndex: 50, // Garante que o menu fique acima de outros elementos
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isFocused ? "#2a2a2a" : "transparent",
    color: state.isFocused ? "#6ad700" : "#EAEAEA",
    fontWeight: state.isFocused ? "600" : "400",
    cursor: "pointer",
  }),
  singleValue: (provided) => ({
    ...provided,
    color: "#6ad700",
  }),
  placeholder: (provided) => ({
    ...provided,
    color: "#B0B0B0",
  }),
});
