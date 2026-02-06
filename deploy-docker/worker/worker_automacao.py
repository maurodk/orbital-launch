"""
Worker de Automação de Reservas - CVCrm
Processa reservas da tabela 'clientes' do Supabase sem interface gráfica
"""

import sys
import time
import logging
import os
import json
import redis
from datetime import datetime
import traceback
from typing import Dict, List, Optional
import calendar
import socket

# Carregar variáveis de ambiente do arquivo .env
from dotenv import load_dotenv

# Determinar o diretório onde o script está localizado para encontrar o .env de forma robusta
script_dir = os.path.dirname(os.path.abspath(__file__))
env_path_root = os.path.join(script_dir, '.env')
env_path_backend = os.path.join(script_dir, 'backend', '.env')
env_path_parent = os.path.join(script_dir, '..', '.env')

if os.path.exists(env_path_root):
    load_dotenv(env_path_root)
elif os.path.exists(env_path_backend):
    load_dotenv(env_path_backend)
elif os.path.exists(env_path_parent):
    load_dotenv(env_path_parent)

# Selenium
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    StaleElementReferenceException,
    NoSuchWindowException,
)
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

# Supabase
from supabase import create_client, Client
import requests
import re
from urllib.parse import urlparse, parse_qs

# ==============================================================================
# --- CONFIGURAÇÕES ---
# ==============================================================================
URL_BASE_SISTEMA = "https://vca.cvcrm.com.br/gestor/"

# Variáveis de ambiente para credenciais
CVCRM_EMAIL = os.getenv("CVCRM_USER") or os.getenv("CVCRM_EMAIL")
CVCRM_SENHA = os.getenv("CVCRM_PASSWORD") or os.getenv("CVCRM_SENHA")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE")
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
QUEUE_NAME = "fila_reservas"

# Identificar o worker (usa WORKER_NAME se disponível, senão hostname)
WORKER_ID = os.getenv("WORKER_NAME") or os.getenv("HOSTNAME", socket.gethostname())

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format=f'%(asctime)s - [WORKER: {WORKER_ID}] - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('worker_automacao.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

logger.info(f"Worker iniciado com ID: {WORKER_ID}")


def save_screenshot_on_error(driver, prefix: str = "error"):
    """Tenta salvar um screenshot do `driver` com timestamp para debug."""
    try:
        if driver:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{prefix}_{timestamp}.png"
            dest = os.path.join(SCREENSHOT_DIR, filename)
            driver.save_screenshot(dest)
            logger.info(f"Screenshot salva: {dest}")
            # Rotacionar arquivos antigos
            _prune_screenshots()
    except Exception as ex:
        logger.warning(f"Falha ao salvar screenshot: {ex}")


# Diretório para armazenar screenshots (configurável por env)
SCREENSHOT_DIR = os.getenv("SCREENSHOT_DIR", os.path.join(script_dir, "screenshots"))
try:
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
except Exception as e:
    logger.warning(f"Não foi possível criar SCREENSHOT_DIR '{SCREENSHOT_DIR}': {e}")

# Máximo de screenshots a manter (rotaciona as mais antigas)
try:
    SCREENSHOT_MAX_FILES = int(os.getenv("SCREENSHOT_MAX_FILES", "200"))
except Exception:
    SCREENSHOT_MAX_FILES = 200


def _prune_screenshots(max_files: int = SCREENSHOT_MAX_FILES):
    try:
        files = [os.path.join(SCREENSHOT_DIR, f) for f in os.listdir(SCREENSHOT_DIR) if f.lower().endswith('.png')]
        if len(files) <= max_files:
            return
        files.sort(key=lambda p: os.path.getmtime(p))
        to_remove = files[0: len(files) - max_files]
        for f in to_remove:
            try:
                os.remove(f)
                logger.info(f"Removido screenshot antigo: {f}")
            except Exception as e:
                logger.warning(f"Falha ao remover screenshot {f}: {e}")
    except Exception as e:
        logger.warning(f"Erro ao rotacionar screenshots: {e}")

# ==============================================================================
# --- CLIENTE SUPABASE ---
# ==============================================================================
def get_supabase_client() -> Client:
    """Inicializa e retorna cliente do Supabase"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Variáveis SUPABASE_URL e SUPABASE_KEY devem estar definidas")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def get_redis_client():
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

# ==============================================================================
# --- FUNÇÕES DE AUTOMAÇÃO (ADAPTADAS) ---
# ==============================================================================
def criar_driver_headless() -> webdriver.Chrome:
    """Cria driver Chrome em modo headless para execução em background"""
    logger.info("Iniciando Chrome Driver...")
    chrome_options = Options()
    # Controle via variável de ambiente: em container recomendamos "true"
    CHROME_HEADLESS = os.getenv("CHROME_HEADLESS", "true").lower() in ("1", "true", "yes")
    if CHROME_HEADLESS:
        chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--start-maximized")  # Inicia maximizado
    
    try:
        # Tenta usar o driver do sistema (comum em imagens Docker)
        service = ChromeService("/usr/bin/chromedriver")
        driver = webdriver.Chrome(service=service, options=chrome_options)
    except Exception:
        logger.warning("Driver do sistema não encontrado, tentando webdriver_manager...")
        service = ChromeService(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
    return driver


def fazer_login(driver: webdriver.Chrome, usuario: str, senha: str) -> bool:
    """Realiza login no CVCrm"""
    logger.info("Iniciando login no CVCrm...")
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
        logger.info("Login realizado com sucesso!")
        return True
    except Exception as e:
        logger.error(f"Login falhou: {str(e)}")
        save_screenshot_on_error(driver, prefix="erro_login")
        return False


def selecionar_corretor_e_confirmar(driver: webdriver.Chrome, nome_corretor: str) -> bool:
    """Seleciona corretor e confirma"""
    logger.info(f"Selecionando corretor '{nome_corretor}'...")
    try:
        xpath_botao_corretor = '//input[@value="Selecionar corretor"]'
        max_tentativas = 3
        
        for tentativa in range(max_tentativas):
            try:
                botao_selecionar = WebDriverWait(driver, 15).until(
                    EC.element_to_be_clickable((By.XPATH, xpath_botao_corretor))
                )
                driver.execute_script("arguments[0].click();", botao_selecionar)
                logger.info("Botão 'Selecionar corretor' clicado")
                break
            except StaleElementReferenceException:
                logger.warning(f"Elemento obsoleto, tentando novamente ({tentativa + 1}/{max_tentativas})")
                time.sleep(1)
        else:
            raise Exception("Não foi possível clicar no botão 'Selecionar corretor'")

        WebDriverWait(driver, 10).until(EC.alert_is_present())
        alerta = driver.switch_to.alert
        alerta.accept()
        logger.info("Seleção de corretor concluída")
        return True
    except Exception as e:
        logger.error(f"Falha na seleção do corretor: {str(e)}")
        save_screenshot_on_error(driver, prefix="erro_selecao_corretor")
        return False


def preencher_formulario_final(driver: webdriver.Chrome, dados_pagamento: Dict = None) -> bool:
    """Preenche formulário final da reserva e configura séries de pagamento"""
    logger.info("Preenchendo formulário final...")
    try:
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
        
        botao_salvar = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable(
                (By.XPATH, '//*[@id="form_semassociado"]/div/button')
            )
        )
        driver.execute_script("arguments[0].click();", botao_salvar)
    except Exception as e:
        logger.warning(f"Etapa 1 do formulário: {str(e)}")
    
    # Preparar dados de pagamento (sem selecionar tipo de venda ainda)
    tipo_venda = None
    # Determina se devemos adicionar séries: preferir flag explícita, senão inferir pela presença de tipo_pagamento
    adicionar_series = True
    if dados_pagamento and isinstance(dados_pagamento, dict):
        if dados_pagamento.get("pagamentoPresencial") is False:
            adicionar_series = False

    if dados_pagamento and "tipo_venda" in dados_pagamento:
        try:
            tipo_venda = dados_pagamento.get("tipo_venda")
            plano_selecionado = dados_pagamento.get("plano_selecionado")
            # Interpretar valores de forma flexível:
            # - Se houver 'valor_unidade' usar como total do imóvel
            # - Se houver 'valor_pix' usar como Sinal 1
            # - Se não houver 'valor_pix' mas existir 'tipo_pagamento', assumir que 'valor' é o PIX
            # - Caso contrário, assumir que 'valor' é o valor total da unidade (fallback)
            valor_unidade_total = None
            valor_pix = 0.0
            dia_vencimento = 15

            if "valor_unidade" in dados_pagamento and dados_pagamento.get("valor_unidade") is not None:
                valor_unidade_total = float(dados_pagamento.get("valor_unidade"))
            elif "valor" in dados_pagamento and dados_pagamento.get("valor") is not None and not dados_pagamento.get("tipo_pagamento"):
                # 'valor' sem tipo_pagamento → provavelmente valor da unidade
                valor_unidade_total = float(dados_pagamento.get("valor"))

            if "valor_pix" in dados_pagamento and dados_pagamento.get("valor_pix") is not None:
                valor_pix = float(dados_pagamento.get("valor_pix"))
            elif dados_pagamento.get("tipo_pagamento") and dados_pagamento.get("valor") is not None:
                # 'valor' com tipo_pagamento → provavelmente PIX/Sinal 1
                valor_pix = float(dados_pagamento.get("valor"))

            if dados_pagamento.get("dia_vencimento") is not None:
                try:
                    dia_vencimento = int(dados_pagamento.get("dia_vencimento"))
                except Exception:
                    dia_vencimento = 15

            logger.info(f"Configurando pagamento - Tipo: {tipo_venda}, Plano: {plano_selecionado}, valor_unidade_total={valor_unidade_total}, valor_pix={valor_pix}")

            # Se não for pagamento presencial (flag explícita ou ausência de tipo_pagamento), não adicionar séries
            if dados_pagamento.get("pagamentoPresencial") is None and not dados_pagamento.get("tipo_pagamento"):
                adicionar_series = False

            if not adicionar_series:
                logger.info("Pagamento não presencial detectado — pulando adição de séries")
            else:
                # Adicionar séries baseado no plano (tipo de venda será selecionado depois)
                if plano_selecionado == "plano1":
                    if valor_unidade_total is None:
                        logger.warning("Valor total da unidade não disponível; não é possível calcular Plano 1 corretamente")
                    else:
                        setattr(adicionar_series_plano1, "plano2", False)
                        if not adicionar_series_plano1(driver, valor_unidade_total, valor_pix, dia_vencimento=dia_vencimento):
                            logger.error("Falha CRÍTICA ao adicionar séries do plano 1 - Abortando processamento")
                            raise Exception("Falha ao configurar séries de pagamento do Plano 1")
                elif plano_selecionado == "plano2":
                    if valor_unidade_total is None:
                        logger.warning("Valor total da unidade não disponível; não é possível calcular Plano 2 corretamente")
                    else:
                        setattr(adicionar_series_plano1, "plano2", True)
                        if not adicionar_series_plano1(driver, valor_unidade_total, valor_pix, dia_vencimento=dia_vencimento):
                            logger.error("Falha CRÍTICA ao adicionar séries do plano 2 - Abortando processamento")
                            raise Exception("Falha ao configurar séries de pagamento do Plano 2")
                elif plano_selecionado == "plano3":
                    if valor_unidade_total is None:
                        logger.warning("Valor total da unidade não disponível; não é possível calcular Plano 3")
                    elif not adicionar_series_plano3(driver, valor_unidade_total, valor_pix, dia_vencimento=dia_vencimento):
                        logger.error("Falha CRÍTICA ao adicionar séries do plano 3 - Abortando processamento")
                        raise Exception("Falha ao configurar séries de pagamento do Plano 3")
                elif plano_selecionado == "plano4":
                    if valor_unidade_total is None:
                        logger.warning("Valor total da unidade não disponível; não é possível calcular Plano 4")
                    else:
                        if not adicionar_series_plano4(driver, valor_unidade_total, valor_pix, dia_vencimento=dia_vencimento):
                            logger.error("Falha CRÍTICA ao adicionar séries do plano 4 - Abortando processamento")
                            raise Exception("Falha ao configurar séries de pagamento do Plano 4")
                elif plano_selecionado == "plano5":
                    if valor_unidade_total is None:
                        logger.warning("Valor total da unidade não disponível; não é possível calcular Plano 5")
                    else:
                        if not adicionar_series_plano5(driver, valor_unidade_total, valor_pix, dia_vencimento=dia_vencimento):
                            logger.error("Falha CRÍTICA ao adicionar séries do plano 5 - Abortando processamento")
                            raise Exception("Falha ao configurar séries de pagamento do Plano 5")
            # Outros planos serão implementados depois
            
        except Exception as e:
            logger.warning(f"Erro ao configurar pagamento/séries: {str(e)}")
    
    # Última etapa: Selecionar tipo de venda (se houver)
    if tipo_venda:
        try:
            logger.info(f"[Etapa Final] Selecionando tipo de venda: {tipo_venda}")
            if not selecionar_tipo_venda(driver, tipo_venda):
                logger.warning("Falha ao selecionar tipo de venda, continuando...")
        except Exception as e:
            logger.warning(f"Erro ao selecionar tipo de venda na etapa final: {str(e)}")
    
    try:
        botao_finalizar = WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable((By.XPATH, '//*[@id="finalizar"]'))
        )
        driver.execute_script("arguments[0].click();", botao_finalizar)
        time.sleep(2)
        logger.info("Formulário finalizado com sucesso! Aguardando número da reserva (verificando URL primeiro)...")

        # Primeiro, tentar extrair o ID da reserva diretamente da URL, ex:
        # https://.../finalizarreserva?...&reserva=45251&tk=...
        try:
            # Dar um pequeno loop para aguardar redirecionamento de URL
            reserva_id = None
            for _ in range(10):
                try:
                    current_url = driver.current_url
                except Exception:
                    current_url = None
                # debug: current_url logged at INFO level when match found
                if current_url and ("reserva=" in current_url or "/finalizarreserva" in current_url):
                    try:
                        parsed = urlparse(current_url)
                        qs = parse_qs(parsed.query)
                        cand = qs.get("reserva") or qs.get("reserva_id")
                        if cand and len(cand) > 0:
                            cand0 = cand[0]
                            m = re.search(r"(\d{1,10})", cand0)
                            if m:
                                reserva_id = m.group(1)
                                logger.info(f"reserva id extracted from URL: {reserva_id}")
                                return reserva_id
                    except Exception:
                        pass
                time.sleep(0.5)
        except Exception:
            pass

        # Após finalizar, a aplicação redireciona para uma página com o número da reserva.
        # Tentamos várias estratégias mais robustas para extrair apenas os dígitos
        try:
            # Aguarda curto período para a nova página carregar
            time.sleep(1)

            reserva_id = None

            # 1) Tentar encontrar h4/strong/p com texto relevante (fallback quando URL não entregou reserva)
            try:
                elementos = driver.find_elements(By.XPATH, "//h4 | //strong | //p")
            except Exception:
                elementos = []

            # quantidade de elementos inspecionados não mais logada em DEBUG

            # 2) Se não achar, pegar todo o body e tentar extrair
            if not elementos:
                try:
                    body = driver.find_element(By.TAG_NAME, "body")
                    elementos = [body]
                    # usando body como fallback (sem log detalhado)
                except Exception:
                    elementos = []

            candidates = []
            # 3) Percorrer textos buscando padrão de número (aceita com ou sem '#')
            for idx, el in enumerate(elementos):
                try:
                    txt = (el.text or "").strip()
                    snippet = txt[:200].replace('\n', ' ') if txt else ''
                    # inspecionando elemento (trecho suprimido nos logs)
                    if not txt:
                        candidates.append({'idx': idx, 'text': snippet, 'match': None})
                        continue
                    # Busca sequências de 4-10 dígitos (ajustável)
                    m = re.search(r"#?\s*(\d{4,10})", txt)
                    match_val = m.group(1) if m else None
                    candidates.append({'idx': idx, 'text': snippet, 'match': match_val})
                    if m:
                        reserva_id = match_val
                        logger.info(f"regex match on element[{idx}]: '{match_val}' from text='{snippet}'")
                        break
                except Exception:
                    continue
                    continue

            # candidates suppressed from logs

            if reserva_id:
                logger.info(f"ID da reserva detectado: {reserva_id}")
                return reserva_id
            else:
                logger.warning("Não foi possível extrair ID da reserva após finalização (nenhum padrão encontrado)")
                return True
        except Exception as e:
            logger.warning(f"Erro ao buscar número da reserva: {e}")
            return True

    except Exception as e:
        logger.error(f"Falha ao finalizar formulário: {e}")
        save_screenshot_on_error(driver, prefix="erro_formulario_final")
        return False


def selecionar_tipo_venda(driver: webdriver.Chrome, tipo_venda: str) -> bool:
    """
    Seleciona o tipo de venda no dropdown
    
    Args:
        driver: WebDriver
        tipo_venda: "cef" ou "facilita"
        
    Returns:
        True se bem-sucedido, False caso contrário
    """
    try:
        logger.info(f"Selecionando tipo de venda: {tipo_venda}")
        
        select_element = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "idtipovenda"))
        )
        select = Select(select_element)
        
        if tipo_venda.lower() == "facilita":
            # Procurar por PARCELAMENTO INCORPORADORA
            for option in select.options:
                if "PARCELAMENTO INCORPORADORA" in option.text.upper():
                    select.select_by_value(option.get_attribute("value"))
                    logger.info("Tipo de venda 'PARCELAMENTO INCORPORADORA' selecionado")
                    return True
        elif tipo_venda.lower() == "cef":
            # Procurar por FINANCIAMENTO BANCÁRIO CEF
            for option in select.options:
                if "FINANCIAMENTO BANCÁRIO CEF" in option.text.upper():
                    select.select_by_value(option.get_attribute("value"))
                    logger.info("Tipo de venda 'FINANCIAMENTO BANCÁRIO CEF' selecionado")
                    return True
        
        logger.warning(f"Tipo de venda '{tipo_venda}' não encontrado nas opções")
        return False
    except Exception as e:
        logger.error(f"Erro ao selecionar tipo de venda: {e}")
        return False


def selecionar_opcao_dropdown(driver: webdriver.Chrome, element_id: str, texto_busca: str) -> bool:
    """
    Seleciona uma opção em um dropdown pelo texto (ignorando espaços)
    
    Args:
        driver: WebDriver
        element_id: ID do elemento select
        texto_busca: Texto a buscar na opção (ignorará espaços)
        
    Returns:
        True se encontrado e selecionado, False caso contrário
    """
    try:
        select_element = WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.ID, element_id))
        )
        select = Select(select_element)
        
        # Normalizar texto de busca (remover espaços extras)
        texto_normalizado = ' '.join(texto_busca.split()).upper()
        
        for option in select.options:
            option_normalizado = ' '.join(option.text.split()).upper()
            if texto_normalizado in option_normalizado:
                select.select_by_value(option.get_attribute("value"))
                logger.info(f"Opção '{option.text}' selecionada em {element_id}")
                return True
        
        logger.warning(f"Opção contendo '{texto_busca}' não encontrada em {element_id}")
        return False
    except Exception as e:
        logger.error(f"Erro ao selecionar opção em {element_id}: {e}")
        return False


def preencher_input_texto(driver: webdriver.Chrome, element_id: str, valor: str) -> bool:
    """Preenche um input de texto e limpa antes"""
    try:
        input_element = WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.ID, element_id))
        )

        # Garantir foco e limpar de forma robusta (alguns campos têm máscara/validação)
        try:
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", input_element)
        except Exception:
            pass

        try:
            input_element.click()
        except Exception:
            driver.execute_script("arguments[0].click();", input_element)

        # Múltiplas estratégias de limpeza antes de escrever
        try:
            input_element.clear()
        except Exception:
            pass

        # CTRL+A para selecionar tudo antes de digitar (importante para campos com valores pré-preenchidos)
        try:
            input_element.send_keys(Keys.CONTROL + "a")
        except Exception:
            pass

        # Agora escrever o novo valor
        input_element.send_keys(str(valor))

        # Para campos com máscara (ex.: vencimento), disparar eventos e blur.
        if element_id in {"vencimento"}:
            driver.execute_script(
                """
                const el = arguments[0];
                const v = arguments[1];
                el.value = v;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.blur();
                """,
                input_element,
                str(valor),
            )
            time.sleep(0.2)

        current_value = None
        try:
            current_value = input_element.get_attribute("value")
        except Exception:
            pass

        if element_id == "vencimento" and current_value:
            if str(valor).strip() not in str(current_value).strip():
                logger.warning(
                    f"Campo vencimento não refletiu valor esperado: esperado='{valor}', atual='{current_value}'"
                )

        logger.info(f"Input {element_id} preenchido com: {valor}")
        return True
    except Exception as e:
        logger.error(f"Erro ao preencher input {element_id}: {e}")
        return False


def adicionar_serie(driver: webdriver.Chrome, serie_nome: str, qtd_parcelas: int, valor: float, vencimento: str, forma_pagamento: str = None) -> bool:
    """
    Adiciona uma série de pagamento
    
    Args:
        driver: WebDriver
        serie_nome: Nome da série (ex: "Sinal 1", "PARCELAMENTO INCORPORADORA")
        qtd_parcelas: Quantidade de parcelas
        valor: Valor da série
        vencimento: Data de vencimento (formato DD/MM/YYYY)
        forma_pagamento: Forma de pagamento (ex: "PIX"). Se None, não preenche este campo.
        
    Returns:
        True se série foi adicionada com sucesso, False caso contrário
    """
    try:
        logger.info(f"Adicionando série: {serie_nome}")
        
        # Garantir que o painel de adição esteja aberto: se o dropdown "idserie" já estiver clicável, não reabrir.
        try:
            WebDriverWait(driver, 2).until(
                EC.element_to_be_clickable((By.ID, "idserie"))
            )
            logger.info("Painel de adição já aberto; seguindo para seleção de série")
        except TimeoutException:
            # Abrir painel apenas se necessário
            botao_adicionar = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.ID, "botao_adicionar_manual"))
            )
            driver.execute_script("arguments[0].click();", botao_adicionar)
            time.sleep(1)
        
        # Selecionar série no dropdown
        if not selecionar_opcao_dropdown(driver, "idserie", serie_nome):
            return False
        time.sleep(0.5)
        
        # Preencher quantidade de parcelas
        if not preencher_input_texto(driver, "qtd_parcelas", qtd_parcelas):
            return False
        time.sleep(0.5)
        
        # Preencher valor
        if not preencher_input_texto(driver, "valor", f"{valor:.2f}"):
            return False
        time.sleep(0.5)
        
        # Preencher data de vencimento
        if not preencher_input_texto(driver, "vencimento", vencimento):
            return False
        time.sleep(0.5)
        
        # Não selecionar forma de pagamento explicitamente
        
        # Clicar no botão de adicionar série
        botao_add_serie = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.XPATH, '//button[contains(@class, "btAddSerie") and contains(@class, "-primario")]'))
        )
        driver.execute_script("arguments[0].click();", botao_add_serie)
        
        # Aguardar mensagem de sucesso
        try:
            WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Série cadastrada com sucesso')]"))
            )
            logger.info(f"Série '{serie_nome}' adicionada com sucesso!")
            time.sleep(1)
            return True
        except TimeoutException:
            logger.warning(f"Mensagem de sucesso não apareceu para série '{serie_nome}'")
            return False
            
    except Exception as e:
        logger.error(f"Erro ao adicionar série '{serie_nome}': {e}")
        save_screenshot_on_error(driver, prefix=f"erro_serie_{serie_nome}")
        return False


def obter_proximo_vencimento_valido(data_base, dias_apos=0):
    """
    Retorna o próximo vencimento válido (05, 15 ou 25) após data_base + dias_apos.
    
    Args:
        data_base: datetime da data de referência
        dias_apos: dias a somar à data_base antes de arredondar
        
    Returns:
        str no formato DD/MM/YYYY
    """
    from datetime import datetime, timedelta
    
    data_calc = data_base + timedelta(days=dias_apos)
    dia = data_calc.day
    mes = data_calc.month
    ano = data_calc.year
    
    # Dias válidos: 05, 15, 25
    dias_validos = [5, 15, 25]
    
    # Se o dia atual é válido, usa ele
    if dia in dias_validos:
        return data_calc.strftime("%d/%m/%Y")
    
    # Encontra o próximo dia válido no mês atual
    for dia_valido in dias_validos:
        if dia_valido > dia:
            try:
                data_result = datetime(ano, mes, dia_valido)
                return data_result.strftime("%d/%m/%Y")
            except ValueError:
                pass
    
    # Se nenhum dia válido no mês atual, usa dia 05 do próximo mês
    if mes == 12:
        data_result = datetime(ano + 1, 1, 5)
    else:
        data_result = datetime(ano, mes + 1, 5)
    
    return data_result.strftime("%d/%m/%Y")


def editar_primeira_serie_para_sinal1(driver: webdriver.Chrome, valor_pix: float, data_vencimento: str) -> bool:
    """
    Edita a primeira série existente para transformá-la em Sinal 1 com PIX
    
    Args:
        driver: WebDriver
        valor_pix: Valor do PIX (Sinal 1)
        data_vencimento: Data de vencimento (formato DD/MM/YYYY)
        
    Returns:
        True se série foi editada com sucesso, False caso contrário
    """
    max_tentativas = 2
    for tentativa in range(1, max_tentativas + 1):
        try:
            logger.info(f"Editando primeira série existente para Sinal 1 (tentativa {tentativa}/{max_tentativas})...")
            
            # Clicar no botão de editar primeira série (editarserie0)
            botao_editar = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, '//a[@href="#editarserie0" and contains(@class, "cv-btn-block")]'))
            )
            driver.execute_script("arguments[0].click();", botao_editar)
            logger.info("Clicado no botão de editar primeira série")
            time.sleep(2)
            
            # Entrar no iframe do facebox
            iframe = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.XPATH, '//*[@id="facebox"]/div/div/iframe'))
            )
            driver.switch_to.frame(iframe)
            logger.info("Entrou no iframe do facebox")
            time.sleep(1)
            
            # Selecionar "Sinal 1" no dropdown de série
            dropdown_serie = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.ID, "idserie"))
            )
            select_serie = Select(dropdown_serie)
            
            # Procurar opção que contém "Sinal 1" (ignorando espaços)
            opcao_encontrada = False
            for opcao in select_serie.options:
                if "sinal" in opcao.text.lower().replace(" ", "") and "1" in opcao.text:
                    select_serie.select_by_visible_text(opcao.text)
                    logger.info(f"Selecionado série: {opcao.text}")
                    opcao_encontrada = True
                    break
            
            if not opcao_encontrada:
                logger.error("Opção 'Sinal 1' não encontrada no dropdown")
                driver.switch_to.default_content()
                continue
            
            time.sleep(0.5)
            
            # Não selecionar forma de pagamento explicitamente
            
            # Preencher quantidade de parcelas com "1"
            input_qtd = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.ID, "qtd_parcelas"))
            )
            input_qtd.clear()
            input_qtd.send_keys("1")
            logger.info("Preenchido quantidade de parcelas: 1")
            time.sleep(0.5)
            
            # Preencher valor
            input_valor = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.ID, "valor_condicoes"))
            )
            input_valor.clear()
            input_valor.send_keys(f"{valor_pix:.2f}")
            logger.info(f"Preenchido valor: {valor_pix:.2f}")
            time.sleep(0.5)
            
            # Preencher data de vencimento
            input_vencimento = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.ID, "vencimento_condicoes"))
            )
            # Focar no campo primeiro
            driver.execute_script("arguments[0].focus();", input_vencimento)
            time.sleep(0.3)
            
            # Limpar campo com JavaScript (mais confiável)
            driver.execute_script("arguments[0].value = '';", input_vencimento)
            time.sleep(0.3)
            
            # Preencher data caractere por caractere (melhor para campos com máscara)
            for char in data_vencimento:
                input_vencimento.send_keys(char)
                time.sleep(0.05)
            
            logger.info(f"Preenchido vencimento: {data_vencimento}")
            
            # Remover foco do campo de data clicando em outro elemento
            driver.execute_script("document.activeElement.blur();")
            time.sleep(0.5)
            
            # Clicar em submit
            botao_submit = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.ID, "btn_submit"))
            )
            driver.execute_script("arguments[0].click();", botao_submit)
            logger.info("Clicado em submit para salvar série editada")
            time.sleep(2)
            
            # Sair do iframe (aguardar um pouco antes)
            time.sleep(1)
            driver.switch_to.default_content()
            logger.info("Saiu do iframe, primeira série editada com sucesso!")
            
            # Aguardar um pouco para a página atualizar
            time.sleep(2)
            
            return True
            
        except Exception as e:
            logger.error(f"Erro ao editar primeira série (tentativa {tentativa}/{max_tentativas}): {e}")
            save_screenshot_on_error(driver, prefix=f"erro_editar_primeira_serie_tent{tentativa}")
            # Garantir que sai do iframe em caso de erro
            try:
                driver.switch_to.default_content()
            except:
                pass
            
            # Se não for a última tentativa, aguardar antes de tentar novamente
            if tentativa < max_tentativas:
                logger.info(f"Aguardando 3 segundos antes da próxima tentativa...")
                time.sleep(3)
            
    # Se chegou aqui, todas as tentativas falharam
    logger.error("Todas as tentativas de editar primeira série falharam")
    return False


def adicionar_series_plano1(driver: webdriver.Chrome, valor_unidade_total: float, valor_pix: float, dia_vencimento: int = 15) -> bool:
    """
    Adiciona séries para o plano 1 (ou 2) seguindo a regra do negócio:
    - Sinal 1: 1 parcela com valor do PIX (hoje)
    - Sinal 2: 1 parcela de 10%/3, vence 7 dias após Sinal 1
    - Sinal 3: 1 parcela de 10%/3, vence no dia escolhido (05/15/25) do mês seguinte ao Sinal 2
    - Sinal 4: 1 parcela de 10%/3, vence no mesmo dia escolhido do mês seguinte ao Sinal 3
    - PARCELAMENTO INCORPORADORA: 100 parcelas (plano1) ou 48 parcelas (plano2), vence no mesmo dia escolhido do mês seguinte ao Sinal 4
    
    Args:
        driver: WebDriver
        valor_unidade_total: Valor total da unidade
        valor_pix: Valor do PIX (Sinal 1)
        
    Returns:
        True se todas as séries foram adicionadas, False caso contrário
    """
    try:
        import calendar
        from datetime import datetime, timedelta

        # Detectar plano: padrão = 1 (100x), se global 'plano2' = True, então 48x
        plano2 = getattr(adicionar_series_plano1, "plano2", False)
        n_parcelas_parcelamento = 48 if plano2 else 100

        logger.info(f"Iniciando adição de séries para {'Plano 2' if plano2 else 'Plano 1'}...")

        saldo_restante = valor_unidade_total - valor_pix
        valor_dez_porcento = round(saldo_restante * 0.10, 2)
        valor_sinal_234 = round(valor_dez_porcento / 3.0, 2)
        hoje = datetime.now()

        if dia_vencimento not in (5, 15, 25):
            logger.warning(f"dia_vencimento inválido ({dia_vencimento}); usando 15")
            dia_vencimento = 15

        def proximo_mes_no_dia(ref: datetime, dia: int) -> datetime:
            mes = ref.month + 1
            ano = ref.year
            if mes > 12:
                mes = 1
                ano += 1
            ultimo_dia = calendar.monthrange(ano, mes)[1]
            dia_ok = min(dia, ultimo_dia)
            return datetime(ano, mes, dia_ok)

        # PASSO 1: Editar a primeira série existente para transformá-la em Sinal 1 com PIX
        data_sinal1 = hoje.strftime("%d/%m/%Y")
        logger.info(f"[Plano] EDITANDO primeira série para Sinal 1: qtd=1, valor={valor_pix:.2f}, venc={data_sinal1}")
        if not editar_primeira_serie_para_sinal1(driver, valor_pix, data_sinal1):
            logger.error("Falha ao editar primeira série para Sinal 1")
            return False

        # Sinal 2 - vence exatamente 7 dias após Sinal 1 - SEM forma de pagamento
        data_sinal2_obj = hoje + timedelta(days=7)
        data_sinal2 = data_sinal2_obj.strftime("%d/%m/%Y")
        logger.info(f"[Plano] Sinal 2: qtd=1, valor={valor_sinal_234:.2f}, venc={data_sinal2}")
        if not adicionar_serie(driver, "Sinal 2", 1, valor_sinal_234, data_sinal2):
            return False

        # Sinal 3 - no mês seguinte ao Sinal 2, no dia escolhido - SEM forma de pagamento
        data_sinal3_obj = proximo_mes_no_dia(data_sinal2_obj, dia_vencimento)
        data_sinal3 = data_sinal3_obj.strftime("%d/%m/%Y")
        logger.info(f"[Plano] Sinal 3: qtd=1, valor={valor_sinal_234:.2f}, venc={data_sinal3}")
        if not adicionar_serie(driver, "Sinal 3", 1, valor_sinal_234, data_sinal3):
            return False

        # Sinal 4 - no mês seguinte ao Sinal 3, no mesmo dia escolhido - SEM forma de pagamento
        data_sinal4_obj = proximo_mes_no_dia(data_sinal3_obj, dia_vencimento)
        data_sinal4 = data_sinal4_obj.strftime("%d/%m/%Y")
        logger.info(f"[Plano] Sinal 4: qtd=1, valor={valor_sinal_234:.2f}, venc={data_sinal4}")
        if not adicionar_serie(driver, "Sinal 4", 1, valor_sinal_234, data_sinal4):
            return False

        # PARCELAMENTO INCORPORADORA - no mês seguinte ao Sinal 4, no mesmo dia escolhido
        data_parcelamento_obj = proximo_mes_no_dia(data_sinal4_obj, dia_vencimento)
        data_parcelamento = data_parcelamento_obj.strftime("%d/%m/%Y")
        valor_parcelamento_total = saldo_restante - (valor_sinal_234 * 3)
        valor_parcela = round(valor_parcelamento_total / n_parcelas_parcelamento, 2)
        logger.info(f"[Plano] Parcelamento: total={valor_parcelamento_total:.2f}, {n_parcelas_parcelamento}x de {valor_parcela:.2f}, venc={data_parcelamento}, forma=TRANSFERÊNCIA BANCÁRIA")

        if not adicionar_serie(
            driver,
            "PARCELAMENTO INCORPORADORA",
            n_parcelas_parcelamento,
            valor_parcela,
            data_parcelamento,
            "TRANSFERÊNCIA BANCÁRIA"
        ):
            return False

        logger.info("Todas as séries do Plano foram adicionadas com sucesso!")
        return True

    except Exception as e:
        logger.error(f"Erro ao adicionar séries do Plano: {e}")
        return False


def adicionar_series_plano3(driver: webdriver.Chrome, valor_unidade_total: float, valor_pix: float, dia_vencimento: int = 15) -> bool:
    """
    Adiciona séries para o Plano 3 (10% + 100x + 04 Intermediárias de 8,5%)
    """
    try:
        import calendar
        from datetime import datetime, timedelta

        logger.info("Iniciando adição de séries para Plano 3...")

        # Cálculos de valores baseados nas porcentagens do SALDO RESTANTE (Total - Sinal 1)
        saldo_restante = valor_unidade_total - valor_pix
        valor_dez_porcento = round(saldo_restante * 0.10, 2)
        valor_sinal_234 = round(valor_dez_porcento / 3.0, 2)
        
        # Parcelamento único de 100x - 81,5% (100% - 10% - 8,5%)
        valor_p1_total = round(saldo_restante * 0.815, 2)
        valor_parcela_p1 = round(valor_p1_total / 100, 2)
        
        # 4 intermediárias totalizando 8,5% do saldo
        valor_inter_total = round(saldo_restante * 0.085, 2)
        valor_parcela_inter = round(valor_inter_total / 4, 2)

        hoje = datetime.now()

        def proximo_mes_no_dia(ref: datetime, dia: int) -> datetime:
            mes = ref.month + 1
            ano = ref.year
            if mes > 12:
                mes = 1
                ano += 1
            ultimo_dia = calendar.monthrange(ano, mes)[1]
            dia_ok = min(dia, ultimo_dia)
            return datetime(ano, mes, dia_ok)

        # 1. Sinais 1, 2, 3, 4 (Padrão)
        data_sinal1 = hoje.strftime("%d/%m/%Y")
        if not editar_primeira_serie_para_sinal1(driver, valor_pix, data_sinal1):
            return False

        data_sinal2_obj = hoje + timedelta(days=7)
        if not adicionar_serie(driver, "Sinal 2", 1, valor_sinal_234, data_sinal2_obj.strftime("%d/%m/%Y")):
            return False

        data_sinal3_obj = proximo_mes_no_dia(data_sinal2_obj, dia_vencimento)
        if not adicionar_serie(driver, "Sinal 3", 1, valor_sinal_234, data_sinal3_obj.strftime("%d/%m/%Y")):
            return False

        data_sinal4_obj = proximo_mes_no_dia(data_sinal3_obj, dia_vencimento)
        if not adicionar_serie(driver, "Sinal 4", 1, valor_sinal_234, data_sinal4_obj.strftime("%d/%m/%Y")):
            return False

        # 2. Parcelamento Incorporadora (100x) - 81,5%
        data_p1_obj = proximo_mes_no_dia(data_sinal4_obj, dia_vencimento)
        if not adicionar_serie(driver, "PARCELAMENTO INCORPORADORA", 100, valor_parcela_p1, data_p1_obj.strftime("%d/%m/%Y"), "TRANSFERÊNCIA BANCÁRIA"):
            return False

        # 3. Intermediárias (4x) - 8,5% total
        # Datas fixas: 12/2026, 12/2027, 12/2028, 12/2029
        datas_intermediarias = [
            f"{dia_vencimento:02d}/12/2026",
            f"{dia_vencimento:02d}/12/2027",
            f"{dia_vencimento:02d}/12/2028",
            f"{dia_vencimento:02d}/12/2029"
        ]
        
        for idx, data_inter in enumerate(datas_intermediarias, start=1):
            logger.info(f"[Plano3] Intermediária {idx}: qtd=1, valor={valor_parcela_inter:.2f}, venc={data_inter}")
            if not adicionar_serie(driver, "Intermediária", 1, valor_parcela_inter, data_inter):
                return False

        return True
    except Exception as e:
        logger.error(f"Erro ao adicionar séries do Plano 3: {e}")
        return False


def adicionar_series_plano4(driver: webdriver.Chrome, valor_unidade_total: float, valor_pix: float, dia_vencimento: int = 15) -> bool:
    """
    Plano 4 - Pagamento à vista
    - Sinal 1: valor do pix/dinheiro/cartão/cheque (hoje) -> já editado na primeira série
    - Sinal 2: restante (valor_unidade_total - valor_pix) com vencimento 1 mês após Sinal 1
    """
    try:
        from datetime import datetime

        logger.info("Iniciando adição de séries para Plano 4 (À vista)...")

        desconto = round(valor_unidade_total * 0.05, 2)
        valor_total_descontado = round(valor_unidade_total - desconto, 2)
        saldo_restante = round(valor_total_descontado - valor_pix, 2)
        hoje = datetime.now()

        logger.info(f"[Plano4] Valor original={valor_unidade_total:.2f}, desconto={desconto:.2f}, total_com_desconto={valor_total_descontado:.2f}")

        def proximo_mes_no_dia(ref: datetime, dia: int) -> datetime:
            mes = ref.month + 1
            ano = ref.year
            if mes > 12:
                mes = 1
                ano += 1
            ultimo_dia = calendar.monthrange(ano, mes)[1]
            dia_ok = min(dia, ultimo_dia)
            return datetime(ano, mes, dia_ok)

        # Editar primeira série para Sinal 1
        data_sinal1 = hoje.strftime("%d/%m/%Y")
        if not editar_primeira_serie_para_sinal1(driver, valor_pix, data_sinal1):
            logger.error("Falha ao editar primeira série para Sinal 1 (Plano 4)")
            return False

        # Sinal 2 com vencimento um mês depois
        data_sinal2_obj = proximo_mes_no_dia(hoje, dia_vencimento)
        data_sinal2 = data_sinal2_obj.strftime("%d/%m/%Y")
        logger.info(f"[Plano4] Sinal 2: qtd=1, valor={saldo_restante:.2f}, venc={data_sinal2}")
        if not adicionar_serie(driver, "Sinal 2", 1, saldo_restante, data_sinal2):
            return False

        logger.info("Plano 4 aplicado com sucesso")
        return True
    except Exception as e:
        logger.error(f"Erro ao adicionar séries do Plano 4: {e}")
        return False


def adicionar_series_plano5(driver: webdriver.Chrome, valor_unidade_total: float, valor_pix: float, dia_vencimento: int = 15) -> bool:
    """
    Plano 5 - Pagamento à vista em 3x
    - Sinal 1: valor do pix/dinheiro/cartão/cheque (hoje)
    - Sinal 2/3/4: saldo dividido por 3, vencimentos mês a mês
    """
    try:
        from datetime import datetime, timedelta

        logger.info("Iniciando adição de séries para Plano 5 (À vista em 3x)...")

        saldo_restante = round(valor_unidade_total - valor_pix, 2)
        parcela = round((saldo_restante / 3.0), 2)
        hoje = datetime.now()

        def proximo_mes_no_dia(ref: datetime, dia: int) -> datetime:
            mes = ref.month + 1
            ano = ref.year
            if mes > 12:
                mes = 1
                ano += 1
            ultimo_dia = calendar.monthrange(ano, mes)[1]
            dia_ok = min(dia, ultimo_dia)
            return datetime(ano, mes, dia_ok)

        # Editar primeira série para Sinal 1
        data_sinal1 = hoje.strftime("%d/%m/%Y")
        if not editar_primeira_serie_para_sinal1(driver, valor_pix, data_sinal1):
            logger.error("Falha ao editar primeira série para Sinal 1 (Plano 5)")
            return False

        # Sinal 2 - mês seguinte
        data_sinal2_obj = proximo_mes_no_dia(hoje, dia_vencimento)
        if not adicionar_serie(driver, "Sinal 2", 1, parcela, data_sinal2_obj.strftime("%d/%m/%Y")):
            return False

        # Sinal 3 - mês seguinte ao Sinal 2
        data_sinal3_obj = proximo_mes_no_dia(data_sinal2_obj, dia_vencimento)
        if not adicionar_serie(driver, "Sinal 3", 1, parcela, data_sinal3_obj.strftime("%d/%m/%Y")):
            return False

        # Sinal 4 - mês seguinte ao Sinal 3
        data_sinal4_obj = proximo_mes_no_dia(data_sinal3_obj, dia_vencimento)
        if not adicionar_serie(driver, "Sinal 4", 1, parcela, data_sinal4_obj.strftime("%d/%m/%Y")):
            return False

        logger.info("Plano 5 aplicado com sucesso")
        return True
    except Exception as e:
        logger.error(f"Erro ao adicionar séries do Plano 5: {e}")
        return False

def processar_dados_conjuge(driver: webdriver.Chrome, dados_pagamento: Dict = None) -> bool:
    """Avança para a etapa de finalização"""
    logger.info("Avançando para finalização...")
    try:
        botoes_de_avanco = [
            {'xpath': '//*[@id="formulario_cliente"]/div[2]/form/div/input[4]'},
            {'xpath': '//*[@id="form_campo_semcpf"]/div[2]/div/input'},
            {'xpath': '//*[@id="formulario_cliente"]/form/div[4]/input[2]'},
        ]
        
        marcador_pagina_detalhes = EC.presence_of_element_located((By.ID, "idmidia"))
        marcador_pagina_final = EC.presence_of_element_located(
            (By.XPATH, '//*[@id="formulario_formadepagamento"]/div[3]/strong')
        )
        avanco_bem_sucedido = False

        for i, botao_info in enumerate(botoes_de_avanco):
            try:
                botao_para_clicar = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.XPATH, botao_info['xpath']))
                )
                driver.execute_script("arguments[0].click();", botao_para_clicar)
                WebDriverWait(driver, 5).until(
                    EC.any_of(marcador_pagina_detalhes, marcador_pagina_final)
                )
                logger.info(f"Avanço com botão {i+1} bem-sucedido")
                avanco_bem_sucedido = True
                break
            except TimeoutException:
                continue

        if not avanco_bem_sucedido:
            raise Exception("Nenhum botão de avanço funcionou")

        return preencher_formulario_final(driver, dados_pagamento)
    except Exception as e:
        logger.error(f"Falha ao avançar: {e}")
        save_screenshot_on_error(driver, prefix="erro_avanco_final")
        return False


def processar_precadastro(driver: webdriver.Chrome, dados_reserva: Dict) -> Dict:
    """
    Processa um pré-cadastro completo
    
    Args:
        driver: Instância do Selenium WebDriver
        dados_reserva: Dicionário com dados da reserva do Supabase
            - id_pre_cadastro
            - unidade
            - corretor
            - tipo_venda (para automação de séries)
            - plano_padrao
            - valor
        
    Returns:
        Dict com resultado do processamento
    """
    id_precadastro = dados_reserva.get("id_pre_cadastro")
    unidade = dados_reserva.get("unidade")
    corretor = dados_reserva.get("corretor")
    
    resultado = {
        "id_pre_cadastro": id_precadastro,
        "pagamento_id": dados_reserva.get("pagamento_id"),
        "sucesso": False,
        "erro": None,
        "etapa": None
    }
    
    janela_principal = driver.current_window_handle
    
    try:
        if not all([id_precadastro, unidade, corretor]):
            raise ValueError("Dados essenciais faltando (ID, Unidade ou Corretor)")
        
        logger.info(f"Processando ID: {id_precadastro} | Unidade: {unidade} | Plano: {dados_reserva.get('plano_padrao')}")
        
        # Abrir página do pré-cadastro
        url_precadastro = f"{URL_BASE_SISTEMA}comercial/precadastro/{id_precadastro}/administrar"
        driver.get(url_precadastro)
        logger.info("Página de pré-cadastro carregada")

        # Se por algum motivo fomos redirecionados ao login, tentar re-login e recarregar
        if is_logged_out(driver):
            logger.warning("Detectado redirecionamento ao login ao abrir pré-cadastro; tentando re-login...")
            if not ensure_logged_in(driver, attempts=2):
                raise Exception("Não foi possível re-logar ao abrir pré-cadastro")
            # Recarregar a página do pré-cadastro após re-login
            driver.get(url_precadastro)
            time.sleep(1)
        
        # Aprovar pré-cadastro se necessário
        logger.info("Verificando necessidade de aprovação...")
        xpath_botao_aprovar = "//a[contains(@class, '-primario') and normalize-space()='Aprovar']"
        botoes_aprovar = driver.find_elements(By.XPATH, xpath_botao_aprovar)
        
        if botoes_aprovar:
            logger.info("Botão 'Aprovar' encontrado. Clicando...")
            driver.execute_script("arguments[0].click();", botoes_aprovar[0])
            try:
                WebDriverWait(driver, 10).until(EC.alert_is_present())
                alerta = driver.switch_to.alert
                alerta.accept()
                logger.info("Pré-cadastro aprovado!")
            except Exception as e:
                logger.warning(f"Alerta não apareceu: {e}")
            time.sleep(2)
        else:
            logger.info("Pré-cadastro já aprovado")
        
        # Clicar em 'Iniciar Reserva'
        logger.info("Buscando botão 'Iniciar Reserva'...")
        botoes_iniciar = driver.find_elements(By.XPATH, "//a[contains(text(), 'Iniciar Reserva')]")
        if not botoes_iniciar:
            botoes_iniciar = driver.find_elements(By.XPATH, "//a[contains(@class, 'mapadisponibilidade')]")
        
        if botoes_iniciar:
            for botao in botoes_iniciar:
                try:
                    driver.execute_script("arguments[0].scrollIntoView();", botao)
                    driver.execute_script("arguments[0].click();", botao)
                    logger.info("Botão 'Iniciar Reserva' clicado!")
                    time.sleep(2)
                    break
                except Exception as e:
                    logger.warning(f"Falha ao clicar: {e}")
        
        # Trocar para nova janela
        logger.info("Aguardando abertura do mapa...")
        WebDriverWait(driver, 10).until(EC.number_of_windows_to_be(2))
        novas_janelas = [w for w in driver.window_handles if w != janela_principal]
        if not novas_janelas:
            raise Exception("Nova janela não encontrada")
        
        driver.switch_to.window(novas_janelas[0])
        logger.info("Foco na janela do mapa")
        
        # Selecionar unidade
        texto_limpo = unidade.lower().strip()
        xpath_unidade = f"//span[normalize-space(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')) = '{texto_limpo}']/ancestor::div[contains(@class, 'disp-bloco')]"
        unidade_div = WebDriverWait(driver, 20).until(
            EC.element_to_be_clickable((By.XPATH, xpath_unidade))
        )
        driver.execute_script("arguments[0].click();", unidade_div)
        logger.info(f"Unidade '{unidade}' selecionada")
        
        WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable((By.ID, "linkReserva"))
        ).click()
        logger.info("Botão 'Reservar' clicado")
        
        # Selecionar corretor
        if not selecionar_corretor_e_confirmar(driver, corretor):
            raise Exception("Falha na seleção do corretor")
        
        # Extrair dados de pagamento da reserva
        dados_pagamento = {
            "tipo_venda": dados_reserva.get("tipo_venda"),
            "plano_selecionado": dados_reserva.get("plano_padrao"),
            "valor_unidade": dados_reserva.get("valor_unidade"),
            "dia_vencimento": dados_reserva.get("dia_vencimento"),
            "valor": dados_reserva.get("valor"),
            "tipo_pagamento": dados_reserva.get("tipo_pagamento"),
            # Valor do PIX/Sinal 1 explícito quando a reserva veio com pagamento presencial
            "valor_pix": dados_reserva.get("valor") if dados_reserva.get("tipo_pagamento") else None,
        }
        
        logger.info(f"Dados de pagamento: plano={dados_pagamento['plano_selecionado']}, tipo_venda={dados_pagamento['tipo_venda']}, valor_unidade={dados_pagamento['valor_unidade']}, dia_vencimento={dados_pagamento.get('dia_vencimento')}, valor_pix={dados_pagamento['valor_pix']}, valor_bruto={dados_pagamento['valor']}")
        
        # Finalizar com dados de pagamento
        retorno_finalizacao = processar_dados_conjuge(driver, dados_pagamento)
        logger.debug(f"Retorno processar_dados_conjuge: {repr(retorno_finalizacao)}")
        if not retorno_finalizacao:
            raise Exception("Falha no formulário final")

        # Se a finalização retornou o ID da reserva (string com dígitos), armazenar
        try:
            reserva_detectada = None
            if isinstance(retorno_finalizacao, str):
                m = re.search(r"(\d+)", retorno_finalizacao)
                if m:
                    reserva_detectada = m.group(1)
            if reserva_detectada:
                resultado["reserva_id"] = reserva_detectada
                logger.info(f"Reserva criada: {reserva_detectada}")
        except Exception:
            pass

        resultado["sucesso"] = True
        logger.info(f"[SUCESSO] Worker {WORKER_ID} finalizou com sucesso o processamento para ID {id_precadastro}!")
        
    except Exception as e:
        resultado["erro"] = str(e)
        resultado["etapa"] = "Processamento"
        logger.error(f"[ERRO] Worker {WORKER_ID} falhou no processamento do ID {id_precadastro}: {str(e)}")
        save_screenshot_on_error(driver, prefix=f"erro_{id_precadastro}")
    
    finally:
        # Fechar janelas extras e voltar para a principal
        if len(driver.window_handles) > 1:
            try:
                driver.close()
            except NoSuchWindowException:
                pass
        driver.switch_to.window(janela_principal)
    
    return resultado


# ==============================================================================
# --- FUNÇÕES DE INTEGRAÇÃO COM SUPABASE ---
# ==============================================================================
def buscar_reservas_pendentes(supabase: Client) -> List[Dict]:
    """
    Busca pagamentos pendentes de processamento no Supabase
    
    Busca na table pagamentos com status = 'pendente'
    e faz JOIN com a table clientes para obter dados do cliente
    """
    try:
        logger.info("Consultando Supabase por reservas pendentes...")
        
        # Busca pagamentos pendentes com informações do cliente
        response = supabase.table("pagamentos").select(
            "id, cliente_id, unidade, valor_unidade, dia_vencimento, plano_padrao, valor_total, tipo_pagamento, tipo_venda, "
            "clientes(id, id_pre_cadastro, nome, documento, corretor)"
        ).eq("status", "pendente").execute()
        
        # Mapeia os dados para incluir cliente info no resultado
        reservas = []
        for pag in response.data:
            cliente_info = pag.get("clientes", {})
            reserva = {
                "pagamento_id": pag.get("id"),
                "cliente_id": pag.get("cliente_id"),
                "id_pre_cadastro": cliente_info.get("id_pre_cadastro"),
                "cliente_nome": cliente_info.get("nome"),
                "documento": cliente_info.get("documento"),
                "corretor": cliente_info.get("corretor"),
                "unidade": pag.get("unidade"),
                "valor_unidade": pag.get("valor_unidade"),
                "dia_vencimento": pag.get("dia_vencimento"),
                "plano_padrao": pag.get("plano_padrao"),
                "valor": pag.get("valor_total"),
                "tipo_pagamento": pag.get("tipo_pagamento"),
                "tipo_venda": pag.get("tipo_venda"),
            }

            # Fallback: buscar valor da unidade na tabela unidades (prioriza cliente + nome_unidade)
            if reserva["valor_unidade"] is None and reserva["cliente_nome"]:
                try:
                    nome_para_busca = reserva.get("unidade")
                    unidade_resp = None

                    if nome_para_busca:
                        unidade_resp = (
                            supabase.table("unidades")
                            .select("valor, nome_unidade")
                            .eq("cliente", reserva["cliente_nome"])
                            .eq("nome_unidade", nome_para_busca)
                            .maybeSingle()
                            .execute()
                        )

                        if unidade_resp.data is None or unidade_resp.data.get("valor") is None:
                            unidade_resp = (
                                supabase.table("unidades")
                                .select("valor, nome_unidade")
                                .eq("cliente", reserva["cliente_nome"])
                                .maybeSingle()
                                .execute()
                            )
                    else:
                        unidade_resp = (
                            supabase.table("unidades")
                            .select("valor, nome_unidade")
                            .eq("cliente", reserva["cliente_nome"])
                            .maybeSingle()
                            .execute()
                        )

                    unidade_valor = unidade_resp.data.get("valor") if unidade_resp and unidade_resp.data else None
                    if unidade_valor is not None:
                        reserva["valor_unidade"] = float(unidade_valor)
                        logger.info(f"[Queue] valor_unidade obtido de unidades para cliente={reserva['cliente_nome']}, unidade={nome_para_busca}: {reserva['valor_unidade']}")
                except Exception as e:
                    logger.warning(f"[Queue] Falha ao buscar valor_unidade em unidades para cliente={reserva['cliente_nome']}: {e}")

            reservas.append(reserva)
            logger.info(
                f"[Queue] pagamento_id={reserva['pagamento_id']}, cliente={reserva['cliente_nome']}, unidade={reserva['unidade']}, "
                f"valor_unidade={reserva['valor_unidade']}, dia_vencimento={reserva.get('dia_vencimento')}, plano={reserva['plano_padrao']}, valor={reserva['valor']}, tipo_pagamento={reserva['tipo_pagamento']}, tipo_venda={reserva['tipo_venda']}"
            )
        
        logger.info(f"Encontradas {len(reservas)} reservas pendentes de processamento")
        return reservas
    except Exception as e:
        logger.error(f"Erro ao buscar reservas pendentes: {e}")
        return []


def atualizar_status_pagamento(supabase: Client, pagamento_id: str, sucesso: bool, erro: Optional[str] = None, reserva_id: Optional[str] = None):
    """Atualiza o status da reserva na table pagamentos, opcionalmente grava reserva_id"""
    try:
        dados_atualizacao = {
            "status": "processado" if sucesso else "erro",
            "data_processamento": datetime.now().isoformat(),
            "worker_id": WORKER_ID,  # Registra qual worker processou
        }
        
        if erro:
            dados_atualizacao["erro_msg"] = erro
        if reserva_id:
            # Tenta gravar o id da reserva criada no CVCRM (campo 'reserva_id')
            dados_atualizacao["reserva_id"] = reserva_id
        
        supabase.table("pagamentos").update(dados_atualizacao).eq("id", pagamento_id).execute()
        logger.info(f"Pagamento {pagamento_id} atualizado por Worker {WORKER_ID}: {'processado' if sucesso else 'erro'} (reserva_id={reserva_id})")
    except Exception as e:
        logger.error(f"Erro ao atualizar status do pagamento: {e}")


def notify_backend_status(pagamento_id: str, unidade: Optional[str], sucesso: bool = None, rowIndex: Optional[int] = None, implantacao: Optional[str] = None, reserva_id: Optional[str] = None, status_override: Optional[str] = None):
    """Notifica o backend interno para que ele possa broadcastar o status via SSE.

    Usa as variáveis de ambiente `BACKEND_INTERNAL_URL` (ou `BACKEND_URL`) e opcionalmente
    `INTERNAL_NOTIFY_SECRET` para autenticação.
    
    Args:
        sucesso: True=processado, False=erro, None=processando (quando status_override não é fornecido)
        status_override: Se fornecido, sobrescreve a lógica de status baseada em sucesso
    """
    try:
        base = os.getenv("BACKEND_INTERNAL_URL") or os.getenv("BACKEND_URL") or "http://localhost:3000"
        url = base.rstrip("/") + "/internal/notify-payment-processed"
        headers = {"Content-Type": "application/json"}
        secret = os.getenv("INTERNAL_NOTIFY_SECRET")
        if secret:
            headers["x-internal-secret"] = secret

        # Determina o status a enviar
        if status_override:
            final_status = status_override
        elif sucesso is True:
            final_status = "processado"
        elif sucesso is False:
            final_status = "erro"
        else:
            final_status = "processando"

        payload = {
            "pagamento_id": pagamento_id,
            "unidade": unidade,
            "status": final_status,
            "worker_id": WORKER_ID,
        }
        if rowIndex:
            payload["rowIndex"] = int(rowIndex)
        if implantacao:
            payload["implantacao"] = implantacao
        if reserva_id:
            payload["reserva_id"] = reserva_id
            try:
                payload["reserva_url"] = f"{URL_BASE_SISTEMA}comercial/reservas/{reserva_id}/administrar"
            except Exception:
                pass

        try:
            logger.info(f"notify_backend_status -> POST {url} payload={payload}")
            resp = requests.post(url, json=payload, headers=headers, timeout=5)
            logger.info(f"Notified backend of payment {pagamento_id}: {resp.status_code}")
        except requests.RequestException as e:
            logger.warning(f"Falha ao notificar backend para pagamento {pagamento_id}: {e}")
    except Exception as e:
        logger.error(f"Erro em notify_backend_status: {e}")


# ==============================================================================
# --- PROCESSAMENTO DE JOBS (REDIS) ---
# ==============================================================================
def processar_reserva_job(driver: webdriver.Chrome, supabase: Client, job_data: Dict):
    """Processa um job específico vindo da fila"""
    pagamento_id = job_data.get("pagamento_id")
    
    try:
        # Buscar dados atualizados no Supabase
        response = supabase.table("pagamentos").select(
            "id, cliente_id, unidade, valor_unidade, dia_vencimento, plano_padrao, valor_total, tipo_pagamento, tipo_venda, "
            "clientes(id, id_pre_cadastro, nome, documento, corretor)"
        ).eq("id", pagamento_id).single().execute()
        
        pag = response.data
        if not pag:
            logger.error(f"Pagamento {pagamento_id} não encontrado no banco.")
            return

        cliente_info = pag.get("clientes", {})
        unidade = pag.get("unidade")
        
        # NOVO: Buscar nome da implantação para log inicial
        implantacao_name = None
        try:
            if supabase and unidade:
                resp = supabase.table("unidades").select("implantacao_id").ilike("nome_unidade", f"%{unidade}%").limit(1).execute()
                unidade_row = None
                if resp and getattr(resp, 'data', None):
                    if isinstance(resp.data, list) and len(resp.data) > 0:
                        unidade_row = resp.data[0]
                    elif isinstance(resp.data, dict):
                        unidade_row = resp.data
                
                if unidade_row and unidade_row.get("implantacao_id"):
                    impl_resp = supabase.table("implantacoes").select("nome").eq("id", unidade_row["implantacao_id"]).limit(1).execute()
                    if impl_resp and getattr(impl_resp, 'data', None):
                        if isinstance(impl_resp.data, list) and len(impl_resp.data) > 0:
                            implantacao_name = impl_resp.data[0].get("nome")
                        elif isinstance(impl_resp.data, dict):
                            implantacao_name = impl_resp.data.get("nome")
        except Exception as e:
            logger.debug(f"Não foi possível buscar implantação: {e}")
        
        # LOG INICIAL: Notifica backend que começou o processamento
        logger.info(f"====== WORKER INICIOU PROCESSAMENTO ======")
        logger.info(f"Worker: {WORKER_ID}")
        logger.info(f"Pagamento ID: {pagamento_id}")
        logger.info(f"Unidade: {unidade or 'N/A'}")
        logger.info(f"Cliente: {cliente_info.get('nome') or 'N/A'}")
        logger.info(f"Implantação: {implantacao_name or 'N/A'}")
        logger.info(f"==========================================")
        
        # Notifica backend que processamento iniciou (status 'processando')
        try:
            notify_backend_status(pagamento_id, unidade, None, implantacao=implantacao_name, reserva_id=None, status_override="processando")
        except Exception as e:
            logger.debug(f"Falha ao notificar início: {e}")
        
        # Montar objeto de reserva
        dados_reserva = {
            "pagamento_id": pag.get("id"),
            "id_pre_cadastro": cliente_info.get("id_pre_cadastro"),
            "cliente_nome": cliente_info.get("nome"),
            "corretor": cliente_info.get("corretor"),
            "unidade": pag.get("unidade"),
            "valor_unidade": pag.get("valor_unidade"),
            "dia_vencimento": pag.get("dia_vencimento"),
            "plano_padrao": pag.get("plano_padrao"),
            "valor": pag.get("valor_total"),
            "tipo_pagamento": pag.get("tipo_pagamento"),
            "tipo_venda": pag.get("tipo_venda"),
        }

        # Garantir estado limpo (voltar para home) antes de começar
        driver.get(URL_BASE_SISTEMA)
        # Se a navegação redirecionou para login, tentar re-login
        if is_logged_out(driver):
            logger.info("Sessão expirada antes de processar job; tentando re-login...")
            if not fazer_login(driver, CVCRM_EMAIL, CVCRM_SENHA):
                raise Exception("Re-login automático falhou antes de processar job")

        # Chamar a função de automação existente
        resultado = processar_precadastro(driver, dados_reserva)
        
        # Atualizar status no Supabase (inclui reserva_id se disponível)
        atualizar_status_pagamento(supabase, pagamento_id, resultado["sucesso"], resultado.get("erro"), reserva_id=resultado.get("reserva_id"))
        # Notificar backend para broadcast SSE (se configurado)
        try:
            unidade_notify = dados_reserva.get("unidade") or (pag and pag.get("unidade"))
            # Try to infer implantacao name and rowIndex to allow backend to write history in the correct sheet
            implantacao_name = None
            row_index_val = None
            try:
                if supabase:
                    # Try to find unidade row (use ilike for permissive match)
                    resp = supabase.table("unidades").select("implantacao_id, nome_unidade").ilike("nome_unidade", f"%{unidade_notify}%").limit(1).execute()
                    unidade_row = None
                    if resp and getattr(resp, 'data', None):
                        # resp.data may be a list
                        if isinstance(resp.data, list) and len(resp.data) > 0:
                            unidade_row = resp.data[0]
                        elif isinstance(resp.data, dict):
                            unidade_row = resp.data

                    if unidade_row:
                        implantacao_id = unidade_row.get("implantacao_id")
                        # rowIndex fields are not reliably present in the 'unidades' table; keep row_index lookup optional
                        # if the deployment has a custom column for the sheet row, add it to the select above.
                        if unidade_row.get("row_index"):
                            row_index_val = unidade_row.get("row_index")

                        if implantacao_id:
                            try:
                                impl_resp = supabase.table("implantacoes").select("nome").eq("id", implantacao_id).limit(1).execute()
                                if impl_resp and getattr(impl_resp, 'data', None):
                                    if isinstance(impl_resp.data, list) and len(impl_resp.data) > 0:
                                        implantacao_name = impl_resp.data[0].get("nome")
                                    elif isinstance(impl_resp.data, dict):
                                        implantacao_name = impl_resp.data.get("nome")
                            except Exception:
                                implantacao_name = None
            except Exception:
                implantacao_name = None

            notify_backend_status(pagamento_id, unidade_notify, resultado["sucesso"], rowIndex=row_index_val, implantacao=implantacao_name, reserva_id=resultado.get("reserva_id"))
        except Exception as e:
            logger.warning(f"Falha ao notificar backend após atualizar status do pagamento {pagamento_id}: {e}")
        
    except Exception as e:
        logger.error(f"[ERRO JOB] Worker {WORKER_ID} falhou ao processar job {pagamento_id}: {e}")
        atualizar_status_pagamento(supabase, pagamento_id, False, str(e), reserva_id=None)
        try:
            unidade_notify = None
            try:
                unidade_notify = pag.get("unidade") if pag else None
            except Exception:
                unidade_notify = None
            notify_backend_status(pagamento_id, unidade_notify, False, reserva_id=None)
        except Exception as _:
            pass


# ==============================================================================
# --- SESSÃO / LOGIN HELPERS ---
# ==============================================================================
def is_logged_out(driver: webdriver.Chrome) -> bool:
    """Verifica rapidamente se a página de login está presente.

    Retorna True se o botão de login (xpath '//*[@id="formLogin"]/button')
    estiver presente e visível, indicando que a sessão foi deslogada.
    """
    try:
        # 1) Presença do botão do formulário de login
        try:
            elems = driver.find_elements(By.XPATH, '//*[@id="formLogin"]/button')
            for e in elems:
                try:
                    if e.is_displayed():
                        return True
                except Exception:
                    continue
        except Exception:
            pass

        # 2) Campos de email/senha visíveis
        try:
            email_fields = driver.find_elements(By.ID, "email")
            for f in email_fields:
                try:
                    if f.is_displayed():
                        return True
                except Exception:
                    continue
        except Exception:
            pass

        try:
            senha_fields = driver.find_elements(By.ID, "senha")
            for f in senha_fields:
                try:
                    if f.is_displayed():
                        return True
                except Exception:
                    continue
        except Exception:
            pass

        # 3) URL indicando rota de login (fallback)
        try:
            url = driver.current_url
            if url and ("/login" in url or "/entrar" in url or "/formLogin" in url):
                return True
        except Exception:
            pass

        return False
    except Exception:
        return False


def ensure_logged_in(driver: webdriver.Chrome, attempts: int = 1) -> bool:
    """Tenta garantir que a sessão esteja ativa; realiza re-login se necessário.

    Retorna True se estiver logado após a verificação/tentativas, False caso contrário.
    """
    try:
        if not is_logged_out(driver):
            return True

        logger.info("Tela de login detectada — iniciando re-login automático")
        for i in range(attempts):
            try:
                if fazer_login(driver, CVCRM_EMAIL, CVCRM_SENHA):
                    time.sleep(1)
                    if not is_logged_out(driver):
                        logger.info("Re-login automático bem-sucedido")
                        return True
            except Exception as e:
                logger.warning(f"Tentativa {i+1} de re-login falhou: {e}")

        logger.error("Não foi possível recuperar sessão via re-login automático")
        return False
    except Exception as e:
        logger.error(f"Erro em ensure_logged_in: {e}")
        return False


# ==============================================================================
# --- WORKER PRINCIPAL ---
# ==============================================================================
def main():
    logger.info("Iniciando Worker de Automação (Docker)...")
    
    if not CVCRM_EMAIL or not CVCRM_SENHA:
        logger.error("Credenciais CVCRM não configuradas.")
        return
    
    supabase = get_supabase_client()
    redis_client = get_redis_client()
    
    driver = None
    
    while True:
        try:
            # 1. Inicializar Driver se não existir
            if driver is None:
                driver = criar_driver_headless()
                if not fazer_login(driver, CVCRM_EMAIL, CVCRM_SENHA):
                    logger.error("Falha crítica no login. Tentando novamente em 60s...")
                    driver.quit()
                    driver = None
                    time.sleep(60)
                    continue
            
            # 2. Verificar se a sessão ainda está viva
            try:
                _ = driver.title
            except Exception:
                logger.warning("Sessão do navegador perdida. Reiniciando...")
                try:
                    driver.quit()
                except:
                    pass
                driver = None
                continue

            # 3. Aguardar Job na Fila (Blocking Pop)
            # Timeout de 30s para permitir verificar a saúde do driver periodicamente
            logger.info(f"Aguardando jobs na fila '{QUEUE_NAME}'...")
            item = redis_client.blpop(QUEUE_NAME, timeout=30)
            
            if item:
                # item é uma tupla (nome_fila, dados)
                _, dados_json = item
                job_data = json.loads(dados_json)
                logger.info(f"[JOB CAPTURADO] Worker {WORKER_ID} pegou o job: {job_data}")

                # Verificar se estamos na página de login (sessão deslogada)
                try:
                    if is_logged_out(driver):
                        logger.info("Sessão detectada como deslogada. Efetuando login novamente...")
                        if not fazer_login(driver, CVCRM_EMAIL, CVCRM_SENHA):
                            logger.error("Re-login falhou. Reiniciando driver e aguardando 60s...")
                            try:
                                driver.quit()
                            except Exception:
                                pass
                            driver = None
                            time.sleep(60)
                            continue
                except Exception as e:
                    logger.warning(f"Erro ao checar/realizar re-login automático: {e}")

                processar_reserva_job(driver, supabase, job_data)
            else:
                # Timeout do blpop, apenas volta para o início do loop
                pass

        except redis.exceptions.ConnectionError:
            logger.error("Erro de conexão com Redis. Tentando reconectar em 5s...")
            time.sleep(5)
        except Exception as e:
            logger.error(f"Erro não tratado no loop principal: {e}")
            try:
                logger.error(traceback.format_exc())
            except:
                pass
            # Tenta salvar screenshot para ajudar no debug
            try:
                save_screenshot_on_error(driver, prefix="loop_unhandled")
            except Exception:
                pass
            time.sleep(5)
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass
                driver = None


# ==============================================================================
# --- EXECUÇÃO ---
# ==============================================================================
if __name__ == "__main__":
    main()
