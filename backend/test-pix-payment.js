/**
 * Script de teste para simular pagamento de PIX
 * 
 * Este script atualiza o status de um PIX no Supabase de PENDENTE para PAGO
 * para testar a animação de pagamento confirmado no frontend.
 * 
 * USO:
 * node test-pix-payment.js <IDENTIFICADOR_PIX>
 * 
 * Exemplo:
 * node test-pix-payment.js DLQD01CASA01_12345
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('❌ Erro: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE não configuradas');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

async function simularPagamentoPix(identificador) {
  console.log(`\n🔍 Buscando PIX com identificador: ${identificador}`);

  try {
    // 1. Busca o PIX no Supabase
    const { data: pixData, error: fetchError } = await supabase
      .from('historico_pix')
      .select('*')
      .eq('identificador', identificador)
      .single();

    if (fetchError) {
      console.error('❌ Erro ao buscar PIX:', fetchError.message);
      return;
    }

    if (!pixData) {
      console.error('❌ PIX não encontrado com esse identificador');
      return;
    }

    console.log('\n📋 Dados do PIX encontrado:');
    console.log('   ID:', pixData.id);
    console.log('   Cliente:', pixData.cliente);
    console.log('   Unidade:', pixData.unidade);
    console.log('   Valor:', `R$ ${parseFloat(pixData.valor).toFixed(2)}`);
    console.log('   Status atual:', pixData.status_pagamento);

    if (pixData.status_pagamento === 'PAGO') {
      console.log('\n⚠️  Este PIX já está marcado como PAGO');
      return;
    }

    // 2. Atualiza o status para PAGO
    console.log('\n💰 Atualizando status para PAGO...');
    
    const { data: updatedData, error: updateError } = await supabase
      .from('historico_pix')
      .update({
        status_pagamento: 'PAGO',
        data_pagamento: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('identificador', identificador)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Erro ao atualizar PIX:', updateError.message);
      return;
    }

    console.log('✅ PIX atualizado com sucesso!');
    console.log('\n📊 Novo status:');
    console.log('   Status:', updatedData.status_pagamento);
    console.log('   Data do pagamento:', updatedData.data_pagamento);
    console.log('\n🎉 Agora abra o modal do PIX no frontend para ver a animação!');

  } catch (error) {
    console.error('❌ Erro inesperado:', error);
  }
}

// Pega o identificador da linha de comando
const identificador = process.argv[2];

if (!identificador) {
  console.error('❌ Uso: node test-pix-payment.js <IDENTIFICADOR_PIX>');
  console.error('   Exemplo: node test-pix-payment.js DLQD01CASA01_12345');
  process.exit(1);
}

simularPagamentoPix(identificador);
