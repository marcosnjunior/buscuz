// ============================================================
// Buscuz - Sistema de Roteiros de Viagem
// Versão 2.1 - Cadastro de Viagens Funcional
// ============================================================

// ============================================================
// 1. CONFIGURAÇÕES
// ============================================================
const STORAGE_KEY = 'buscuz_data';
const CONFIG_KEY = 'buscuz_config';

// ============================================================
// 2. ESTADO GLOBAL
// ============================================================
let dados = {
    viagens: [],
    config: {
        consumoMedio: 10,
        precoCombustivel: 5.50
    }
};

let viagemAtual = null;
let trechoEmEdicao = null;
let pontoEmEdicao = null;
let despesaEmEdicao = null;
let filtroAtual = 'todas';
let viagemEmEdicao = null;
let userAtual = null; // Usuário logado

// ============================================================
// 3. FUNÇÕES DE PERSISTÊNCIA
// ============================================================

function carregarDados() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            dados.viagens = parsed.viagens || [];
        }
        const configStored = localStorage.getItem(CONFIG_KEY);
        if (configStored) {
            dados.config = JSON.parse(configStored);
        }
    } catch (e) {
        console.warn('Erro ao carregar dados:', e);
    }
    if (!dados.viagens) dados.viagens = [];
    if (!dados.config) dados.config = { consumoMedio: 10, precoCombustivel: 5.50 };
}

function salvarDados() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ viagens: dados.viagens }));
        localStorage.setItem(CONFIG_KEY, JSON.stringify(dados.config));
    } catch (e) {
        console.warn('Erro ao salvar dados:', e);
    }
}

// ============================================================
// 4. VERIFICAR CONEXÃO
// ============================================================

function isOnline() {
    return navigator.onLine;
}

function showSyncStatus(message, isSuccess = true) {
    const statusEl = document.getElementById('syncStatus');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = isSuccess ? 'sync-success' : 'sync-error';
        statusEl.style.display = 'block';
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 3000);
    }
}

// ============================================================
// 5. HELPERS
// ============================================================

function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarData(data) {
    if (!data) return '';
    const partes = data.split('-');
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function calcularCombustivelEstimado(distancia, consumo) {
    if (!consumo || consumo <= 0 || !distancia) return 0;
    return distancia / consumo;
}

function calcularDias(dataInicio, dataFim) {
    if (!dataInicio || !dataFim) return 0;
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    const diff = fim - inicio;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
}

function getStatusViagem(dataInicio, dataFim) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    
    if (hoje < inicio) return 'planejado';
    if (hoje >= inicio && hoje <= fim) return 'em-andamento';
    return 'finalizado';
}

function getStatusTrecho(dataCheckin, dataCheckout) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicio = new Date(dataCheckin);
    const fim = new Date(dataCheckout);
    
    if (hoje < inicio) return 'planejado';
    if (hoje >= inicio && hoje <= fim) return 'em-andamento';
    return 'finalizado';
}

function calcularDespesasPorTipo(trecho, tipo) {
    if (!trecho.despesas) return 0;
    return trecho.despesas
        .filter(d => d.tipo === tipo)
        .reduce((acc, d) => acc + (d.valor || 0), 0);
}

function calcularCombustivelReal(trecho) {
    return calcularDespesasPorTipo(trecho, 'abastecimento');
}

function calcularCombustivelEstimadoValor(trecho) {
    const consumo = dados.config.consumoMedio || 10;
    const preco = dados.config.precoCombustivel || 0;
    const litros = calcularCombustivelEstimado(trecho.distancia, consumo);
    return litros * preco;
}

function calcularTotalGastos(trecho) {
    let total = 0;
    if (trecho.pontos) {
        trecho.pontos.forEach(p => total += (p.custo || 0));
    }
    if (trecho.despesas) {
        trecho.despesas.forEach(d => total += (d.valor || 0));
    }
    return total;
}

function calcularTotalViagem(viagem) {
    let total = 0;
    if (viagem.trechos) {
        viagem.trechos.forEach(t => {
            total += calcularTotalGastos(t);
        });
    }
    return total;
}

// ============================================================
// 6. SINCRONIZAÇÃO DE CONFIGURAÇÕES
// ============================================================

async function syncConfigToSupabase() {
    if (!isOnline()) {
        console.warn('⚠️ Offline - Configurações salvas localmente.');
        return;
    }
    
    if (!userAtual) {
        console.warn('⚠️ Usuário não autenticado - Não é possível sincronizar configurações');
        return;
    }
    
    try {
        console.log('🔄 Sincronizando configurações para o Supabase...');
        
        const result = await window.BuscuzAuth.saveConfig(userAtual.id, dados.config);
        
        if (result.success) {
            console.log('✅ Configurações sincronizadas com sucesso!');
        } else {
            console.error('❌ Erro ao sincronizar configurações:', result.error);
        }
    } catch (error) {
        console.error('❌ Erro ao sincronizar configurações:', error);
    }
}

async function syncConfigFromSupabase() {
    if (!userAtual) return;
    
    try {
        console.log('🔄 Carregando configurações do Supabase...');
        
        const result = await window.BuscuzAuth.loadConfig(userAtual.id);
        
        if (result.success) {
            dados.config.consumoMedio = result.config.consumoMedio;
            dados.config.precoCombustivel = result.config.precoCombustivel;
            salvarDados();
            console.log('✅ Configurações carregadas do Supabase!');
            
            // Atualizar campos no modal se estiver aberto
            const consumoInput = document.getElementById('consumoMedio');
            const precoInput = document.getElementById('precoCombustivel');
            if (consumoInput) consumoInput.value = dados.config.consumoMedio;
            if (precoInput) precoInput.value = dados.config.precoCombustivel;
        }
    } catch (error) {
        console.warn('⚠️ Erro ao carregar configurações do Supabase:', error);
    }
}

/**
 * Carregar configurações do Supabase (chamado no initApp)
 */
async function carregarConfiguracoes() {
    if (!userAtual) return;
    
    try {
        console.log('📥 Carregando configurações...');
        const result = await window.BuscuzAuth.loadConfig(userAtual.id);
        
        if (result.success) {
            dados.config.consumoMedio = result.config.consumoMedio;
            dados.config.precoCombustivel = result.config.precoCombustivel;
            salvarDados();
            console.log('✅ Configurações carregadas:', dados.config);
        }
    } catch (error) {
        console.warn('⚠️ Erro ao carregar configurações:', error);
    }
}

// ============================================================
// 7. SINCRONIZAÇÃO DE DADOS
// ============================================================

async function syncDataToSupabase() {
    // Verificar se está online
    if (!isOnline()) {
        console.warn('⚠️ Offline - Dados salvos localmente. Serão sincronizados quando online.');
        showSyncStatus('⚠️ Offline - Dados salvos localmente', false);
        return;
    }
    
    if (!userAtual) {
        console.warn('⚠️ Usuário não autenticado - Não é possível sincronizar');
        return;
    }
    
    try {
        console.log('🔄 Sincronizando dados para o Supabase...');
        showSyncStatus('🔄 Sincronizando...', true);
        
        // Sincronizar configurações
        await syncConfigToSupabase();
        
        // Sincronizar viagens
        const result = await window.BuscuzAuth.syncData(userAtual.id, dados.viagens);
        
        if (result.success) {
            console.log('✅ Dados sincronizados com sucesso!');
            showSyncStatus('✅ Dados sincronizados com sucesso!', true);
        } else {
            console.error('❌ Erro na sincronização:', result.error);
            showSyncStatus('❌ Erro na sincronização: ' + result.error, false);
        }
    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        showSyncStatus('❌ Erro na sincronização', false);
    }
}

async function syncDataFromSupabase() {
    if (!userAtual) return;
    
    try {
        console.log('🔄 Carregando dados do Supabase...');
        
        // Carregar configurações primeiro
        await syncConfigFromSupabase();
        
        // Carregar viagens
        const result = await window.BuscuzAuth.loadData(userAtual.id);
        
        if (result.success && result.viagens) {
            // Converter dados do Supabase para o formato local
            const viagensDoSupabase = result.viagens.map(v => ({
                id: v.id,
                nome: v.nome,
                destino: v.destino || '',
                dataInicio: v.data_inicio,
                dataFim: v.data_fim,
                descricao: v.descricao || '',
                trechos: (v.trechos || []).map(t => ({
                    id: t.id,
                    cidadeAtual: t.cidade_atual,
                    dataCheckin: t.data_checkin,
                    dataCheckout: t.data_checkout,
                    proximaCidade: t.proxima_cidade,
                    distancia: t.distancia,
                    tempoEstimado: t.tempo_estimado,
                    odometro: t.odometro,
                    pontos: (t.pontos || []).map(p => ({
                        id: p.id,
                        nome: p.nome,
                        localizacao: p.localizacao || '',
                        data: p.data,
                        custo: p.custo || 0,
                        observacoes: p.observacoes || ''
                    })),
                    despesas: (t.despesas || []).map(d => ({
                        id: d.id,
                        descricao: d.descricao,
                        valor: d.valor || 0,
                        data: d.data,
                        tipo: d.tipo || 'outro'
                    }))
                }))
            }));
            
            // Verificar se há dados para sincronizar
            if (viagensDoSupabase.length > 0) {
                dados.viagens = viagensDoSupabase;
                salvarDados();
                console.log('✅ Dados carregados do Supabase! (' + viagensDoSupabase.length + ' viagens)');
                renderizarViagens();
            } else {
                console.log('📭 Nenhuma viagem encontrada no Supabase. Enviando dados locais...');
                // Se não há dados no Supabase, enviar os locais
                await syncDataToSupabase();
            }
        }
    } catch (error) {
        console.warn('⚠️ Erro ao carregar dados do Supabase:', error);
        // Continuar com dados locais
    }
}

// ============================================================
// 8. CRUD VIAGENS
// ============================================================

function criarViagem(dadosViagem) {
    const nova = {
        id: gerarId(),
        nome: dadosViagem.nome.trim(),
        destino: dadosViagem.destino ? dadosViagem.destino.trim() : '',
        dataInicio: dadosViagem.dataInicio,
        dataFim: dadosViagem.dataFim,
        descricao: dadosViagem.descricao ? dadosViagem.descricao.trim() : '',
        trechos: []
    };
    
    dados.viagens.push(nova);
    salvarDados();
    renderizarViagens();
    syncDataToSupabase();
    
    console.log('✅ Viagem criada localmente:', nova.nome);
    return nova;
}

function atualizarViagem(id, dadosAtualizados) {
    const index = dados.viagens.findIndex(v => v.id === id);
    if (index === -1) {
        console.error('Viagem não encontrada:', id);
        return;
    }

    const viagem = dados.viagens[index];
    viagem.nome = dadosAtualizados.nome.trim();
    viagem.destino = dadosAtualizados.destino ? dadosAtualizados.destino.trim() : '';
    viagem.dataInicio = dadosAtualizados.dataInicio;
    viagem.dataFim = dadosAtualizados.dataFim;
    viagem.descricao = dadosAtualizados.descricao ? dadosAtualizados.descricao.trim() : '';

    salvarDados();
    renderizarViagens();
    syncDataToSupabase();
    
    console.log('✅ Viagem atualizada:', viagem.nome);
}

function excluirViagem(id) {
    if (!confirm('Tem certeza que deseja excluir esta viagem e todos os seus trechos?')) return;
    
    const viagem = dados.viagens.find(v => v.id === id);
    if (!viagem) {
        alert('Viagem não encontrada!');
        return;
    }
    
    dados.viagens = dados.viagens.filter(v => v.id !== id);
    salvarDados();
    renderizarViagens();
    deletarViagemDoSupabase(id);
    
    console.log('🗑️ Viagem excluída localmente:', viagem.nome);
}

async function deletarViagemDoSupabase(viagemId) {
    if (!isOnline()) {
        console.warn('⚠️ Offline - A viagem será deletada quando online.');
        showSyncStatus('⚠️ Offline - A viagem será deletada quando online', false);
        return;
    }
    
    if (!userAtual) {
        console.warn('⚠️ Usuário não autenticado - Não é possível deletar');
        return;
    }
    
    try {
        console.log('🗑️ Deletando viagem do Supabase...');
        showSyncStatus('🗑️ Deletando viagem...', true);
        
        const result = await window.BuscuzAuth.deleteViagem(viagemId);
        
        if (result.success) {
            console.log('✅ Viagem deletada do Supabase!');
            showSyncStatus('✅ Viagem deletada com sucesso!', true);
        } else {
            console.error('❌ Erro ao deletar viagem:', result.error);
            showSyncStatus('❌ Erro ao deletar: ' + result.error, false);
        }
    } catch (error) {
        console.error('❌ Erro ao deletar viagem:', error);
        showSyncStatus('❌ Erro ao deletar viagem', false);
    }
}

// ============================================================
// 9. CRUD TRECHOS
// ============================================================

function criarTrecho(dadosTrecho) {
    if (!viagemAtual) {
        console.error('Nenhuma viagem selecionada');
        return;
    }

    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const novo = {
        id: gerarId(),
        cidadeAtual: dadosTrecho.cidadeAtual.trim(),
        dataCheckin: dadosTrecho.dataCheckin,
        dataCheckout: dadosTrecho.dataCheckout,
        proximaCidade: dadosTrecho.proximaCidade.trim(),
        distancia: parseFloat(dadosTrecho.distancia) || 0,
        tempoEstimado: parseFloat(dadosTrecho.tempoEstimado) || 0,
        odometro: dadosTrecho.odometro ? parseFloat(dadosTrecho.odometro) : null,
        pontos: [],
        despesas: []
    };
    
    viagem.trechos.push(novo);
    salvarDados();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Trecho criado:', novo.cidadeAtual, '→', novo.proximaCidade);
    return novo;
}

function atualizarTrecho(id, dadosAtualizados) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const index = viagem.trechos.findIndex(t => t.id === id);
    if (index === -1) {
        console.error('Trecho não encontrado:', id);
        return;
    }

    const trecho = viagem.trechos[index];
    trecho.cidadeAtual = dadosAtualizados.cidadeAtual.trim();
    trecho.dataCheckin = dadosAtualizados.dataCheckin;
    trecho.dataCheckout = dadosAtualizados.dataCheckout;
    trecho.proximaCidade = dadosAtualizados.proximaCidade.trim();
    trecho.distancia = parseFloat(dadosAtualizados.distancia) || 0;
    trecho.tempoEstimado = parseFloat(dadosAtualizados.tempoEstimado) || 0;
    trecho.odometro = dadosAtualizados.odometro ? parseFloat(dadosAtualizados.odometro) : null;

    salvarDados();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Trecho atualizado:', trecho.cidadeAtual, '→', trecho.proximaCidade);
}

function excluirTrecho(id) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }
    
    if (!confirm('Tem certeza que deseja excluir este trecho e todos os seus pontos e despesas?')) return;
    
    const trecho = viagem.trechos.find(t => t.id === id);
    viagem.trechos = viagem.trechos.filter(t => t.id !== id);
    salvarDados();
    fecharModal('detalhesModal');
    renderizarTrechos();
    deletarTrechoDoSupabase(id);
    
    console.log('🗑️ Trecho excluído:', trecho ? trecho.cidadeAtual : id);
}

async function deletarTrechoDoSupabase(trechoId) {
    if (!isOnline() || !userAtual) return;
    
    try {
        console.log('🗑️ Deletando trecho do Supabase...');
        const result = await window.BuscuzAuth.deleteTrecho(trechoId);
        if (result.success) {
            console.log('✅ Trecho deletado do Supabase!');
        } else {
            console.error('❌ Erro ao deletar trecho:', result.error);
        }
    } catch (error) {
        console.error('❌ Erro ao deletar trecho:', error);
    }
}

// ============================================================
// 10. CRUD PONTOS
// ============================================================

function criarPonto(trechoId, dadosPonto) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }

    const novo = {
        id: gerarId(),
        nome: dadosPonto.nome.trim(),
        localizacao: dadosPonto.localizacao ? dadosPonto.localizacao.trim() : '',
        data: dadosPonto.data || null,
        custo: parseFloat(dadosPonto.custo) || 0,
        observacoes: dadosPonto.observacoes ? dadosPonto.observacoes.trim() : ''
    };
    trecho.pontos.push(novo);
    salvarDados();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Ponto criado:', novo.nome);
    return novo;
}

function atualizarPonto(trechoId, pontoId, dadosPonto) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }

    const ponto = trecho.pontos.find(p => p.id === pontoId);
    if (!ponto) {
        console.error('Ponto não encontrado:', pontoId);
        return;
    }

    ponto.nome = dadosPonto.nome.trim();
    ponto.localizacao = dadosPonto.localizacao ? dadosPonto.localizacao.trim() : '';
    ponto.data = dadosPonto.data || null;
    ponto.custo = parseFloat(dadosPonto.custo) || 0;
    ponto.observacoes = dadosPonto.observacoes ? dadosPonto.observacoes.trim() : '';

    salvarDados();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Ponto atualizado:', ponto.nome);
}

function excluirPonto(trechoId, pontoId) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }
    
    if (!confirm('Tem certeza que deseja excluir este ponto?')) return;
    
    const ponto = trecho.pontos.find(p => p.id === pontoId);
    trecho.pontos = trecho.pontos.filter(p => p.id !== pontoId);
    salvarDados();
    renderizarTrechos();
    deletarPontoDoSupabase(pontoId);
    
    console.log('🗑️ Ponto excluído:', ponto ? ponto.nome : pontoId);
}

async function deletarPontoDoSupabase(pontoId) {
    if (!isOnline() || !userAtual) return;
    
    try {
        console.log('🗑️ Deletando ponto do Supabase...');
        
        const client = window.supabaseClient || window.SUPABASE_CLIENT;
        if (!client) {
            throw new Error('Cliente Supabase não disponível');
        }
        
        const { error } = await client
            .from('pontos')
            .delete()
            .eq('id', pontoId);
        
        if (error) throw error;
        
        console.log('✅ Ponto deletado do Supabase!');
    } catch (error) {
        console.error('❌ Erro ao deletar ponto:', error);
    }
}

// ============================================================
// 11. CRUD DESPESAS
// ============================================================

function criarDespesa(trechoId, dadosDespesa) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }

    const novo = {
        id: gerarId(),
        descricao: dadosDespesa.descricao.trim(),
        valor: parseFloat(dadosDespesa.valor) || 0,
        data: dadosDespesa.data || null,
        tipo: dadosDespesa.tipo || 'outro'
    };
    trecho.despesas.push(novo);
    salvarDados();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Despesa criada:', novo.descricao);
    return novo;
}

function atualizarDespesa(trechoId, despesaId, dadosDespesa) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }

    const despesa = trecho.despesas.find(d => d.id === despesaId);
    if (!despesa) {
        console.error('Despesa não encontrada:', despesaId);
        return;
    }

    despesa.descricao = dadosDespesa.descricao.trim();
    despesa.valor = parseFloat(dadosDespesa.valor) || 0;
    despesa.data = dadosDespesa.data || null;
    despesa.tipo = dadosDespesa.tipo || 'outro';

    salvarDados();
    renderizarTrechos();
    syncDataToSupabase();
    
    console.log('✅ Despesa atualizada:', despesa.descricao);
}

function excluirDespesa(trechoId, despesaId) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) {
        console.error('Trecho não encontrado:', trechoId);
        return;
    }
    
    if (!confirm('Tem certeza que deseja excluir esta despesa?')) return;
    
    const despesa = trecho.despesas.find(d => d.id === despesaId);
    trecho.despesas = trecho.despesas.filter(d => d.id !== despesaId);
    salvarDados();
    renderizarTrechos();
    deletarDespesaDoSupabase(despesaId);
    
    console.log('🗑️ Despesa excluída:', despesa ? despesa.descricao : despesaId);
}

async function deletarDespesaDoSupabase(despesaId) {
    if (!isOnline() || !userAtual) return;
    
    try {
        console.log('🗑️ Deletando despesa do Supabase...');
        const result = await window.BuscuzAuth.deleteDespesa(despesaId);
        if (result.success) {
            console.log('✅ Despesa deletada do Supabase!');
        } else {
            console.error('❌ Erro ao deletar despesa:', result.error);
        }
    } catch (error) {
        console.error('❌ Erro ao deletar despesa:', error);
    }
}

// ============================================================
// 12. RENDERIZAÇÃO - PÁGINA PRINCIPAL
// ============================================================

function renderizarViagens() {
    const container = document.getElementById('viagensContainer');
    if (!container) return;
    
    let viagensFiltradas = dados.viagens;
    if (filtroAtual !== 'todas') {
        viagensFiltradas = dados.viagens.filter(v => {
            const status = getStatusViagem(v.dataInicio, v.dataFim);
            return status === filtroAtual;
        });
    }

    if (!viagensFiltradas.length) {
        container.innerHTML = `
            <div class="empty-state" style="text-align:center; padding:40px 20px; color:#999;">
                <i class="fas fa-suitcase" style="font-size:2.5rem; display:block; margin-bottom:12px;"></i>
                <p>${dados.viagens.length ? 'Nenhuma viagem com este filtro.' : 'Nenhuma viagem cadastrada ainda.'}</p>
                <p style="font-size:0.9rem;">Clique em "Nova Viagem" para começar.</p>
            </div>
        `;
        return;
    }

    const viagensOrdenadas = [...viagensFiltradas].sort((a, b) => {
        return new Date(a.dataInicio) - new Date(b.dataInicio);
    });

    container.innerHTML = viagensOrdenadas.map(viagem => {
        const status = getStatusViagem(viagem.dataInicio, viagem.dataFim);
        const totalDias = calcularDias(viagem.dataInicio, viagem.dataFim);
        const totalTrechos = viagem.trechos ? viagem.trechos.length : 0;
        const totalGastos = calcularTotalViagem(viagem);
        const statusLabels = {
            'planejado': '📅 Planejada',
            'em-andamento': '🔄 Em andamento',
            'finalizado': '✅ Finalizada'
        };

        return `
            <div class="viagem-card" data-id="${viagem.id}">
                <h3>
                    <i class="fas fa-suitcase"></i> ${viagem.nome}
                    <span class="status-badge ${status}">${statusLabels[status]}</span>
                </h3>
                <div class="viagem-info">
                    <span><i class="fas fa-map-pin"></i> ${viagem.destino || 'Destino não definido'}</span>
                    <span><i class="fas fa-calendar-alt"></i> ${formatarData(viagem.dataInicio)} até ${formatarData(viagem.dataFim)}</span>
                    <span><i class="fas fa-clock"></i> ${totalDias} dias</span>
                </div>
                ${viagem.descricao ? `<div class="viagem-descricao">${viagem.descricao}</div>` : ''}
                <div class="viagem-resumo">
                    <span class="stat"><i class="fas fa-road"></i> ${totalTrechos} trechos</span>
                    <span class="stat"><i class="fas fa-coins"></i> ${formatarMoeda(totalGastos)}</span>
                    <span class="stat"><i class="fas fa-map-marker-alt"></i> ${viagem.trechos ? viagem.trechos.reduce((acc, t) => acc + (t.pontos ? t.pontos.length : 0), 0) : 0} pontos</span>
                </div>
                <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="secondary-btn editar-viagem" data-id="${viagem.id}" style="font-size:0.8rem; padding:4px 10px;">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="danger-btn excluir-viagem" data-id="${viagem.id}" style="font-size:0.8rem; padding:4px 10px;">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.viagem-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.editar-viagem') || e.target.closest('.excluir-viagem')) {
                return;
            }
            const id = card.dataset.id;
            abrirRoteiro(id);
        });
    });

    document.querySelectorAll('.editar-viagem').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const viagem = dados.viagens.find(v => v.id === id);
            if (viagem) {
                abrirModalViagem(viagem);
            }
        });
    });

    document.querySelectorAll('.excluir-viagem').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            excluirViagem(id);
        });
    });
}

// ============================================================
// 13. NAVEGAÇÃO ENTRE PÁGINAS
// ============================================================

function abrirRoteiro(viagemId) {
    const viagem = dados.viagens.find(v => v.id === viagemId);
    if (!viagem) {
        alert('Viagem não encontrada!');
        return;
    }

    viagemAtual = viagem;
    localStorage.setItem('viagemAtualId', viagemId);
    window.location.href = 'roteiro.html';
}

function voltarParaViagens() {
    window.location.href = 'index.html';
}

// ============================================================
// 14. RENDERIZAÇÃO - ROTEIRO
// ============================================================

function renderizarTrechos() {
    if (!viagemAtual) return;
    
    const container = document.getElementById('trechosContainer');
    if (!container) return;
    
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    document.getElementById('headerTitle').textContent = viagem.nome;
    document.getElementById('viagemNome').textContent = viagem.nome;
    document.getElementById('viagemDestino').textContent = viagem.destino || 'Destino não definido';
    document.getElementById('viagemPeriodo').textContent = `${formatarData(viagem.dataInicio)} até ${formatarData(viagem.dataFim)}`;
    document.getElementById('viagemDescricao').textContent = viagem.descricao || '';

    const status = getStatusViagem(viagem.dataInicio, viagem.dataFim);
    const statusLabels = {
        'planejado': '📅 Planejada',
        'em-andamento': '🔄 Em andamento',
        'finalizado': '✅ Finalizada'
    };
    document.getElementById('viagemStatus').textContent = statusLabels[status];
    document.getElementById('viagemStatus').className = `status-badge ${status}`;

    if (!viagem.trechos || !viagem.trechos.length) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1; text-align:center; padding:40px 20px; color:#999;">
                <i class="fas fa-road" style="font-size:2.5rem; display:block; margin-bottom:12px;"></i>
                <p>Nenhum trecho cadastrado nesta viagem.</p>
                <p style="font-size:0.9rem;">Clique em "Novo Trecho" para começar.</p>
            </div>
        `;
        return;
    }

    const trechosOrdenados = [...viagem.trechos].sort((a, b) => {
        return new Date(a.dataCheckin) - new Date(b.dataCheckin);
    });

    container.innerHTML = trechosOrdenados.map(trecho => {
        const totalPontos = trecho.pontos ? trecho.pontos.length : 0;
        const totalDespesas = trecho.despesas ? trecho.despesas.length : 0;
        const totalGastos = calcularTotalGastos(trecho);
        const combustivelEstimado = calcularCombustivelEstimadoValor(trecho);
        const combustivelReal = calcularCombustivelReal(trecho);
        const status = getStatusTrecho(trecho.dataCheckin, trecho.dataCheckout);
        const dias = calcularDias(trecho.dataCheckin, trecho.dataCheckout);

        const statusLabels = {
            'planejado': '📅 Planejado',
            'em-andamento': '🔄 Em andamento',
            'finalizado': '✅ Finalizado'
        };

        const consumo = dados.config.consumoMedio || 10;
        const litrosEstimados = calcularCombustivelEstimado(trecho.distancia, consumo);

        return `
            <div class="card-trecho" data-id="${trecho.id}">
                <h3><i class="fas fa-arrow-right"></i> ${trecho.cidadeAtual} → ${trecho.proximaCidade}</h3>
                <div class="cidades">
                    <i class="fas fa-map-pin"></i> ${trecho.cidadeAtual} → ${trecho.proximaCidade}
                </div>
                <div class="datas">
                    <i class="fas fa-calendar-alt"></i>
                    ${formatarData(trecho.dataCheckin)} até ${formatarData(trecho.dataCheckout)}
                    <span class="status-badge ${status}">${statusLabels[status]}</span>
                    ${dias > 0 ? `<span style="color:#3498db;">(${dias} dias)</span>` : ''}
                </div>
                <div class="resumo">
                    <span><i class="fas fa-route"></i> ${trecho.distancia} km</span>
                    <span><i class="fas fa-clock"></i> ${trecho.tempoEstimado}h</span>
                    <span><i class="fas fa-map-marker-alt"></i> ${totalPontos} pontos</span>
                    <span><i class="fas fa-gas-pump"></i> ${formatarMoeda(combustivelEstimado)}</span>
                </div>
                <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
                    <span class="badge"><i class="fas fa-receipt"></i> ${totalDespesas} despesas</span>
                    <span class="badge"><i class="fas fa-coins"></i> ${formatarMoeda(totalGastos)}</span>
                    ${combustivelReal > 0 ? `<span class="badge" style="background:#27ae60; color:white;"><i class="fas fa-gas-pump"></i> Real: ${formatarMoeda(combustivelReal)}</span>` : ''}
                </div>
                <div style="font-size:0.7rem; color:#999; margin-top:4px;">
                    <i class="fas fa-info-circle"></i> Combustível estimado (${litrosEstimados.toFixed(1)}L) - Não incluso no total
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.card-trecho').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            abrirDetalhes(id);
        });
    });
}

// ============================================================
// 15. DETALHES DO TRECHO
// ============================================================

function abrirDetalhes(id) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) {
        console.error('Viagem não encontrada:', viagemAtual.id);
        return;
    }

    const trecho = viagem.trechos.find(t => t.id === id);
    if (!trecho) {
        alert('Trecho não encontrado!');
        return;
    }

    const modal = document.getElementById('detalhesModal');
    const content = document.getElementById('detalhesContent');

    const combustivelEstimado = calcularCombustivelEstimadoValor(trecho);
    const combustivelReal = calcularCombustivelReal(trecho);
    const litrosEstimados = calcularCombustivelEstimado(trecho.distancia, dados.config.consumoMedio || 10);
    
    const dias = calcularDias(trecho.dataCheckin, trecho.dataCheckout);
    const status = getStatusTrecho(trecho.dataCheckin, trecho.dataCheckout);

    const totalPontos = trecho.pontos ? trecho.pontos.reduce((acc, p) => acc + (p.custo || 0), 0) : 0;
    const totalDespesas = trecho.despesas ? trecho.despesas.reduce((acc, d) => acc + (d.valor || 0), 0) : 0;
    const totalGeral = totalPontos + totalDespesas;

    const statusLabels = {
        'planejado': '📅 Planejado',
        'em-andamento': '🔄 Em andamento',
        'finalizado': '✅ Finalizado'
    };

    let pontosHtml = '';
    if (trecho.pontos && trecho.pontos.length) {
        pontosHtml = `<ul class="item-list">`;
        const pontosOrdenados = [...trecho.pontos].sort((a, b) => {
            if (!a.data) return 1;
            if (!b.data) return -1;
            return new Date(a.data) - new Date(b.data);
        });
        pontosOrdenados.forEach(p => {
            const localizacaoHtml = p.localizacao ? 
                `<a href="${p.localizacao}" target="_blank" class="maps-link" title="Abrir no Google Maps">
                    <i class="fas fa-map-marked-alt"></i> Ver no Maps
                </a>` : 
                `<span class="no-maps"><i class="fas fa-map-pin"></i> Sem localização</span>`;

            pontosHtml += `
                <li>
                    <div class="item-info">
                        <strong>${p.nome}</strong>
                        <div class="ponto-actions">
                            ${localizacaoHtml}
                            ${p.data ? `<span class="data-info"><i class="fas fa-calendar-alt"></i> ${formatarData(p.data)}</span>` : ''}
                            <span class="custo-info"><i class="fas fa-ticket-alt"></i> ${formatarMoeda(p.custo)}</span>
                        </div>
                        ${p.observacoes ? `<div class="obs">📝 ${p.observacoes}</div>` : ''}
                    </div>
                    <div class="item-actions">
                        <button class="edit-btn" data-acao="editarPonto" data-id="${p.id}"><i class="fas fa-edit"></i></button>
                        <button class="delete-btn" data-acao="excluirPonto" data-id="${p.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </li>
            `;
        });
        pontosHtml += `</ul>`;
    } else {
        pontosHtml = `<p class="empty">Nenhum ponto cadastrado.</p>`;
    }

    let despesasHtml = '';
    if (trecho.despesas && trecho.despesas.length) {
        despesasHtml = `<ul class="item-list">`;
        const despesasOrdenadas = [...trecho.despesas].sort((a, b) => {
            if (!a.data) return 1;
            if (!b.data) return -1;
            return new Date(a.data) - new Date(b.data);
        });
        despesasOrdenadas.forEach(d => {
            const tipoLabel = {
                'pedagio': 'Pedágio',
                'balsa': 'Balsa',
                'abastecimento': 'Abastecimento ⛽',
                'alimentacao': 'Alimentação',
                'entrada': 'Entrada',
                'hospedagem': 'Hospedagem',
                'outro': 'Outro'
            }[d.tipo] || d.tipo;

            despesasHtml += `
                <li>
                    <div class="item-info">
                        <strong>${d.descricao}</strong>
                        ${d.data ? `<span class="data-info"><i class="fas fa-calendar-alt"></i> ${formatarData(d.data)}</span>` : ''}
                        <span style="margin-left:8px; color:#2c3e50;">${formatarMoeda(d.valor)}</span>
                        <span class="obs"> - ${tipoLabel}</span>
                    </div>
                    <div class="item-actions">
                        <button class="edit-btn" data-acao="editarDespesa" data-id="${d.id}"><i class="fas fa-edit"></i></button>
                        <button class="delete-btn" data-acao="excluirDespesa" data-id="${d.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </li>
            `;
        });
        despesasHtml += `</ul>`;
    } else {
        despesasHtml = `<p class="empty">Nenhuma despesa cadastrada.</p>`;
    }

    content.innerHTML = `
        <div class="detalhes-header">
            <div>
                <h3 data-id="${trecho.id}"><i class="fas fa-arrow-right"></i> ${trecho.cidadeAtual} → ${trecho.proximaCidade}</h3>
                <div class="info">
                    <span><i class="fas fa-calendar-alt"></i> ${formatarData(trecho.dataCheckin)} até ${formatarData(trecho.dataCheckout)}</span>
                    <span><i class="fas fa-clock"></i> ${dias} dias</span>
                    <span><span class="status-badge ${status}">${statusLabels[status]}</span></span>
                    <span><i class="fas fa-route"></i> ${trecho.distancia} km</span>
                    <span><i class="fas fa-hourglass-half"></i> ${trecho.tempoEstimado}h</span>
                    ${trecho.odometro ? `<span><i class="fas fa-tachometer-alt"></i> ${trecho.odometro} km</span>` : ''}
                </div>
            </div>
            <div>
                <button class="secondary-btn" data-acao="editarTrecho" style="margin-right:6px;">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="danger-btn" data-acao="excluirTrecho">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>

        <div class="resumo-gastos">
            <div class="gasto-item">
                <div class="label">Combustível Estimado</div>
                <div class="value" style="color:#7f8c8d;">${formatarMoeda(combustivelEstimado)}</div>
                <div style="font-size:0.65rem; color:#999;">${litrosEstimados.toFixed(1)}L estimados</div>
            </div>
            <div class="gasto-item" style="${combustivelReal > 0 ? 'background:#27ae60; color:white; border-radius:4px; padding:4px;' : ''}">
                <div class="label" style="${combustivelReal > 0 ? 'color:#ddd;' : ''}">Combustível Real</div>
                <div class="value" style="${combustivelReal > 0 ? 'color:white;' : ''}">${formatarMoeda(combustivelReal)}</div>
                ${combustivelReal > 0 ? '<div style="font-size:0.65rem; color:#ddd;">⛽ Abastecimentos</div>' : '<div style="font-size:0.65rem; color:#999;">Nenhum abastecimento</div>'}
            </div>
            <div class="gasto-item">
                <div class="label">Pontos</div>
                <div class="value">${formatarMoeda(totalPontos)}</div>
            </div>
            <div class="gasto-item">
                <div class="label">Despesas</div>
                <div class="value">${formatarMoeda(totalDespesas)}</div>
            </div>
            <div class="gasto-item" style="background:#2c3e50; color:white; border-radius:4px; padding:4px;">
                <div class="label" style="color:#ddd;">Total (sem estimado)</div>
                <div class="value" style="color:white;">${formatarMoeda(totalGeral)}</div>
            </div>
        </div>

        <div class="detalhes-section">
            <h4><i class="fas fa-map-marker-alt"></i> Pontos Turísticos
                <button class="btn-inline" data-acao="novoPonto"><i class="fas fa-plus"></i> Adicionar</button>
            </h4>
            ${pontosHtml}
        </div>

        <div class="detalhes-section">
            <h4><i class="fas fa-receipt"></i> Despesas
                <button class="btn-inline" data-acao="novaDespesa"><i class="fas fa-plus"></i> Adicionar</button>
            </h4>
            ${despesasHtml}
        </div>
    `;

    content.querySelectorAll('[data-acao]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const acao = el.dataset.acao;
            const id = el.dataset.id;

            switch (acao) {
                case 'editarTrecho':
                    fecharModal('detalhesModal');
                    editarTrecho(trecho.id);
                    break;
                case 'excluirTrecho':
                    if (confirm('Tem certeza que deseja excluir este trecho?')) {
                        excluirTrecho(trecho.id);
                    }
                    break;
                case 'novoPonto':
                    fecharModal('detalhesModal');
                    abrirModalPonto(trecho.id);
                    break;
                case 'editarPonto':
                    fecharModal('detalhesModal');
                    editarPonto(trecho.id, id);
                    break;
                case 'excluirPonto':
                    excluirPonto(trecho.id, id);
                    abrirDetalhes(trecho.id);
                    break;
                case 'novaDespesa':
                    fecharModal('detalhesModal');
                    abrirModalDespesa(trecho.id);
                    break;
                case 'editarDespesa':
                    fecharModal('detalhesModal');
                    editarDespesa(trecho.id, id);
                    break;
                case 'excluirDespesa':
                    excluirDespesa(trecho.id, id);
                    abrirDetalhes(trecho.id);
                    break;
            }
        });
    });

    modal.style.display = 'block';
}

// ============================================================
// 16. FUNÇÕES DE MODAL
// ============================================================

function fecharModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

function abrirModalViagem(viagem = null) {
    const modal = document.getElementById('viagemModal');
    if (!modal) return;
    
    const form = document.getElementById('formViagem');
    const title = document.getElementById('modalViagemTitle');

    form.reset();
    document.getElementById('viagemId').value = '';

    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 7);
    
    const hojeStr = hoje.toISOString().split('T')[0];
    const amanhaStr = amanha.toISOString().split('T')[0];

    if (viagem) {
        title.innerHTML = '<i class="fas fa-edit"></i> Editar Viagem';
        document.getElementById('viagemId').value = viagem.id;
        document.getElementById('viagemNome').value = viagem.nome;
        document.getElementById('viagemDestino').value = viagem.destino || '';
        document.getElementById('viagemDataInicio').value = viagem.dataInicio;
        document.getElementById('viagemDataFim').value = viagem.dataFim;
        document.getElementById('viagemDescricao').value = viagem.descricao || '';
        viagemEmEdicao = viagem.id;
    } else {
        title.innerHTML = '<i class="fas fa-suitcase"></i> Nova Viagem';
        document.getElementById('viagemDataInicio').value = hojeStr;
        document.getElementById('viagemDataFim').value = amanhaStr;
        viagemEmEdicao = null;
    }

    modal.style.display = 'block';
}

function abrirModalTrecho(trecho = null) {
    const modal = document.getElementById('trechoModal');
    if (!modal) return;
    
    const form = document.getElementById('formTrecho');
    const title = document.getElementById('modalTrechoTitle');

    form.reset();
    document.getElementById('trechoId').value = '';

    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    
    const hojeStr = hoje.toISOString().split('T')[0];
    const amanhaStr = amanha.toISOString().split('T')[0];

    if (trecho) {
        title.innerHTML = '<i class="fas fa-edit"></i> Editar Trecho';
        document.getElementById('trechoId').value = trecho.id;
        document.getElementById('cidadeAtual').value = trecho.cidadeAtual;
        document.getElementById('dataCheckin').value = trecho.dataCheckin || hojeStr;
        document.getElementById('dataCheckout').value = trecho.dataCheckout || amanhaStr;
        document.getElementById('proximaCidade').value = trecho.proximaCidade;
        document.getElementById('distancia').value = trecho.distancia;
        document.getElementById('tempoEstimado').value = trecho.tempoEstimado;
        document.getElementById('odometro').value = trecho.odometro || '';
        trechoEmEdicao = trecho.id;
    } else {
        title.innerHTML = '<i class="fas fa-road"></i> Novo Trecho';
        document.getElementById('dataCheckin').value = hojeStr;
        document.getElementById('dataCheckout').value = amanhaStr;
        trechoEmEdicao = null;
    }

    modal.style.display = 'block';
}

function abrirModalPonto(trechoId, ponto = null) {
    const modal = document.getElementById('pontoModal');
    if (!modal) return;
    
    const form = document.getElementById('formPonto');

    form.reset();
    document.getElementById('pontoId').value = '';
    document.getElementById('pontoTrechoId').value = trechoId;

    if (ponto) {
        document.getElementById('pontoId').value = ponto.id;
        document.getElementById('pontoNome').value = ponto.nome;
        document.getElementById('pontoLocalizacao').value = ponto.localizacao || '';
        document.getElementById('pontoData').value = ponto.data || '';
        document.getElementById('pontoCusto').value = ponto.custo;
        document.getElementById('pontoObservacoes').value = ponto.observacoes || '';
        pontoEmEdicao = ponto.id;
    } else {
        pontoEmEdicao = null;
    }

    modal.style.display = 'block';
}

function abrirModalDespesa(trechoId, despesa = null) {
    const modal = document.getElementById('despesaModal');
    if (!modal) return;
    
    const form = document.getElementById('formDespesa');

    form.reset();
    document.getElementById('despesaId').value = '';
    document.getElementById('despesaTrechoId').value = trechoId;

    const hoje = new Date().toISOString().split('T')[0];

    if (despesa) {
        document.getElementById('despesaId').value = despesa.id;
        document.getElementById('despesaDescricao').value = despesa.descricao;
        document.getElementById('despesaValor').value = despesa.valor;
        document.getElementById('despesaData').value = despesa.data || hoje;
        document.getElementById('despesaTipo').value = despesa.tipo || 'outro';
        despesaEmEdicao = despesa.id;
    } else {
        document.getElementById('despesaData').value = hoje;
        despesaEmEdicao = null;
    }

    modal.style.display = 'block';
}

function abrirModalConfig() {
    const modal = document.getElementById('configModal');
    if (!modal) return;
    
    document.getElementById('consumoMedio').value = dados.config.consumoMedio || '';
    document.getElementById('precoCombustivel').value = dados.config.precoCombustivel || '';
    modal.style.display = 'block';
}

function abrirResumoViagem() {
    if (!viagemAtual) return;
    
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) return;

    const modal = document.getElementById('resumoModal');
    if (!modal) return;
    
    const content = document.getElementById('resumoContent');

    const totalTrechos = viagem.trechos ? viagem.trechos.length : 0;
    const totalPontos = viagem.trechos ? viagem.trechos.reduce((acc, t) => acc + (t.pontos ? t.pontos.length : 0), 0) : 0;
    const totalDespesas = viagem.trechos ? viagem.trechos.reduce((acc, t) => acc + (t.despesas ? t.despesas.length : 0), 0) : 0;
    const totalGastos = calcularTotalViagem(viagem);
    const totalCombustivelReal = viagem.trechos ? viagem.trechos.reduce((acc, t) => acc + calcularCombustivelReal(t), 0) : 0;
    const totalCombustivelEstimado = viagem.trechos ? viagem.trechos.reduce((acc, t) => acc + calcularCombustivelEstimadoValor(t), 0) : 0;
    const distanciaTotal = viagem.trechos ? viagem.trechos.reduce((acc, t) => acc + (t.distancia || 0), 0) : 0;

    content.innerHTML = `
        <div class="resumo-viagem-stats">
            <div class="stat-item">
                <div class="stat-value">${totalTrechos}</div>
                <div class="stat-label">Trechos</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${totalPontos}</div>
                <div class="stat-label">Pontos Turísticos</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${totalDespesas}</div>
                <div class="stat-label">Despesas</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${distanciaTotal.toFixed(1)} km</div>
                <div class="stat-label">Distância Total</div>
            </div>
        </div>
        <div class="resumo-viagem-stats">
            <div class="stat-item" style="background:#ecf0f1;">
                <div class="stat-value">${formatarMoeda(totalCombustivelEstimado)}</div>
                <div class="stat-label">Combustível Estimado</div>
            </div>
            <div class="stat-item" style="background:#27ae60; color:white;">
                <div class="stat-value" style="color:white;">${formatarMoeda(totalCombustivelReal)}</div>
                <div class="stat-label" style="color:#ddd;">Combustível Real</div>
            </div>
            <div class="stat-item" style="background:#2c3e50; color:white;">
                <div class="stat-value" style="color:white;">${formatarMoeda(totalGastos)}</div>
                <div class="stat-label" style="color:#ddd;">Total de Gastos</div>
            </div>
        </div>
        <div style="text-align:center; margin-top:16px; color:#7f8c8d; font-size:0.9rem;">
            <i class="fas fa-info-circle"></i> 
            ${totalCombustivelReal > 0 ? 'Combustível Real baseado em abastecimentos registrados' : 'Nenhum abastecimento registrado ainda'}
        </div>
    `;

    modal.style.display = 'block';
}

function editarTrecho(id) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) return;
    const trecho = viagem.trechos.find(t => t.id === id);
    if (trecho) {
        abrirModalTrecho(trecho);
    }
}

function editarPonto(trechoId, pontoId) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) return;
    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) return;
    const ponto = trecho.pontos.find(p => p.id === pontoId);
    if (ponto) {
        abrirModalPonto(trechoId, ponto);
    }
}

function editarDespesa(trechoId, despesaId) {
    const viagem = dados.viagens.find(v => v.id === viagemAtual.id);
    if (!viagem) return;
    const trecho = viagem.trechos.find(t => t.id === trechoId);
    if (!trecho) return;
    const despesa = trecho.despesas.find(d => d.id === despesaId);
    if (despesa) {
        abrirModalDespesa(trechoId, despesa);
    }
}

// ============================================================
// 17. INICIALIZAÇÃO DAS PÁGINAS
// ============================================================

function initPaginaViagens() {
    renderizarViagens();

    const btnConfig = document.getElementById('btnConfig');
    if (btnConfig) {
        btnConfig.addEventListener('click', abrirModalConfig);
    }

    const btnSalvarConfig = document.getElementById('btnSalvarConfig');
    if (btnSalvarConfig) {
        btnSalvarConfig.addEventListener('click', async () => {
            const consumo = parseFloat(document.getElementById('consumoMedio').value);
            const preco = parseFloat(document.getElementById('precoCombustivel').value);

            if (consumo > 0 && preco > 0) {
                dados.config.consumoMedio = consumo;
                dados.config.precoCombustivel = preco;
                salvarDados();
                await syncConfigToSupabase();
                fecharModal('configModal');
                renderizarViagens();
                //alert('Configurações salvas com sucesso!');
            } else {
                alert('Por favor, insira valores válidos (maiores que zero).');
            }
        });
    }

    const btnSync = document.getElementById('btnSync');
    if (btnSync) {
        btnSync.addEventListener('click', async function() {
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
            await syncDataToSupabase();
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-sync"></i> Sincronizar';
        });
    }

    const btnNovaViagem = document.getElementById('btnNovaViagem');
    if (btnNovaViagem) {
        btnNovaViagem.addEventListener('click', () => {
            abrirModalViagem(null);
        });
    }

    const formViagem = document.getElementById('formViagem');
    if (formViagem) {
        formViagem.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('viagemId').value;
            const dataInicio = document.getElementById('viagemDataInicio').value;
            const dataFim = document.getElementById('viagemDataFim').value;

            if (new Date(dataFim) < new Date(dataInicio)) {
                alert('A data de fim não pode ser anterior à data de início.');
                return;
            }

            const dadosForm = {
                nome: document.getElementById('viagemNome').value.trim(),
                destino: document.getElementById('viagemDestino').value.trim(),
                dataInicio: dataInicio,
                dataFim: dataFim,
                descricao: document.getElementById('viagemDescricao').value.trim()
            };

            if (!dadosForm.nome) {
                alert('O nome da viagem é obrigatório.');
                return;
            }

            if (id) {
                atualizarViagem(id, dadosForm);
            } else {
                criarViagem(dadosForm);
            }
            fecharModal('viagemModal');
        });
    }

    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroAtual = btn.dataset.filtro;
            renderizarViagens();
        });
    });

    document.querySelectorAll('.modal .close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').style.display = 'none';
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    console.log('🚐 Buscuz - Página de Viagens');
    console.log(`📊 ${dados.viagens.length} viagens carregadas`);
}

function initPaginaRoteiro() {
    const viagemId = localStorage.getItem('viagemAtualId');
    if (!viagemId) {
        alert('Nenhuma viagem selecionada!');
        window.location.href = 'index.html';
        return;
    }

    viagemAtual = dados.viagens.find(v => v.id === viagemId);
    
    if (!viagemAtual) {
        alert('Viagem não encontrada!');
        window.location.href = 'index.html';
        return;
    }

    renderizarTrechos();

    const btnVoltar = document.getElementById('btnVoltar');
    if (btnVoltar) {
        btnVoltar.addEventListener('click', voltarParaViagens);
    }

    const btnConfigRoteiro = document.getElementById('btnConfigRoteiro');
    if (btnConfigRoteiro) {
        btnConfigRoteiro.addEventListener('click', abrirModalConfig);
    }

    const btnSalvarConfig = document.getElementById('btnSalvarConfig');
    if (btnSalvarConfig) {
        btnSalvarConfig.addEventListener('click', async () => {
            const consumo = parseFloat(document.getElementById('consumoMedio').value);
            const preco = parseFloat(document.getElementById('precoCombustivel').value);

            if (consumo > 0 && preco > 0) {
                dados.config.consumoMedio = consumo;
                dados.config.precoCombustivel = preco;
                salvarDados();
                await syncConfigToSupabase();
                fecharModal('configModal');
                renderizarTrechos();
                alert('Configurações salvas com sucesso!');
            } else {
                alert('Por favor, insira valores válidos (maiores que zero).');
            }
        });
    }

    const btnSyncRoteiro = document.getElementById('btnSyncRoteiro');
    if (btnSyncRoteiro) {
        btnSyncRoteiro.addEventListener('click', async function() {
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            await syncDataToSupabase();
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-sync"></i>';
        });
    }

    const btnNovoTrecho = document.getElementById('btnNovoTrecho');
    if (btnNovoTrecho) {
        btnNovoTrecho.addEventListener('click', () => {
            abrirModalTrecho(null);
        });
    }

    const btnResumoViagem = document.getElementById('btnResumoViagem');
    if (btnResumoViagem) {
        btnResumoViagem.addEventListener('click', abrirResumoViagem);
    }

    const formTrecho = document.getElementById('formTrecho');
    if (formTrecho) {
        formTrecho.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('trechoId').value;
            const dataCheckin = document.getElementById('dataCheckin').value;
            const dataCheckout = document.getElementById('dataCheckout').value;

            if (new Date(dataCheckout) < new Date(dataCheckin)) {
                alert('A data de check-out não pode ser anterior à data de check-in.');
                return;
            }

            const dadosForm = {
                cidadeAtual: document.getElementById('cidadeAtual').value.trim(),
                dataCheckin: dataCheckin,
                dataCheckout: dataCheckout,
                proximaCidade: document.getElementById('proximaCidade').value.trim(),
                distancia: document.getElementById('distancia').value,
                tempoEstimado: document.getElementById('tempoEstimado').value,
                odometro: document.getElementById('odometro').value
            };

            if (!dadosForm.cidadeAtual || !dadosForm.proximaCidade) {
                alert('Preencha todos os campos obrigatórios.');
                return;
            }

            if (id) {
                atualizarTrecho(id, dadosForm);
            } else {
                criarTrecho(dadosForm);
            }
            fecharModal('trechoModal');
        });
    }

    const formPonto = document.getElementById('formPonto');
    if (formPonto) {
        formPonto.addEventListener('submit', (e) => {
            e.preventDefault();
            const trechoId = document.getElementById('pontoTrechoId').value;
            const pontoId = document.getElementById('pontoId').value;
            const nome = document.getElementById('pontoNome').value.trim();
            const localizacao = document.getElementById('pontoLocalizacao').value.trim();
            
            if (!nome) {
                alert('O nome do ponto é obrigatório.');
                return;
            }

            if (localizacao && !localizacao.match(/^https?:\/\/.+/)) {
                alert('Por favor, insira uma URL válida para o Google Maps (começando com http:// ou https://).');
                return;
            }

            const dadosForm = {
                nome: nome,
                localizacao: localizacao,
                data: document.getElementById('pontoData').value,
                custo: document.getElementById('pontoCusto').value,
                observacoes: document.getElementById('pontoObservacoes').value.trim()
            };

            if (pontoId) {
                atualizarPonto(trechoId, pontoId, dadosForm);
            } else {
                criarPonto(trechoId, dadosForm);
            }
            fecharModal('pontoModal');
            if (document.getElementById('detalhesModal').style.display === 'block') {
                const trechoAtualId = document.querySelector('#detalhesModal .detalhes-header h3')?.dataset?.id;
                if (trechoAtualId) abrirDetalhes(trechoAtualId);
            }
        });
    }

    const formDespesa = document.getElementById('formDespesa');
    if (formDespesa) {
        formDespesa.addEventListener('submit', (e) => {
            e.preventDefault();
            const trechoId = document.getElementById('despesaTrechoId').value;
            const despesaId = document.getElementById('despesaId').value;
            const dadosForm = {
                descricao: document.getElementById('despesaDescricao').value.trim(),
                valor: document.getElementById('despesaValor').value,
                data: document.getElementById('despesaData').value,
                tipo: document.getElementById('despesaTipo').value
            };

            if (!dadosForm.descricao || !dadosForm.valor) {
                alert('Preencha todos os campos obrigatórios.');
                return;
            }

            if (despesaId) {
                atualizarDespesa(trechoId, despesaId, dadosForm);
            } else {
                criarDespesa(trechoId, dadosForm);
            }
            fecharModal('despesaModal');
            if (document.getElementById('detalhesModal').style.display === 'block') {
                const trechoAtualId = document.querySelector('#detalhesModal .detalhes-header h3')?.dataset?.id;
                if (trechoAtualId) abrirDetalhes(trechoAtualId);
            }
        });
    }

    document.querySelectorAll('.modal .close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').style.display = 'none';
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    console.log('🚐 Buscuz - Página de Roteiro');
    console.log(`📅 Viagem: ${viagemAtual.nome}`);
    console.log(`📍 ${viagemAtual.trechos ? viagemAtual.trechos.length : 0} trechos carregados`);
}

// ============================================================
// 18. INICIALIZAÇÃO PRINCIPAL
// ============================================================

async function initApp() {
    console.log('🚀 Inicializando Buscuz...');
    
    const authResult = await window.checkAuthAndRedirect();
    
    if (!authResult || !authResult.authenticated) {
        console.log('⛔ Usuário não autenticado. Redirecionando...');
        return;
    }
    
    userAtual = authResult.user;
    console.log('✅ Usuário autenticado:', userAtual.email);
    
    carregarDados();
    await carregarConfiguracoes();
    await syncDataFromSupabase();
    
    if (document.getElementById('viagensContainer')) {
        console.log('📋 Página de viagens detectada');
        initPaginaViagens();
    } else if (document.getElementById('trechosContainer')) {
        console.log('📋 Página de roteiro detectada');
        initPaginaRoteiro();
    }
    
    atualizarInfoUsuario(authResult.user);
}

function atualizarInfoUsuario(user) {
    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        const name = user.user_metadata?.name || user.email;
        userInfo.innerHTML = `
            <span class="user-name"><i class="fas fa-user-circle"></i> ${name}</span>
            <button class="logout-btn" onclick="handleLogout()">
                <i class="fas fa-sign-out-alt"></i> Sair
            </button>
        `;
    }
}

// ============================================================
// 19. EVENTOS DE CONEXÃO
// ============================================================

window.addEventListener('online', function() {
    console.log('📶 Conexão restaurada! Sincronizando dados...');
    if (userAtual) {
        syncDataToSupabase();
    }
});

setInterval(function() {
    if (userAtual && isOnline()) {
        console.log('🔄 Sincronização automática...');
        syncDataToSupabase();
    }
}, 300000);

// ============================================================
// 20. INICIAR APLICAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', initApp);

console.log('📦 Buscuz - App carregado!');
console.log('Versão 2.1 - Com autenticação e sincronização');