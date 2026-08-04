// ============================================================
// Auth - Lógica de Autenticação
// ============================================================

/**
 * Página de Login
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('loginError');
    const loadingElement = document.getElementById('loginLoading');
    const button = document.getElementById('loginButton');
    
    // Mostrar loading
    button.disabled = true;
    loadingElement.style.display = 'inline';
    errorElement.style.display = 'none';
    
    const result = await loginUser(email, password);
    
    // Esconder loading
    button.disabled = false;
    loadingElement.style.display = 'none';
    
    if (result.success) {
        // Login bem sucedido
        window.location.href = 'index.html';
    } else {
        // Mostrar erro
        errorElement.textContent = result.error || 'Erro ao fazer login. Tente novamente.';
        errorElement.style.display = 'block';
    }
}

/**
 * Página de Cadastro
 */
async function handleSignup(event) {
    event.preventDefault();
    
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorElement = document.getElementById('signupError');
    const loadingElement = document.getElementById('signupLoading');
    const button = document.getElementById('signupButton');
    
    // Validar senhas
    if (password !== confirmPassword) {
        errorElement.textContent = 'As senhas não coincidem.';
        errorElement.style.display = 'block';
        return;
    }
    
    if (password.length < 6) {
        errorElement.textContent = 'A senha deve ter pelo menos 6 caracteres.';
        errorElement.style.display = 'block';
        return;
    }
    
    // Mostrar loading
    button.disabled = true;
    loadingElement.style.display = 'inline';
    errorElement.style.display = 'none';
    
    const result = await signupUser(email, password, name);
    
    // Esconder loading
    button.disabled = false;
    loadingElement.style.display = 'none';
    
    if (result.success) {
        // Cadastro bem sucedido
        alert('Cadastro realizado com sucesso! Por favor, verifique seu e-mail para confirmar sua conta.');
        window.location.href = 'login.html';
    } else {
        // Mostrar erro
        errorElement.textContent = result.error || 'Erro ao cadastrar. Tente novamente.';
        errorElement.style.display = 'block';
    }
}

/**
 * Página de Recuperação de Senha
 */
async function handleForgotPassword(event) {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const errorElement = document.getElementById('forgotError');
    const successElement = document.getElementById('forgotSuccess');
    const loadingElement = document.getElementById('forgotLoading');
    const button = document.getElementById('forgotButton');
    
    // Mostrar loading
    button.disabled = true;
    loadingElement.style.display = 'inline';
    errorElement.style.display = 'none';
    successElement.style.display = 'none';
    
    const result = await forgotPassword(email);
    
    // Esconder loading
    button.disabled = false;
    loadingElement.style.display = 'none';
    
    if (result.success) {
        successElement.style.display = 'block';
        document.getElementById('email').value = '';
    } else {
        errorElement.textContent = result.error || 'Erro ao enviar e-mail de recuperação.';
        errorElement.style.display = 'block';
    }
}

/**
 * Página de Redefinição de Senha
 */
async function handleResetPassword(event) {
    event.preventDefault();
    
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorElement = document.getElementById('resetError');
    const successElement = document.getElementById('resetSuccess');
    const loadingElement = document.getElementById('resetLoading');
    const button = document.getElementById('resetButton');
    
    // Validar senhas
    if (newPassword !== confirmPassword) {
        errorElement.textContent = 'As senhas não coincidem.';
        errorElement.style.display = 'block';
        return;
    }
    
    if (newPassword.length < 6) {
        errorElement.textContent = 'A senha deve ter pelo menos 6 caracteres.';
        errorElement.style.display = 'block';
        return;
    }
    
    // Mostrar loading
    button.disabled = true;
    loadingElement.style.display = 'inline';
    errorElement.style.display = 'none';
    successElement.style.display = 'none';
    
    const result = await resetPassword(newPassword);
    
    // Esconder loading
    button.disabled = false;
    loadingElement.style.display = 'none';
    
    if (result.success) {
        successElement.style.display = 'block';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 3000);
    } else {
        errorElement.textContent = result.error || 'Erro ao redefinir senha.';
        errorElement.style.display = 'block';
    }
}

/**
 * Verificar autenticação e proteger páginas
 */
async function checkAuthAndRedirect() {
    const result = await checkAuth();
    const currentPage = window.location.pathname.split('/').pop();
    
    // Páginas públicas (não precisam de autenticação)
    const publicPages = ['login.html', 'signup.html', 'forgot-password.html', 'reset-password.html'];
    
    if (!result.authenticated && !publicPages.includes(currentPage)) {
        // Redirecionar para login
        window.location.href = 'login.html';
        return false;
    }
    
    if (result.authenticated && publicPages.includes(currentPage)) {
        // Redirecionar para index se já estiver logado
        window.location.href = 'index.html';
        return false;
    }
    
    return result;
}

/**
 * Logout
 */
async function handleLogout() {
    if (!confirm('Tem certeza que deseja sair?')) return;
    
    const result = await logoutUser();
    
    if (result.success) {
        window.location.href = 'login.html';
    } else {
        alert('Erro ao sair: ' + result.error);
    }
}