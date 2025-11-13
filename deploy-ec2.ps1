# Script PowerShell para Deploy na AWS EC2
# Execute este script no seu PowerShell local

param(
    [string]$EC2_IP = "",
    [string]$KEY_PATH = "",
    [string]$ACTION = "deploy"
)

$GREEN = "`e[32m"
$YELLOW = "`e[33m"
$RED = "`e[31m"
$RESET = "`e[0m"

function Write-Header {
    param([string]$Message)
    Write-Host "`n$GREEN═══════════════════════════════════════════════════════════$RESET"
    Write-Host "$GREEN$Message$RESET"
    Write-Host "$GREEN═══════════════════════════════════════════════════════════$RESET`n"
}

function Write-Step {
    param([string]$Step, [string]$Message)
    Write-Host "$YELLOW[$Step]$RESET $Message"
}

# Se não passou IP e KEY, pedir
if (-not $EC2_IP -or -not $KEY_PATH) {
    Write-Header "Deploy Backend para AWS EC2"
    
    if (-not $EC2_IP) {
        $EC2_IP = Read-Host "Digite o IP público da instância EC2"
    }
    
    if (-not $KEY_PATH) {
        $KEY_PATH = Read-Host "Digite o caminho da chave .pem"
    }
    
    if (-not $ACTION) {
        Write-Host "Ações disponíveis: deploy, upload-env, upload-creds, logs, restart, stop, status"
        $ACTION = Read-Host "Qual ação deseja executar? (padrão: deploy)"
        if (-not $ACTION) { $ACTION = "deploy" }
    }
}

# Verificar se a chave existe
if (-not (Test-Path $KEY_PATH)) {
    Write-Host "$RED✗ Arquivo .pem não encontrado em: $KEY_PATH$RESET"
    exit 1
}

# Dar permissão ao arquivo .pem
$acl = Get-Acl $KEY_PATH
$acl.SetAccessRuleProtection($true, $false)
Set-Acl $KEY_PATH $acl

$accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "$env:USERNAME",
    "FullControl",
    "Allow"
)
$acl.SetAccessRule($accessRule)
Set-Acl $KEY_PATH $acl

Write-Host "$GREEN✓ Permissões do arquivo .pem configuradas$RESET"

# URL base para SSH
$SSH_URL = "ubuntu@$EC2_IP"
$SSH_OPTS = "-i `"$KEY_PATH`" -o StrictHostKeyChecking=no -o ConnectTimeout=5"

switch ($ACTION.ToLower()) {
    "deploy" {
        Write-Header "Deploy Completo"
        
        Write-Step "1/3" "Conectando à EC2 e executando setup..."
        ssh $SSH_OPTS $SSH_URL "bash -s" < ".\deploy-ec2.sh"
        
        Write-Step "2/3" "Upload do arquivo .env..."
        if (Test-Path ".\backend\.env") {
            scp -i $KEY_PATH -o StrictHostKeyChecking=no ".\backend\.env" "${SSH_URL}:/home/ubuntu/projects/telao-digital/backend/"
            Write-Host "$GREEN✓ .env enviado com sucesso$RESET"
        } else {
            Write-Host "$YELLOW⚠ Arquivo .env não encontrado em .\backend\.env$RESET"
        }
        
        Write-Step "3/3" "Upload do credentials.json..."
        if (Test-Path ".\backend\credentials.json") {
            scp -i $KEY_PATH -o StrictHostKeyChecking=no ".\backend\credentials.json" "${SSH_URL}:/home/ubuntu/projects/telao-digital/backend/"
            Write-Host "$GREEN✓ credentials.json enviado com sucesso$RESET"
        } else {
            Write-Host "$YELLOW⚠ Arquivo credentials.json não encontrado em .\backend\credentials.json$RESET"
        }
        
        Write-Step "4/3" "Reiniciando servidor..."
        ssh $SSH_OPTS $SSH_URL "pm2 restart simulador-backend"
        
        Write-Header "✓ Deploy Concluído!"
        Write-Host "Seu backend está rodando em: $GREEN http://$EC2_IP:3000 $RESET"
    }
    
    "upload-env" {
        Write-Step "1/1" "Upload do arquivo .env..."
        if (Test-Path ".\backend\.env") {
            scp -i $KEY_PATH -o StrictHostKeyChecking=no ".\backend\.env" "${SSH_URL}:/home/ubuntu/projects/telao-digital/backend/"
            Write-Host "$GREEN✓ .env enviado com sucesso$RESET"
            ssh $SSH_OPTS $SSH_URL "pm2 restart simulador-backend"
            Write-Host "$GREEN✓ Servidor reiniciado$RESET"
        } else {
            Write-Host "$RED✗ Arquivo .env não encontrado$RESET"
            exit 1
        }
    }
    
    "upload-creds" {
        Write-Step "1/1" "Upload do credentials.json..."
        if (Test-Path ".\backend\credentials.json") {
            scp -i $KEY_PATH -o StrictHostKeyChecking=no ".\backend\credentials.json" "${SSH_URL}:/home/ubuntu/projects/telao-digital/backend/"
            Write-Host "$GREEN✓ credentials.json enviado com sucesso$RESET"
            ssh $SSH_OPTS $SSH_URL "pm2 restart simulador-backend"
            Write-Host "$GREEN✓ Servidor reiniciado$RESET"
        } else {
            Write-Host "$RED✗ Arquivo credentials.json não encontrado$RESET"
            exit 1
        }
    }
    
    "logs" {
        Write-Header "Logs do Backend"
        ssh $SSH_OPTS $SSH_URL "pm2 logs simulador-backend --lines 50"
    }
    
    "status" {
        Write-Header "Status do Backend"
        ssh $SSH_OPTS $SSH_URL "pm2 status"
    }
    
    "restart" {
        Write-Step "1/1" "Reiniciando servidor..."
        ssh $SSH_OPTS $SSH_URL "pm2 restart simulador-backend"
        Write-Host "$GREEN✓ Servidor reiniciado$RESET"
    }
    
    "stop" {
        Write-Step "1/1" "Parando servidor..."
        ssh $SSH_OPTS $SSH_URL "pm2 stop simulador-backend"
        Write-Host "$GREEN✓ Servidor parado$RESET"
    }
    
    "pull" {
        Write-Step "1/2" "Atualizando código..."
        ssh $SSH_OPTS $SSH_URL "cd ~/projects/telao-digital && git pull origin main"
        Write-Step "2/2" "Reinstalando dependências..."
        ssh $SSH_OPTS $SSH_URL "cd ~/projects/telao-digital/backend && npm install && pm2 restart simulador-backend"
        Write-Host "$GREEN✓ Código atualizado e servidor reiniciado$RESET"
    }
    
    default {
        Write-Host "$RED✗ Ação desconhecida: $ACTION$RESET"
        Write-Host "`nAções disponíveis:"
        Write-Host "  deploy         - Deploy completo"
        Write-Host "  upload-env     - Enviar apenas .env"
        Write-Host "  upload-creds   - Enviar apenas credentials.json"
        Write-Host "  logs           - Ver logs"
        Write-Host "  status         - Ver status"
        Write-Host "  restart        - Reiniciar servidor"
        Write-Host "  stop           - Parar servidor"
        Write-Host "  pull           - Atualizar código"
        exit 1
    }
}

Write-Host "`n$GREEN✓ Operação concluída!$RESET`n"
