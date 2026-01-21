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

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('worker_automacao.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


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
            
            # Adicionar séries baseado no plano (tipo de venda será selecionado depois)
            if plano_selecionado == "plano1":
                if valor_unidade_total is None:
                    logger.warning("Valor total da unidade não disponível; não é possível calcular Plano 1 corretamente")
                else:
                    setattr(adicionar_series_plano1, "plano2", False)
                    if not adicionar_series_plano1(driver, valor_unidade_total, valor_pix, dia_vencimento=dia_vencimento):
                        logger.warning("Falha ao adicionar séries do plano 1")
            elif plano_selecionado == "plano2":
                if valor_unidade_total is None:
                    logger.warning("Valor total da unidade não disponível; não é possível calcular Plano 2 corretamente")
                else:
                    setattr(adicionar_series_plano1, "plano2", True)
                    if not adicionar_series_plano1(driver, valor_unidade_total, valor_pix, dia_vencimento=dia_vencimento):
                        logger.warning("Falha ao adicionar séries do plano 2")
            elif plano_selecionado == "plano3":
                if valor_unidade_total is None:
                    logger.warning("Valor total da unidade não disponível; não é possível calcular Plano 3")
                elif not adicionar_series_plano3(driver, valor_unidade_total, valor_pix, dia_vencimento=dia_vencimento):
                    logger.warning("Falha ao adicionar séries do plano 3")
            elif plano_selecionado == "plano4":
                if valor_unidade_total is None:
                    logger.warning("Valor total da unidade não disponível; não é possível calcular Plano 4")
                else:
                    if not adicionar_series_plano4(driver, valor_unidade_total, valor_pix, dia_vencimento=dia_vencimento):
                        logger.warning("Falha ao adicionar séries do plano 4")
            elif plano_selecionado == "plano5":
                if valor_unidade_total is None:
                    logger.warning("Valor total da unidade não disponível; não é possível calcular Plano 5")
                else:
                    if not adicionar_series_plano5(driver, valor_unidade_total, valor_pix, dia_vencimento=dia_vencimento):
                        logger.warning("Falha ao adicionar séries do plano 5")
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
        logger.info("Formulário finalizado com sucesso!")
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
    try:
        logger.info("Editando primeira série existente para Sinal 1...")
        
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
            return False
        
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
        logger.error(f"Erro ao editar primeira série: {e}")
        save_screenshot_on_error(driver, prefix="erro_editar_primeira_serie")
        # Garantir que sai do iframe em caso de erro
        try:
            driver.switch_to.default_content()
        except:
            pass
        return False


def adicionar_series_plano1(driver: webdriver.Chrome, valor_unidade_total: float, valor_pix: float, dia_vencimento: int = 15) -> bool:
    """
    Adiciona séries para o plano 1 (ou 2) seguindo a regra do negócio:
    - Sinal 1: 1 parcela com valor do PIX (hoje)
    - Sinal 2: 1 parcela de 10%/3, vence 7 dias após Sinal 1
    - Sinal 3: 1 parcela de 10%/3, vence no dia escolhido (05/15/25) do mês seguinte ao Sinal 2
    - Sinal 4: 1 parcela de 10%/3, vence no mesmo dia escolhido do mês seguinte ao Sinal 3
    - PARCELAMENTO INCORPORADORA: 100 parcelas (plano1) ou 36 parcelas (plano2), vence no mesmo dia escolhido do mês seguinte ao Sinal 4
    
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

        # Detectar plano: padrão = 1 (100x), se global 'plano2' = True, então 36x
        plano2 = getattr(adicionar_series_plano1, "plano2", False)
        n_parcelas_parcelamento = 36 if plano2 else 100

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
    Adiciona séries para o Plano 3 (10% + 36x + 03 Intermediárias + 64x)
    """
    try:
        import calendar
        from datetime import datetime, timedelta

        logger.info("Iniciando adição de séries para Plano 3...")

        # Cálculos de valores baseados nas porcentagens do SALDO RESTANTE (Total - Sinal 1)
        saldo_restante = valor_unidade_total - valor_pix
        valor_dez_porcento = round(saldo_restante * 0.10, 2)
        valor_sinal_234 = round(valor_dez_porcento / 3.0, 2)
        
        valor_p1_total = round(saldo_restante * 0.24, 2)
        valor_parcela_p1 = round(valor_p1_total / 36, 2)
        
        valor_inter_total = round(saldo_restante * 0.08, 2)
        valor_parcela_inter = round(valor_inter_total / 3, 2)
        
        # O último parcelamento deve ser o saldo restante para fechar a conta
        valor_p2_total = saldo_restante - (valor_sinal_234 * 3) - valor_p1_total - valor_inter_total
        valor_parcela_p2 = round(valor_p2_total / 64, 2)

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

        # 2. Parcelamento Incorporadora 1 (36x) - 24%
        data_p1_obj = proximo_mes_no_dia(data_sinal4_obj, dia_vencimento)
        if not adicionar_serie(driver, "PARCELAMENTO INCORPORADORA", 36, valor_parcela_p1, data_p1_obj.strftime("%d/%m/%Y"), "TRANSFERÊNCIA BANCÁRIA"):
            return False

        # 3. Intermediária (3x) - 8%
        # Regra: Data de vencimento definida no seletor + 1 ano após o vencimento do Sinal 4
        # data_sinal4_obj já respeita o dia_vencimento
        data_inter_obj = data_sinal4_obj.replace(year=data_sinal4_obj.year + 1)
        if not adicionar_serie(driver, "Intermediária", 3, valor_parcela_inter, data_inter_obj.strftime("%d/%m/%Y")):
            return False

        # 4. Parcelamento Incorporadora 2 (64x) - 58% - Começa após o fim do P1 (36 meses depois)
        data_p2_obj = data_p1_obj
        for _ in range(36):
            data_p2_obj = proximo_mes_no_dia(data_p2_obj, dia_vencimento)
            
        if not adicionar_serie(driver, "PARCELAMENTO INCORPORADORA", 64, valor_parcela_p2, data_p2_obj.strftime("%d/%m/%Y"), "TRANSFERÊNCIA BANCÁRIA"):
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
        if not processar_dados_conjuge(driver, dados_pagamento):
            raise Exception("Falha no formulário final")
        
        resultado["sucesso"] = True
        logger.info(f"SUCESSO TOTAL para o ID {id_precadastro}!")
        
    except Exception as e:
        resultado["erro"] = str(e)
        resultado["etapa"] = "Processamento"
        logger.error(f"ERRO no ID {id_precadastro}: {str(e)}")
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


def atualizar_status_pagamento(supabase: Client, pagamento_id: str, sucesso: bool, erro: Optional[str] = None):
    """Atualiza o status da reserva na table pagamentos"""
    try:
        dados_atualizacao = {
            "status": "processado" if sucesso else "erro",
            "data_processamento": datetime.now().isoformat(),
        }
        
        if erro:
            dados_atualizacao["erro_msg"] = erro
        
        supabase.table("pagamentos").update(dados_atualizacao).eq("id", pagamento_id).execute()
        logger.info(f"Pagamento {pagamento_id} atualizado: {'processado' if sucesso else 'erro'}")
    except Exception as e:
        logger.error(f"Erro ao atualizar status do pagamento: {e}")


# ==============================================================================
# --- PROCESSAMENTO DE JOBS (REDIS) ---
# ==============================================================================
def processar_reserva_job(driver: webdriver.Chrome, supabase: Client, job_data: Dict):
    """Processa um job específico vindo da fila"""
    pagamento_id = job_data.get("pagamento_id")
    logger.info(f"Iniciando processamento do pagamento ID: {pagamento_id}")
    
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
        
        # Chamar a função de automação existente
        resultado = processar_precadastro(driver, dados_reserva)
        
        # Atualizar status no Supabase
        atualizar_status_pagamento(supabase, pagamento_id, resultado["sucesso"], resultado.get("erro"))
        
    except Exception as e:
        logger.error(f"Erro ao processar job {pagamento_id}: {e}")
        atualizar_status_pagamento(supabase, pagamento_id, False, str(e))


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
                logger.info(f"Job recebido: {job_data}")
                
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
