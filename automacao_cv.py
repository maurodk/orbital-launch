# ==============================================================================
# --- 0. IMPORTAÇÕES GERAIS E DA INTERFACE ---
# ==============================================================================
import sys
import csv
import time
import threading
import os
import subprocess
import ctypes

# Interface Gráfica e Imagens
import customtkinter as ctk
from PIL import Image
import tkinter.font as tkfont

# Manipulação de Dados e Excel
import pandas as pd

# ==============================================================================
# --- 1. IMPORTAÇÕES DA AUTOMAÇÃO ---
# ==============================================================================
# Selenium
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    StaleElementReferenceException,
    NoSuchWindowException,
)
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager

# Google Sheets
import gspread
from google.oauth2.service_account import Credentials

# ==============================================================================
# --- 2. LÓGICA DA AUTOMAÇÃO (CONSTANTES) ---
# ==============================================================================
URL_BASE_SISTEMA = "https://vca.cvcrm.com.br/gestor/"
NOME_ARQUIVO_CREDENCIAIS = "credentials.json"
NOME_DA_ABA = "Página1"
NOME_DA_COLUNA_ID = "ID PRECADASTRO"
NOME_DA_COLUNA_UNIDADE = "UNIDADE"
NOME_DA_COLUNA_CORRETOR = "CORRETOR"
NOME_DA_COLUNA_CPF_CONJUGE = "CPF DO CONJUGE"
NOME_DA_COLUNA_NOME_CONJUGE = "NOME DO CONJUGE"
ETAPA_VALIDACAO_DADOS = "Validação de Dados da Planilha"
ETAPA_NAVEGACAO_INICIAL = "Navegação e Abertura da Reserva"
ETAPA_APROVACAO_PRECADASTRO = "Aprovação do Pré-Cadastro"  # <-- NOVA CONSTANTE
ETAPA_SELECAO_CORRETOR = "Seleção do Corretor"
ETAPA_DADOS_CONJUGE = "Processamento de Dados do Cônjuge"
ETAPA_FORMULARIO_FINAL = "Preenchimento do Formulário Final"

try:
    # Define um ID único para o app, assim o Windows usa o ícone correto
    myappid = "vca.automacao.reservas.1.0"
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
    pass


# ==============================================================================
# --- FUNÇÃO AUXILIAR PARA PYINSTALLER ---
# ==============================================================================
def resource_path(relative_path):
    """Retorna o caminho absoluto para o recurso, funcionando tanto em dev quanto no PyInstaller"""
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)


def ler_planilha_google(id_planilha, callback_log):
    callback_log("Iniciando leitura da Planilha Google...", "INFO")
    try:
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive.file",
        ]
        caminho_credenciais = resource_path(NOME_ARQUIVO_CREDENCIAIS)
        creds = Credentials.from_service_account_file(
            caminho_credenciais, scopes=scopes
        )
        client = gspread.authorize(creds)
        callback_log("Autenticação com Google API bem-sucedida.", "SUCCESS")
        planilha = client.open_by_key(id_planilha)
        aba = planilha.worksheet(NOME_DA_ABA)
        dados = aba.get_all_records()
        callback_log(
            f"Sucesso! {len(dados)} linhas de dados foram lidas da planilha.", "SUCCESS"
        )
        return dados
    except gspread.exceptions.SpreadsheetNotFound:
        callback_log(
            "Planilha não encontrada. Verifique o ID e o compartilhamento.", "ERROR"
        )
        return None
    except FileNotFoundError:
        callback_log(
            f"Arquivo de credenciais '{NOME_ARQUIVO_CREDENCIAIS}' não encontrado.",
            "ERROR",
        )
        return None
    except Exception as e:
        callback_log(f"Erro crítico ao acessar a planilha: {e}", "ERROR")
        return None


def fazer_login(driver, usuario, senha, callback_log):
    callback_log("Iniciando login no CVCrm...", "INFO")
    try:
        driver.get(URL_BASE_SISTEMA)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.ID, "email"))
        ).send_keys(usuario)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.ID, "senha"))
        ).send_keys(senha)
        WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable((By.XPATH, '//*[@id="formLogin"]/button'))
        ).click()
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.XPATH, '//*[@id="global"]/div/div/h1'))
        )
        callback_log("Login realizado com sucesso!", "SUCCESS")
        return True
    except Exception as e:
        callback_log(
            f"Login falhou. Verifique credenciais ou lentidão. Erro: {str(e).splitlines()[0]}",
            "ERROR",
        )
        driver.save_screenshot("erro_durante_login.png")
        return False


def selecionar_corretor_e_confirmar(driver, nome_corretor, callback_log):
    callback_log(
        f"Selecionando corretor '{nome_corretor}' clicando no botão 'Selecionar corretor'.",
        "INFO",
    )
    try:
        xpath_botao_corretor = '//input[@value="Selecionar corretor"]'
        max_tentativas = 3
        for tentativa in range(max_tentativas):
            try:
                botao_selecionar = WebDriverWait(driver, 15).until(
                    EC.element_to_be_clickable((By.XPATH, xpath_botao_corretor))
                )
                driver.execute_script("arguments[0].click();", botao_selecionar)
                callback_log("Botão 'Selecionar corretor' clicado com sucesso.", "INFO")
                break
            except TimeoutException:
                callback_log(
                    "ERRO: O botão 'Selecionar corretor' não foi encontrado na página.",
                    "ERROR",
                )
                raise
            except StaleElementReferenceException:
                callback_log(
                    f"Aviso: O botão 'Selecionar corretor' ficou obsoleto. Tentando novamente ({tentativa + 1}/{max_tentativas})...",
                    "INFO",
                )
                time.sleep(1)
        else:
            raise Exception(
                "Não foi possível clicar no botão 'Selecionar corretor' após múltiplas tentativas."
            )

        callback_log("Aguardando alerta de confirmação...", "INFO")
        WebDriverWait(driver, 10).until(EC.alert_is_present())
        alerta = driver.switch_to.alert
        alerta.accept()
        callback_log("Seleção de corretor concluída.", "SUCCESS")
        return True
    except Exception as e:
        callback_log(f"Falha na seleção do corretor: {str(e).splitlines()[0]}", "ERROR")
        driver.save_screenshot("erro_selecao_corretor.png")
        return False


def preencher_formulario_final(driver, callback_log):
    callback_log("Preenchendo formulário final...", "INFO")
    try:
        callback_log("Etapa 1: Preenchendo detalhes (Mídia, Motivo, PDV)...", "INFO")
        Select(
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "idmidia"))
            )
        ).select_by_index(4)
        Select(
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "idmotivo_escolha"))
            )
        ).select_by_index(3)
        Select(
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "idpdv"))
            )
        ).select_by_index(1)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "form_descricao_outro_pdv"))
        ).send_keys(".")
        callback_log("Clicando no botão 'Salvar' intermediário...", "INFO")
        botao_salvar = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable(
                (By.XPATH, '//*[@id="form_semassociado"]/div/button')
            )
        )
        driver.execute_script("arguments[0].click();", botao_salvar)
        callback_log("Etapa 1 de detalhes concluída.", "INFO")
    except Exception as e:
        callback_log(
            f"Aviso: Etapa 1 falhou. Tentando prosseguir. Detalhe: {str(e).splitlines()[0]}",
            "INFO",
        )
    try:
        callback_log("Etapa 2: Clicando no botão 'Finalizar'...", "INFO")
        botao_finalizar = WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable((By.XPATH, '//*[@id="finalizar"]'))
        )
        driver.execute_script("arguments[0].click();", botao_finalizar)
        time.sleep(2)
        callback_log("Formulário finalizado com sucesso!", "SUCCESS")
        return True
    except Exception as e:
        callback_log(
            f"FALHA CRÍTICA: Não foi possível clicar no botão 'Finalizar'. Erro: {e}",
            "ERROR",
        )
        driver.save_screenshot("log_erro_formulario_final.png")
        return False


def processar_dados_conjuge(driver, linha_dados, callback_log):
    callback_log("Avançando para a etapa de finalização...", "INFO")
    try:
        botoes_de_avanco = [
            {
                "nome": "'Avançar' Padrão",
                "xpath": '//*[@id="formulario_cliente"]/div[2]/form/div/input[4]',
            },
            {
                "nome": "'Prosseguir'",
                "xpath": '//*[@id="form_campo_semcpf"]/div[2]/div/input',
            },
            {
                "nome": "'Avançar' Alternativo",
                "xpath": '//*[@id="formulario_cliente"]/form/div[4]/input[2]',
            },
        ]
        marcador_pagina_detalhes = EC.presence_of_element_located((By.ID, "idmidia"))
        marcador_pagina_final = EC.presence_of_element_located(
            (By.XPATH, '//*[@id="formulario_formadepagamento"]/div[3]/strong')
        )
        avanco_bem_sucedido = False

        for i, botao_info in enumerate(botoes_de_avanco):
            try:
                callback_log(
                    f"Tentativa {i+1}/{len(botoes_de_avanco)}: Clicando em {botao_info['nome']}...",
                    "INFO",
                )
                botao_para_clicar = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.XPATH, botao_info["xpath"]))
                )
                driver.execute_script("arguments[0].click();", botao_para_clicar)
                WebDriverWait(driver, 5).until(
                    EC.any_of(marcador_pagina_detalhes, marcador_pagina_final)
                )
                callback_log(
                    f"Avanço com o botão {botao_info['nome']} bem-sucedido.", "SUCCESS"
                )
                avanco_bem_sucedido = True
                break
            except TimeoutException:
                callback_log(
                    f"Botão {botao_info['nome']} não encontrado ou não levou à página esperada.",
                    "INFO",
                )

        if not avanco_bem_sucedido:
            raise Exception(
                "Nenhum dos 3 botões de avanço conhecidos foi encontrado ou funcionou."
            )

        return preencher_formulario_final(driver, callback_log)
    except Exception as e:
        callback_log(f"Falha crítica ao tentar avançar para a tela final: {e}", "ERROR")
        driver.save_screenshot("log_erro_avanco_final.png")
        return False


def processar_precadastro(driver, linha_dados, lista_log, callback_log):
    id_precadastro = linha_dados.get(NOME_DA_COLUNA_ID)
    unidade = linha_dados.get(NOME_DA_COLUNA_UNIDADE)
    corretor = linha_dados.get(NOME_DA_COLUNA_CORRETOR)
    janela_principal = driver.current_window_handle

    def registrar_falha(etapa, detalhe):
        lista_log.append(
            {
                "PRÉ-CADASTRO": id_precadastro or "N/A",
                "ERRO": "Sim",
                "ETAPA": etapa,
                "DESCRIÇÃO": detalhe,
            }
        )

    try:
        if not all([id_precadastro, unidade, corretor]):
            detalhe = "Dados essenciais (ID, Unidade ou Corretor) faltando na planilha."
            callback_log(f"FALHA NA LEITURA: {detalhe}", "ERROR")
            registrar_falha(ETAPA_VALIDACAO_DADOS, detalhe)
            return

        callback_log(f"Processando ID: {id_precadastro} | Unidade: {unidade}", "INFO")

        callback_log(
            f"Abrindo URL do pré-cadastro: {URL_BASE_SISTEMA}comercial/precadastro/{id_precadastro}/administrar",
            "INFO",
        )
        try:
            driver.get(
                f"{URL_BASE_SISTEMA}comercial/precadastro/{id_precadastro}/administrar"
            )
            callback_log(
                "Página de pré-cadastro carregada. Nenhum iframe encontrado, prosseguindo na página principal...",
                "INFO",
            )
        except TimeoutException as te:
            callback_log(f"Timeout ao carregar página de pré-cadastro: {te}", "ERROR")
            registrar_falha(
                ETAPA_NAVEGACAO_INICIAL,
                f"Timeout ao carregar página de pré-cadastro: {te}",
            )
            return
        except Exception as e:
            callback_log(
                f"Erro inesperado ao carregar página de pré-cadastro: {e}",
                "ERROR",
            )
            registrar_falha(
                ETAPA_NAVEGACAO_INICIAL, f"Erro ao carregar página de pré-cadastro: {e}"
            )
            return

        # --- INÍCIO DA NOVA IMPLEMENTAÇÃO ---
        callback_log(
            "Verificando a necessidade de aprovação do pré-cadastro...", "INFO"
        )
        try:
            xpath_botao_aprovar = (
                "//a[contains(@class, '-primario') and normalize-space()='Aprovar']"
            )
            botoes_aprovar = driver.find_elements(By.XPATH, xpath_botao_aprovar)

            if botoes_aprovar:
                callback_log(
                    "Botão 'Aprovar' encontrado. Clicando e confirmando via JS...",
                    "SUCCESS",
                )
                driver.execute_script("arguments[0].click();", botoes_aprovar[0])
                callback_log(
                    "Clique no botão 'Aprovar' realizado. Aguardando alerta...", "INFO"
                )
                try:
                    WebDriverWait(driver, 10).until(EC.alert_is_present())
                    alerta = driver.switch_to.alert
                    alerta.accept()
                    callback_log("Alerta de aprovação confirmado!", "SUCCESS")
                except Exception as e:
                    callback_log(f"Alerta não apareceu após aprovação: {e}", "ERROR")
                callback_log(
                    "Pré-cadastro aprovado com sucesso. Aguardando página...", "SUCCESS"
                )
                time.sleep(2)
            else:
                callback_log("Pré-cadastro já está aprovado. Prosseguindo...", "INFO")

            # Sempre tentar clicar no botão 'Iniciar Reserva', independente da aprovação
            callback_log("Buscando botão 'Iniciar Reserva'...", "INFO")
            try:
                # Busca por todos os botões que contenham o texto 'Iniciar Reserva'
                botoes_iniciar = driver.find_elements(
                    By.XPATH, "//a[contains(text(), 'Iniciar Reserva')]"
                )
                if not botoes_iniciar:
                    callback_log(
                        "Nenhum botão 'Iniciar Reserva' encontrado pelo texto. Tentando busca alternativa por classe...",
                        "INFO",
                    )
                    botoes_iniciar = driver.find_elements(
                        By.XPATH, "//a[contains(@class, 'mapadisponibilidade')]"
                    )
                if botoes_iniciar:
                    for botao in botoes_iniciar:
                        try:
                            driver.execute_script(
                                "arguments[0].scrollIntoView();", botao
                            )
                            driver.execute_script("arguments[0].click();", botao)
                            callback_log(
                                "Botão 'Iniciar Reserva' clicado com sucesso!",
                                "SUCCESS",
                            )
                            time.sleep(2)
                            break
                        except Exception as e:
                            callback_log(
                                f"Falha ao clicar em um dos botões 'Iniciar Reserva': {e}",
                                "ERROR",
                            )
                else:
                    callback_log(
                        "Botão 'Iniciar Reserva' não encontrado. Prosseguindo normalmente.",
                        "ERROR",
                    )
            except Exception as e:
                callback_log(
                    f"Erro ao tentar clicar em 'Iniciar Reserva': {e}", "ERROR"
                )

        except Exception as e:
            detalhe_erro = (
                f"Ocorreu um erro na etapa de aprovação: {str(e).splitlines()[0]}"
            )
            callback_log(detalhe_erro, "ERROR")
            registrar_falha(ETAPA_APROVACAO_PRECADASTRO, detalhe_erro)
            return
        # --- FIM DA NOVA IMPLEMENTAÇÃO ---

        # Após clicar em 'Iniciar Reserva', aguardar e trocar para a nova janela
        callback_log("Aguardando abertura do mapa de disponibilidade...", "INFO")
        try:
            WebDriverWait(driver, 10).until(EC.number_of_windows_to_be(2))
            novas_janelas = [w for w in driver.window_handles if w != janela_principal]
            if not novas_janelas:
                callback_log(
                    "Nenhuma nova janela encontrada após clicar em 'Iniciar Reserva'.",
                    "ERROR",
                )
                registrar_falha(
                    ETAPA_NAVEGACAO_INICIAL,
                    "Nenhuma nova janela encontrada após 'Iniciar Reserva'.",
                )
                return
            janela_popup = novas_janelas[0]
            driver.switch_to.window(janela_popup)
            callback_log(
                "Foco trocado para a janela do mapa de disponibilidade.", "SUCCESS"
            )
        except Exception as e:
            callback_log(
                f"Erro ao trocar para a janela do mapa de disponibilidade: {e}", "ERROR"
            )
            registrar_falha(
                ETAPA_NAVEGACAO_INICIAL, f"Erro ao trocar para janela do mapa: {e}"
            )
            return

        # Selecionar unidade
        try:
            texto_limpo = unidade.lower().strip()
            xpath_unidade = f"//span[normalize-space(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')) = '{texto_limpo}']/ancestor::div[contains(@class, 'disp-bloco')]"
            unidade_div = WebDriverWait(driver, 20).until(
                EC.element_to_be_clickable((By.XPATH, xpath_unidade))
            )
            driver.execute_script("arguments[0].click();", unidade_div)
            callback_log(f"Unidade '{unidade}' selecionada com sucesso.", "SUCCESS")
            WebDriverWait(driver, 15).until(
                EC.element_to_be_clickable((By.ID, "linkReserva"))
            ).click()
            callback_log("Botão 'Reservar' clicado com sucesso.", "SUCCESS")
        except Exception as e:
            callback_log(
                f"Erro ao selecionar unidade ou clicar em reservar: {e}", "ERROR"
            )
            registrar_falha(
                ETAPA_NAVEGACAO_INICIAL, f"Erro ao selecionar unidade ou reservar: {e}"
            )
            return

        if not selecionar_corretor_e_confirmar(driver, corretor, callback_log):
            registrar_falha(
                ETAPA_SELECAO_CORRETOR,
                f"A sub-rotina de seleção do corretor '{corretor}' retornou falha.",
            )
            return

        if not processar_dados_conjuge(driver, linha_dados, callback_log):
            registrar_falha(
                ETAPA_DADOS_CONJUGE,
                "A sub-rotina de avanço ou do formulário final retornou falha.",
            )
            return

        lista_log.append(
            {
                "PRÉ-CADASTRO": id_precadastro,
                "ERRO": "Não",
                "ETAPA": "N/A",
                "DESCRIÇÃO": "Reserva concluída com sucesso.",
            }
        )
        callback_log(f"SUCESSO TOTAL para o ID {id_precadastro}!", "SUCCESS")

    except Exception as e:
        detalhe_erro = str(e).split("\n")[0]
        callback_log(f"ERRO INESPERADO no ID {id_precadastro}: {detalhe_erro}", "ERROR")
        registrar_falha(ETAPA_NAVEGACAO_INICIAL, detalhe_erro)

    finally:
        if len(driver.window_handles) > 1:
            try:
                driver.close()
            except NoSuchWindowException:
                pass
        driver.switch_to.window(janela_principal)


def exportar_log_xlsx(lista_log, gestor_email, callback_log):
    if not lista_log:
        callback_log("Nenhum dado para registrar no log.", "INFO")
        return None
    timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")
    nome_arquivo = f"log_automacao_{timestamp}.xlsx"
    callback_log(f"Exportando log para '{nome_arquivo}'...", "INFO")
    try:
        data_automacao = time.strftime("%d/%m/%Y")
        horario_automacao = time.strftime("%H:%M:%S")
        for registro in lista_log:
            registro["GESTOR DA AUTOMAÇÃO"] = gestor_email
            registro["DATA DA AUTOMAÇÃO"] = data_automacao
            registro["HORÁRIO DA AUTOMAÇÃO"] = horario_automacao
        df = pd.DataFrame(lista_log)
        ordem_colunas = [
            "PRÉ-CADASTRO",
            "ERRO",
            "ETAPA",
            "DESCRIÇÃO",
            "GESTOR DA AUTOMAÇÃO",
            "DATA DA AUTOMAÇÃO",
            "HORÁRIO DA AUTOMAÇÃO",
        ]
        df = df[ordem_colunas]
        with pd.ExcelWriter(nome_arquivo, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Resultados")
            worksheet = writer.sheets["Resultados"]
            for column_cells in worksheet.columns:
                max_length = len(str(column_cells[0].value))
                column_letter = column_cells[0].column_letter
                for cell in column_cells[1:]:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = max_length + 2
                worksheet.column_dimensions[column_letter].width = adjusted_width
        callback_log("Log XLSX exportado com sucesso!", "SUCCESS")
        return nome_arquivo
    except Exception as e:
        callback_log(f"Erro ao exportar o log XLSX: {e}", "ERROR")
        return None


def executar_automacao_completa(
    usuario, senha, id_planilha, callback_log, callback_final
):
    log_de_resultados = []
    driver = None
    log_path = None
    try:
        dados = ler_planilha_google(id_planilha, callback_log)
        if dados is None:
            raise SystemExit("Falha na leitura da planilha. Abortando.")
        callback_log("Iniciando navegador (Chrome)...", "INFO")
        service = ChromeService(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service)
        driver.maximize_window()
        if not fazer_login(driver, usuario, senha, callback_log):
            raise SystemExit("Falha no login. Abortando.")
        total = len(dados)
        callback_log(f"Iniciando processamento de {total} registros...", "INFO")
        for i, linha in enumerate(dados):
            callback_log(f"--- Processando item {i+1} de {total} ---", "HEADER")
            processar_precadastro(driver, linha, log_de_resultados, callback_log)
        callback_log("Automação de todos os itens concluída.", "SUCCESS")
    except SystemExit as e:
        callback_log(str(e), "ERROR")
    except Exception as e:
        callback_log(f"ERRO FATAL NA AUTOMAÇÃO: {e}", "ERROR")
        if driver:
            driver.save_screenshot("erro_fatal_main.png")
    finally:
        log_path = exportar_log_xlsx(log_de_resultados, usuario, callback_log)
        if driver:
            callback_log("Fechando o navegador...", "INFO")
            driver.quit()
        callback_log("Processo finalizado.", "HEADER")
        callback_final(log_path)


# ==============================================================================
# --- 3. CLASSE DA INTERFACE GRÁFICA (GUI) ---
# ==============================================================================
class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Automação de Reservas")
        self.geometry("600x700")
        self.minsize(550, 650)
        ctk.set_appearance_mode("dark")
        try:
            self.iconbitmap(resource_path("iconevca.ico"))
        except:
            pass
        self.last_log_path = None
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)
        self.top_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.top_frame.grid(row=0, column=0, padx=20, pady=(20, 10), sticky="ew")
        self.top_frame.grid_columnconfigure(0, weight=1)
        self.logo_label = self.create_logo_widget(self.top_frame)
        self.logo_label.grid(row=0, column=0, pady=(0, 20))
        self.input_frame = ctk.CTkFrame(self.top_frame, fg_color="transparent")
        self.input_frame.grid(row=1, column=0, sticky="ew")
        self.input_frame.grid_columnconfigure(0, weight=1)
        self.email_entry = ctk.CTkEntry(
            self.input_frame, placeholder_text="Seu e-mail de acesso"
        )
        self.email_entry.grid(row=0, column=0, pady=6, padx=10, sticky="ew")
        self.senha_entry = ctk.CTkEntry(
            self.input_frame, placeholder_text="Sua senha", show="*"
        )
        self.senha_entry.grid(row=1, column=0, pady=6, padx=10, sticky="ew")
        self.planilha_id_entry = ctk.CTkEntry(
            self.input_frame, placeholder_text="ID da Planilha Google"
        )
        self.planilha_id_entry.grid(row=2, column=0, pady=6, padx=10, sticky="ew")
        self.start_button = ctk.CTkButton(
            self.input_frame,
            text="Iniciar Automação",
            command=self.iniciar_automacao_thread,
            fg_color="#32CD32",
            hover_color="#1B8758",
        )
        self.start_button.grid(row=3, column=0, pady=(20, 10), padx=10, ipady=5)
        self.bottom_frame = ctk.CTkFrame(self)
        self.bottom_frame.grid(row=1, column=0, padx=20, pady=(10, 0), sticky="nsew")
        self.bottom_frame.grid_columnconfigure(0, weight=1)
        self.bottom_frame.grid_rowconfigure(0, weight=1)
        self.log_textbox = ctk.CTkTextbox(
            self.bottom_frame, state="disabled", text_color="#E0E0E0", wrap="word"
        )
        self.log_textbox.grid(row=0, column=0, sticky="nsew")
        self.configure_log_tags()
        self.view_log_button = ctk.CTkButton(
            self.bottom_frame,
            text="Abrir Pasta do Log",
            command=self.open_log_directory,
        )
        custom_font_name = "Mayonice"
        if custom_font_name in tkfont.families():
            credits_font = ctk.CTkFont(family=custom_font_name, size=14)
        else:
            credits_font = ctk.CTkFont(size=12, slant="italic")
        credits_text = "Desenvolvido por:\nMauricio - Imobiliário"
        self.credits_label = ctk.CTkLabel(
            self, text=credits_text, font=credits_font, text_color="gray50"
        )
        self.credits_label.grid(row=2, column=0, padx=20, pady=10, sticky="s")
        self.start_animation()

    def create_logo_widget(self, parent):
        try:
            logo_image = ctk.CTkImage(
                light_image=Image.open(resource_path("logo.png")),
                dark_image=Image.open(resource_path("logo.png")),
                size=(150, 60),
            )
            return ctk.CTkLabel(parent, image=logo_image, text="")
        except FileNotFoundError:
            return ctk.CTkLabel(
                parent,
                text="Sua Logo Aqui\n(crie 'logo.png')",
                font=ctk.CTkFont(size=16, weight="bold"),
            )

    def start_animation(self):
        self.logo_label.grid_remove()
        self.input_frame.grid_remove()
        self.credits_label.grid_remove()
        self.after(200, self.animate_logo)

    def animate_logo(self):
        self.logo_label.grid()
        self.after(200, self.animate_inputs)

    def animate_inputs(self):
        self.input_frame.grid()
        self.credits_label.grid()

    def configure_log_tags(self):
        self.log_textbox.tag_config("INFO", foreground="#87CEEB")
        self.log_textbox.tag_config("SUCCESS", foreground="#32CD32")
        self.log_textbox.tag_config("ERROR", foreground="#FF6347", underline=True)
        self.log_textbox.tag_config("HEADER", foreground="#FFD700", underline=True)

    def log_message(self, message, level="INFO"):
        def _log():
            self.log_textbox.configure(state="normal")
            timestamp = time.strftime("%H:%M:%S")
            self.log_textbox.insert("end", f"[{timestamp}] {message}\n", level.upper())
            self.log_textbox.see("end")
            self.log_textbox.configure(state="disabled")

        self.after(0, _log)

    def open_log_directory(self):
        if not self.last_log_path:
            self.log_message("Nenhum log foi gerado nesta sessão.", "ERROR")
            return
        try:
            log_directory = os.path.dirname(os.path.abspath(self.last_log_path))
            if sys.platform == "win32":
                os.startfile(log_directory)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", log_directory])
            else:
                subprocess.Popen(["xdg-open", log_directory])
        except Exception as e:
            self.log_message(f"Não foi possível abrir a pasta do log: {e}", "ERROR")

    def iniciar_automacao_thread(self):
        usuario = self.email_entry.get()
        senha = self.senha_entry.get()
        id_planilha = self.planilha_id_entry.get()
        if not all([usuario, senha, id_planilha]):
            self.log_message("Preencha todos os campos antes de iniciar.", "ERROR")
            return
        self.log_textbox.configure(state="normal")
        self.log_textbox.delete("1.0", "end")
        self.log_textbox.configure(state="disabled")
        self.start_button.configure(state="disabled", text="Executando...")
        self.view_log_button.grid_forget()
        thread = threading.Thread(
            target=executar_automacao_completa,
            args=(
                usuario,
                senha,
                id_planilha,
                self.log_message,
                self.finalizar_automacao,
            ),
        )
        thread.daemon = True
        thread.start()

    def finalizar_automacao(self, log_path):
        def _finalize():
            self.last_log_path = log_path
            self.start_button.configure(state="normal", text="Iniciar Nova Automação")
            if self.last_log_path and os.path.exists(self.last_log_path):
                self.view_log_button.grid(row=1, column=0, pady=(10, 5), sticky="s")

        self.after(0, _finalize)


# ==============================================================================
# --- 4. EXECUÇÃO PRINCIPAL ---
# ==============================================================================
if __name__ == "__main__":
    app = App()
    app.mainloop()
