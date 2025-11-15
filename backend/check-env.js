#!/usr/bin/env node

/**
 * Script de verificação de configuração do backend
 * Execute: node check-env.js
 */

require('dotenv').config()

const chalk = require('chalk')
const fs = require('fs')
const path = require('path')

console.log(chalk.blue.bold('\n🔍 Verificação de Configuração do Backend\n'))
console.log('='.repeat(60))

// Função auxiliar para verificar variável
function checkEnvVar(name, description) {
  const value = process.env[name]
  const exists = !!value

  console.log(
    exists ? chalk.green('✓') : chalk.red('✗'),
    chalk.bold(name),
    chalk.gray(`- ${description}`)
  )

  if (
    (exists && name.includes('TOKEN')) ||
    name.includes('KEY') ||
    name.includes('PASSWORD')
  ) {
    console.log(chalk.gray(`  → Valor: ${value.substring(0, 20)}...`))
  } else if (exists) {
    console.log(chalk.gray(`  → Valor: ${value}`))
  } else {
    console.log(chalk.red(`  → Não configurado!`))
  }

  return exists
}

// Verificar arquivos necessários
console.log(chalk.yellow.bold('\n📁 Arquivos Necessários:\n'))

const files = [
  { path: '.env', description: 'Variáveis de ambiente' },
  { path: 'credentials.json', description: 'Credenciais Google Sheets' },
  { path: 'server.cjs', description: 'Servidor principal' },
  { path: 'package.json', description: 'Dependências do projeto' },
]

let allFilesExist = true
files.forEach(({ path: filePath, description }) => {
  const exists = fs.existsSync(path.join(__dirname, filePath))
  allFilesExist = allFilesExist && exists

  console.log(
    exists ? chalk.green('✓') : chalk.red('✗'),
    chalk.bold(filePath),
    chalk.gray(`- ${description}`)
  )
})

// Verificar variáveis de ambiente
console.log(chalk.yellow.bold('\n🔐 Variáveis de Ambiente:\n'))

const requiredVars = [
  { name: 'SUPABASE_URL', description: 'URL do Supabase' },
  {
    name: 'SUPABASE_SERVICE_ROLE',
    description: 'Chave Service Role do Supabase',
  },
  { name: 'PORT', description: 'Porta do servidor' },
  { name: 'ADMIN_PASSWORD', description: 'Senha administrativa' },
  { name: 'CVCRM_API_BASE_URL', description: 'URL base da API CVCRM' },
  { name: 'CVCRM_API_EMAIL', description: 'Email da API CVCRM' },
  { name: 'CVCRM_API_TOKEN', description: 'Token da API CVCRM' },
  { name: 'BOTMAKER_ACCESS_TOKEN', description: 'Token de acesso Botmaker' },
]

let allVarsExist = true
requiredVars.forEach(({ name, description }) => {
  const exists = checkEnvVar(name, description)
  allVarsExist = allVarsExist && exists
})

// Testar conexão com Supabase
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE) {
  console.log(chalk.yellow.bold('\n🌐 Teste de Conexão Supabase:\n'))

  const { createClient } = require('@supabase/supabase-js')

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    )

    console.log(chalk.green('✓'), 'Cliente Supabase criado com sucesso')

    // Tentar uma query simples
    supabase
      .from('implantacoes')
      .select('count')
      .limit(1)
      .then(({ data, error }) => {
        if (error) {
          console.log(
            chalk.red('✗'),
            'Erro ao conectar com Supabase:',
            error.message
          )
        } else {
          console.log(chalk.green('✓'), 'Conexão com Supabase estabelecida')
        }
      })
  } catch (error) {
    console.log(
      chalk.red('✗'),
      'Erro ao criar cliente Supabase:',
      error.message
    )
  }
}

// Verificar credentials.json
if (fs.existsSync(path.join(__dirname, 'credentials.json'))) {
  console.log(chalk.yellow.bold('\n📄 Verificação do credentials.json:\n'))

  try {
    const credentials = require('./credentials.json')

    console.log(
      credentials.client_email ? chalk.green('✓') : chalk.red('✗'),
      'client_email:',
      chalk.gray(credentials.client_email || 'Não encontrado')
    )

    console.log(
      credentials.private_key ? chalk.green('✓') : chalk.red('✗'),
      'private_key:',
      chalk.gray(credentials.private_key ? 'Presente' : 'Ausente')
    )
  } catch (error) {
    console.log(chalk.red('✗'), 'Erro ao ler credentials.json:', error.message)
  }
}

// Resumo final
console.log(chalk.yellow.bold('\n📊 Resumo:\n'))

if (allFilesExist && allVarsExist) {
  console.log(
    chalk.green.bold(
      '✓ Configuração completa! O servidor deve funcionar corretamente.'
    )
  )
} else {
  console.log(
    chalk.red.bold(
      '✗ Configuração incompleta! Verifique os itens marcados acima.'
    )
  )
  console.log(chalk.yellow('\nPara corrigir:'))
  console.log(
    '1. Certifique-se que o arquivo .env existe e contém todas as variáveis'
  )
  console.log('2. Verifique se credentials.json está presente na pasta backend')
  console.log('3. Execute: npm install (se houver dependências faltando)')
}

console.log('\n' + '='.repeat(60) + '\n')
