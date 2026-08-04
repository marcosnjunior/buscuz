// ============================================================
// Supabase Configuration
// ============================================================

// Verificar se já existe para evitar duplicação
if (typeof window.supabaseClient === 'undefined') {
    
    const SUPABASE_URL = 'https://isatgbkemaahqaoaruwz.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_KX9DHtRNFOXcNhBV5qfLsw_No1BYeTq';

    // Criar cliente Supabase
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Expor globalmente
    window.supabaseClient = supabaseClient;
    window.SUPABASE_URL = SUPABASE_URL;
    window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

    console.log('✅ Supabase inicializado');
}

// Usar o cliente existente
const supabase = window.supabaseClient;

// ===== FUNÇÕES DE AUTENTICAÇÃO =====

/**
 * Login com email e senha
 */
async function loginUser(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) throw error;
        
        // Salvar sessão no localStorage
        localStorage.setItem('supabase_session', JSON.stringify(data.session));
        
        return { success: true, user: data.user, session: data.session };
    } catch (error) {
        console.error('Erro no login:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Cadastro de novo usuário
 */
async function signupUser(email, password, name) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    name: name
                }
            }
        });
        
        if (error) throw error;
        
        // Criar perfil do usuário
        if (data.user) {
            await createUserProfile(data.user.id, name, email);
        }
        
        return { success: true, user: data.user };
    } catch (error) {
        console.error('Erro no cadastro:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Recuperação de senha
 */
async function forgotPassword(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`
        });
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Erro na recuperação:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Redefinir senha
 */
async function resetPassword(newPassword) {
    try {
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Erro ao redefinir senha:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Logout
 */
async function logoutUser() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        // Remover sessão do localStorage
        localStorage.removeItem('supabase_session');
        localStorage.removeItem('buscuz_data');
        
        return { success: true };
    } catch (error) {
        console.error('Erro no logout:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Verificar se usuário está autenticado
 */
async function checkAuth() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (session) {
            localStorage.setItem('supabase_session', JSON.stringify(session));
            return { authenticated: true, user: session.user };
        }
        
        // Tentar recuperar sessão do localStorage
        const storedSession = localStorage.getItem('supabase_session');
        if (storedSession) {
            const sessionData = JSON.parse(storedSession);
            // Verificar se a sessão ainda é válida
            const { data: { session: validSession } } = await supabase.auth.getSession();
            if (validSession) {
                return { authenticated: true, user: validSession.user };
            }
        }
        
        return { authenticated: false };
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        return { authenticated: false, error: error.message };
    }
}

/**
 * Criar perfil do usuário
 */
async function createUserProfile(userId, name, email) {
    try {
        const { error } = await supabase
            .from('profiles')
            .insert([
                {
                    id: userId,
                    name: name,
                    email: email,
                    created_at: new Date().toISOString()
                }
            ]);
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Erro ao criar perfil:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Obter perfil do usuário
 */
async function getUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        return { success: true, profile: data };
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        return { success: false, error: error.message };
    }
}

// ===== FUNÇÕES DE SINCRONIZAÇÃO =====

/**
 * Sincronizar viagens com Supabase
 */
async function syncViagens(userId, viagens) {
    try {
        // Buscar viagens existentes no Supabase
        const { data: existingViagens, error: fetchError } = await supabase
            .from('viagens')
            .select('*')
            .eq('user_id', userId);
        
        if (fetchError) throw fetchError;
        
        // Para cada viagem local, upsert no Supabase
        for (const viagem of viagens) {
            const viagemData = {
                id: viagem.id,
                user_id: userId,
                nome: viagem.nome,
                destino: viagem.destino || '',
                data_inicio: viagem.dataInicio,
                data_fim: viagem.dataFim,
                descricao: viagem.descricao || '',
                updated_at: new Date().toISOString()
            };
            
            const { error: upsertError } = await supabase
                .from('viagens')
                .upsert(viagemData, { onConflict: 'id' });
            
            if (upsertError) throw upsertError;
            
            // Sincronizar trechos da viagem
            if (viagem.trechos && viagem.trechos.length > 0) {
                await syncTrechos(viagem.id, viagem.trechos);
            }
        }
        
        return { success: true };
    } catch (error) {
        console.error('Erro ao sincronizar viagens:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sincronizar trechos com Supabase
 */
async function syncTrechos(viagemId, trechos) {
    try {
        for (const trecho of trechos) {
            const trechoData = {
                id: trecho.id,
                viagem_id: viagemId,
                cidade_atual: trecho.cidadeAtual,
                data_checkin: trecho.dataCheckin,
                data_checkout: trecho.dataCheckout,
                proxima_cidade: trecho.proximaCidade,
                distancia: trecho.distancia,
                tempo_estimado: trecho.tempoEstimado,
                odometro: trecho.odometro || null,
                updated_at: new Date().toISOString()
            };
            
            const { error } = await supabase
                .from('trechos')
                .upsert(trechoData, { onConflict: 'id' });
            
            if (error) throw error;
            
            // Sincronizar pontos e despesas
            if (trecho.pontos && trecho.pontos.length > 0) {
                await syncPontos(trecho.id, trecho.pontos);
            }
            
            if (trecho.despesas && trecho.despesas.length > 0) {
                await syncDespesas(trecho.id, trecho.despesas);
            }
        }
        
        return { success: true };
    } catch (error) {
        console.error('Erro ao sincronizar trechos:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sincronizar pontos com Supabase
 */
async function syncPontos(trechoId, pontos) {
    try {
        for (const ponto of pontos) {
            const pontoData = {
                id: ponto.id,
                trecho_id: trechoId,
                nome: ponto.nome,
                localizacao: ponto.localizacao || '',
                data: ponto.data || null,
                custo: ponto.custo || 0,
                observacoes: ponto.observacoes || '',
                updated_at: new Date().toISOString()
            };
            
            const { error } = await supabase
                .from('pontos')
                .upsert(pontoData, { onConflict: 'id' });
            
            if (error) throw error;
        }
        
        return { success: true };
    } catch (error) {
        console.error('Erro ao sincronizar pontos:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sincronizar despesas com Supabase
 */
async function syncDespesas(trechoId, despesas) {
    try {
        for (const despesa of despesas) {
            const despesaData = {
                id: despesa.id,
                trecho_id: trechoId,
                descricao: despesa.descricao,
                valor: despesa.valor || 0,
                data: despesa.data || null,
                tipo: despesa.tipo || 'outro',
                updated_at: new Date().toISOString()
            };
            
            const { error } = await supabase
                .from('despesas')
                .upsert(despesaData, { onConflict: 'id' });
            
            if (error) throw error;
        }
        
        return { success: true };
    } catch (error) {
        console.error('Erro ao sincronizar despesas:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Carregar viagens do Supabase
 */
async function loadViagensFromSupabase(userId) {
    try {
        const { data: viagens, error } = await supabase
            .from('viagens')
            .select('*')
            .eq('user_id', userId);
        
        if (error) throw error;
        
        // Carregar trechos para cada viagem
        for (const viagem of viagens) {
            const { data: trechos, error: trechosError } = await supabase
                .from('trechos')
                .select('*')
                .eq('viagem_id', viagem.id);
            
            if (trechosError) throw trechosError;
            
            viagem.trechos = trechos || [];
            
            // Carregar pontos e despesas para cada trecho
            for (const trecho of viagem.trechos) {
                const [pontos, despesas] = await Promise.all([
                    supabase.from('pontos').select('*').eq('trecho_id', trecho.id),
                    supabase.from('despesas').select('*').eq('trecho_id', trecho.id)
                ]);
                
                trecho.pontos = pontos.data || [];
                trecho.despesas = despesas.data || [];
            }
        }
        
        return { success: true, viagens: viagens };
    } catch (error) {
        console.error('Erro ao carregar viagens:', error);
        return { success: false, error: error.message };
    }
}