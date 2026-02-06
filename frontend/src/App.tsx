// src/App.tsx - VERSÃO COM CORREÇÃO FINAL BASEADA NO MANUAL ATUAL

import { Routes, Route } from "react-router-dom";
import { MainPage } from "./pages/MainPage"; // Importa a página principal refatorada
import { CVCrmMappingPage } from "./pages/CVCrmMappingPage"; // Importa a nova página
import { Diretoria } from "./pages/Diretoria";
import { FullscreenPage } from "./pages/FullscreenPage"; // Nova página fullscreen React
import { PaymentHistoryPage } from "./pages/PaymentHistoryPage"; // Nova página de histórico de pagamentos
import { Login } from "../components/Login"; // Login pode ser uma rota separada também

import "./App.css";
import "../components/TermoDeReserva.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/map-cvcrm" element={<CVCrmMappingPage />} />
      <Route path="/diretoria" element={<Diretoria />} />
      <Route path="/fullscreen" element={<FullscreenPage />} />
      <Route path="/pagamentos" element={<PaymentHistoryPage />} />
    </Routes>
  );
}

export default App;
