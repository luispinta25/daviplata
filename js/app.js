// ============================================
// DAVIPLATA - MAIN APPLICATION
// Con autenticación y roles
// ============================================

// Estado de la aplicación
const AppState = {
    movements: [],
    stats: null,
    filter: 'TODOS',
    selectedFile: null,
    selectedMovement: null,
    isLoading: false,
    // Auth state
    session: null,
    user: null,
    userProfile: null,
    isAdmin: false,
    editingMovementId: null
};

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DaviPlata iniciando...');

    // Inicializar Supabase
    initSupabase();

    // Verificar sesión existente
    const session = await getSession();

    if (session) {
        // Usuario autenticado
        await handleAuthSuccess(session);
    } else {
        // Mostrar login
        showLoginScreen();
    }

    // Escuchar cambios de autenticación
    onAuthStateChange(async (event, session) => {
        console.log('Auth event:', event);
        if (event === 'SIGNED_IN' && session) {
            await handleAuthSuccess(session);
        } else if (event === 'SIGNED_OUT') {
            showLoginScreen();
        }
    });

    // Event listeners
    setupEventListeners();

    console.log('DaviPlata listo');
});

/**
 * Maneja el éxito de autenticación
 */
async function handleAuthSuccess(session) {
    AppState.session = session;
    AppState.user = session.user;

    // Obtener perfil con rol
    const profile = await getCurrentUserProfile();
    if (profile) {
        AppState.userProfile = profile;
        AppState.isAdmin = profile.rol === 'admin';
        console.log(`Usuario: ${profile.email} | Rol: ${profile.rol}`);
    }

    // Mostrar app y cargar datos
    showAppScreen();
    await loadDashboard();

    // Actualizar UI según rol
    updateUIForRole();
}

/**
 * Actualiza la UI según el rol del usuario
 */
function updateUIForRole() {
    const fabExpense = document.getElementById('fab-expense');
    const expenseTypeOption = document.querySelector('.type-option.expense');

    if (AppState.isAdmin) {
        // Admin puede ver ambos botones
        if (fabExpense) fabExpense.style.display = 'flex';
        if (expenseTypeOption) expenseTypeOption.style.display = 'block';
    } else {
        // User solo puede ver ingresos
        if (fabExpense) fabExpense.style.display = 'none';
        if (expenseTypeOption) expenseTypeOption.style.display = 'none';
    }

    // Actualizar nombre en header
    const userNameEl = document.getElementById('user-name');
    if (userNameEl && AppState.userProfile) {
        userNameEl.textContent = AppState.userProfile.nombre || AppState.userProfile.email.split('@')[0];
    }

    // Mostrar badge de rol
    const roleBadge = document.getElementById('role-badge');
    if (roleBadge) {
        roleBadge.textContent = AppState.isAdmin ? 'Admin' : 'Usuario';
        roleBadge.className = `role-badge ${AppState.isAdmin ? 'admin' : 'user'}`;
    }
}

/**
 * Muestra la pantalla de login
 */
function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-screen').style.display = 'none';
    AppState.session = null;
    AppState.user = null;
    AppState.userProfile = null;
    AppState.isAdmin = false;
}

/**
 * Muestra la pantalla principal de la app
 */
function showAppScreen() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
}

// ============================================
// CARGA DE DATOS
// ============================================

async function loadDashboard() {
    showLoading(true);

    try {
        // Cargar estadísticas y movimientos en paralelo
        const [stats, movements] = await Promise.all([
            getStatistics(),
            getMovements({ limit: 50 })
        ]);

        AppState.stats = stats;
        AppState.movements = movements;

        renderBalance(stats);
        renderMovements(movements);
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        showToast('Error al cargar datos', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// RENDERIZADO
// ============================================

function renderBalance(stats) {
    const balanceAmount = document.getElementById('balance-amount');
    const incomeStat = document.getElementById('income-stat');
    const expenseStat = document.getElementById('expense-stat');

    if (balanceAmount) {
        balanceAmount.textContent = formatCurrency(stats.balance);
        balanceAmount.classList.remove('positive', 'negative');
        balanceAmount.classList.add(stats.balance >= 0 ? 'positive' : 'negative');
    }

    if (incomeStat) {
        incomeStat.textContent = formatCurrency(stats.total_ingresos);
    }

    if (expenseStat) {
        expenseStat.textContent = formatCurrency(stats.total_egresos);
    }
}

function renderMovements(movements) {
    const container = document.getElementById('movements-list');
    if (!container) return;

    // Filtrar si es necesario
    let filtered = movements;
    if (AppState.filter !== 'TODOS') {
        filtered = movements.filter(m => m.tipo === AppState.filter);
    }

    if (filtered.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i class="fas fa-inbox"></i>
        </div>
        <div class="empty-state-title">No hay movimientos</div>
        <div class="empty-state-text">Registra tu primer ${AppState.isAdmin ? 'ingreso o egreso' : 'ingreso'}</div>
      </div>
    `;
        return;
    }

    container.innerHTML = filtered.map(mov => {
        const editCheck = canEditMovement(mov, AppState.movements);
        const canEdit = editCheck.canEdit;

        return `
      <div class="movement-card ${canEdit ? 'editable' : ''}" data-id="${mov.id}" onclick="showMovementDetail('${mov.id}')">
        <div class="movement-icon ${mov.tipo === 'INGRESO' ? 'income' : 'expense'}">
          <i class="fas fa-${mov.tipo === 'INGRESO' ? 'arrow-down' : 'arrow-up'}"></i>
        </div>
        <div class="movement-info">
          <div class="movement-motivo">${escapeHtml(mov.motivo)}</div>
          <div class="movement-date">
            ${formatDate(mov.fecha, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            ${mov.daviplata_usuarios ? ` · ${mov.daviplata_usuarios.nombre || mov.daviplata_usuarios.email.split('@')[0]}` : ''}
          </div>
        </div>
        <div class="movement-amount ${mov.tipo === 'INGRESO' ? 'income' : 'expense'}">
          ${mov.tipo === 'INGRESO' ? '+' : '-'}${formatCurrency(mov.monto)}
        </div>
        ${mov.comprobante_url ? '<i class="fas fa-paperclip movement-attachment"></i>' : ''}
        ${canEdit ? '<i class="fas fa-pen movement-edit-icon"></i>' : ''}
      </div>
    `;
    }).join('');
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Password toggle
    const togglePassword = document.getElementById('toggle-password');
    if (togglePassword) {
        togglePassword.addEventListener('click', () => {
            const passwordInput = document.getElementById('login-password');
            const icon = togglePassword.querySelector('i');

            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                passwordInput.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    }

    // Logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // FAB para nuevo movimiento
    const fabIncome = document.getElementById('fab-income');
    const fabExpense = document.getElementById('fab-expense');

    if (fabIncome) {
        fabIncome.addEventListener('click', () => openNewMovementModal('INGRESO'));
    }

    if (fabExpense) {
        fabExpense.addEventListener('click', () => openNewMovementModal('EGRESO'));
    }

    // Modal de nuevo movimiento
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });
    }

    // Botón cerrar modal
    const closeBtn = document.getElementById('modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    // Tipo de movimiento
    document.querySelectorAll('.type-option').forEach(btn => {
        btn.addEventListener('click', () => {
            // Solo permitir si es admin o es ingreso
            if (!AppState.isAdmin && btn.dataset.type === 'EGRESO') {
                showToast('Solo administradores pueden registrar egresos', 'error');
                return;
            }
            document.querySelectorAll('.type-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Upload de archivo
    const fileCamera = document.getElementById('file-camera');
    const fileGallery = document.getElementById('file-gallery');
    
    if (fileCamera) {
        fileCamera.addEventListener('change', handleFileSelect);
    }
    if (fileGallery) {
        fileGallery.addEventListener('change', handleFileSelect);
    }

    // Formulario de movimiento
    const form = document.getElementById('movement-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Filtros
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            AppState.filter = btn.dataset.filter;
            renderMovements(AppState.movements);
        });
    });

    // Botón generar PDF
    const pdfBtn = document.getElementById('btn-pdf');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', handleGeneratePDF);
    }

    // Modal de detalle
    const detailOverlay = document.getElementById('detail-modal-overlay');
    if (detailOverlay) {
        detailOverlay.addEventListener('click', (e) => {
            if (e.target === detailOverlay) {
                closeDetailModal();
            }
        });
    }
}

// ============================================
// AUTENTICACIÓN HANDLERS
// ============================================

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        showToast('Ingresa email y contraseña', 'error');
        return;
    }

    showLoading(true, 'Iniciando sesión...');

    const { data, error } = await signIn(email, password);

    showLoading(false);

    if (error) {
        showToast(error, 'error');
    } else {
        showToast('Bienvenido', 'success');
    }
}

async function handleLogout() {
    showLoading(true, 'Cerrando sesión...');
    await signOut();
    showLoading(false);
    showLoginScreen();
    showToast('Sesión cerrada', 'success');
}

// ============================================
// MODAL DE NUEVO MOVIMIENTO
// ============================================

function openNewMovementModal(tipo = null) {
    const modal = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');

    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Pre-seleccionar tipo si se especifica
        if (tipo) {
            document.querySelectorAll('.type-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === tipo);
            });
        }

        // Limpiar formulario
        document.getElementById('movement-form')?.reset();
        clearFilePreview();
        AppState.selectedFile = null;
        AppState.editingMovementId = null;

        // Título según acción
        if (modalTitle) {
            modalTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Nuevo Movimiento';
        }
    }
}

function openEditMovementModal(movement) {
    const modal = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');

    if (!modal) return;

    // Verificar si puede editar
    const editCheck = canEditMovement(movement, AppState.movements);
    if (!editCheck.canEdit) {
        showToast(editCheck.reason, 'error');
        return;
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Pre-llenar formulario
    document.querySelectorAll('.type-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === movement.tipo);
    });

    document.getElementById('input-monto').value = movement.monto;
    document.getElementById('input-motivo').value = movement.motivo;

    AppState.editingMovementId = movement.id;
    AppState.selectedFile = null;

    // Título
    if (modalTitle) {
        modalTitle.innerHTML = '<i class="fas fa-edit"></i> Editar Movimiento';
    }

    // Info de tiempo restante
    showToast(editCheck.reason, 'success');
}

function closeModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        AppState.editingMovementId = null;
        clearFilePreview();
        AppState.selectedFile = null;
    }
}

// ============================================
// MANEJO DE ARCHIVOS
// ============================================

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    AppState.selectedFile = file;

    // Limpiar estado de otros botones de upload
    document.querySelectorAll('.upload-option-item').forEach(el => el.classList.remove('has-file'));

    // Marcar el botón actual
    const optionItem = event.target.closest('.upload-option-item');
    if (optionItem) {
        optionItem.classList.add('has-file');
    }

    // Mostrar preview
    const previewContainer = document.getElementById('file-preview-container');

    if (file.type.startsWith('image/')) {
        const dataUrl = await readFileAsDataURL(file);
        if (previewContainer) {
            previewContainer.innerHTML = `<img src="${dataUrl}" class="file-preview" alt="Preview">`;
        }
    } else {
        if (previewContainer) {
            previewContainer.innerHTML = `<div class="file-name"><i class="fas fa-file"></i> ${file.name}</div>`;
        }
    }
}

function clearFilePreview() {
    document.querySelectorAll('.upload-option-item').forEach(el => el.classList.remove('has-file'));
    const previewContainer = document.getElementById('file-preview-container');

    // Limpiar inputs
    const fileCamera = document.getElementById('file-camera');
    const fileGallery = document.getElementById('file-gallery');
    if (fileCamera) fileCamera.value = '';
    if (fileGallery) fileGallery.value = '';

    if (previewContainer) {
        previewContainer.innerHTML = '';
    }
}

// ============================================
// ENVÍO DE FORMULARIO
// ============================================

async function handleFormSubmit(event) {
    event.preventDefault();

    // Obtener valores
    const activeType = document.querySelector('.type-option.active');
    const tipo = activeType?.dataset.type;
    const monto = parseFloat(document.getElementById('input-monto')?.value);
    const motivo = document.getElementById('input-motivo')?.value?.trim();

    // Validaciones
    if (!tipo) {
        showToast('Selecciona el tipo de movimiento', 'error');
        return;
    }

    // Verificar rol para egresos
    if (tipo === 'EGRESO' && !AppState.isAdmin) {
        showToast('Solo administradores pueden registrar egresos', 'error');
        return;
    }

    if (!monto || monto <= 0) {
        showToast('Ingresa un monto válido', 'error');
        return;
    }

    if (!motivo) {
        showToast('Ingresa el motivo del movimiento', 'error');
        return;
    }

    const isEditing = !!AppState.editingMovementId;

    showLoading(true, isEditing ? 'Actualizando...' : 'Guardando...');

    try {
        let comprobanteUrl = null;

        // Subir comprobante si existe
        if (AppState.selectedFile) {
            showLoading(true, 'Subiendo comprobante...');
            comprobanteUrl = await uploadToWebhook(AppState.selectedFile, AppState.selectedFile.name);
        }

        if (isEditing) {
            // Actualizar movimiento existente
            const updates = { monto, motivo };
            if (comprobanteUrl) updates.comprobante_url = comprobanteUrl;

            const updated = await updateMovement(AppState.editingMovementId, updates);

            if (updated) {
                showToast('Movimiento actualizado', 'success');
                closeModal();
                await loadDashboard();
            }
        } else {
            // Crear nuevo movimiento
            showLoading(true, 'Guardando...');
            const movement = await createMovement({
                tipo,
                monto,
                motivo,
                comprobante_url: comprobanteUrl
            }, AppState.userProfile.id);

            if (movement) {
                showToast(`${tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'} registrado`, 'success');
                closeModal();
                await loadDashboard();
            }
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al guardar el movimiento', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// DETALLE DE MOVIMIENTO
// ============================================

async function showMovementDetail(id) {
    const movement = AppState.movements.find(m => m.id === id);
    if (!movement) return;

    AppState.selectedMovement = movement;

    const modal = document.getElementById('detail-modal-overlay');
    const content = document.getElementById('detail-modal-content');

    if (!modal || !content) return;

    const isIngreso = movement.tipo === 'INGRESO';
    const editCheck = canEditMovement(movement, AppState.movements);

    content.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title">
        <i class="fas fa-receipt"></i> Detalle del Movimiento
      </h2>
      <button class="modal-close" id="detail-modal-close">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="modal-body">
      <div class="detail-header">
        <span class="detail-type ${isIngreso ? 'income' : 'expense'}">
          <i class="fas fa-${isIngreso ? 'arrow-down' : 'arrow-up'}"></i>
          ${movement.tipo}
        </span>
        <div class="detail-amount ${isIngreso ? 'income' : 'expense'}">
          ${isIngreso ? '+' : '-'}${formatCurrency(movement.monto)}
        </div>
      </div>
      
      <div class="detail-section">
        <div class="detail-label">Motivo</div>
        <div class="detail-value">${escapeHtml(movement.motivo)}</div>
      </div>
      
      <div class="detail-section">
        <div class="detail-label">Fecha</div>
        <div class="detail-value">${formatDate(movement.fecha, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      
      ${movement.daviplata_usuarios ? `
        <div class="detail-section">
          <div class="detail-label">Registrado por</div>
          <div class="detail-value">${movement.daviplata_usuarios.nombre || movement.daviplata_usuarios.email}</div>
        </div>
      ` : ''}
      
      ${movement.comprobante_url ? `
        <div class="detail-section">
          <div class="detail-label">Comprobante</div>
          <img src="${movement.comprobante_url}" class="detail-image" alt="Comprobante" onclick="window.open('${movement.comprobante_url}', '_blank')">
        </div>
      ` : ''}
      
      <div class="detail-actions">
        <button class="btn btn-secondary btn-block" onclick="handleDownloadReceipt()">
          <i class="fas fa-file-pdf"></i> Descargar PDF
        </button>
        ${editCheck.canEdit ? `
          <button class="btn btn-primary" onclick="handleEditMovement('${movement.id}')">
            <i class="fas fa-pen"></i> Editar
          </button>
        ` : ''}
      </div>
      
      ${editCheck.canEdit ? `
        <div class="edit-time-notice">
          <i class="fas fa-clock"></i> ${editCheck.reason}
        </div>
      ` : ''}
    </div>
  `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Re-attach close event
    document.getElementById('detail-modal-close')?.addEventListener('click', closeDetailModal);
}

function closeDetailModal() {
    const modal = document.getElementById('detail-modal-overlay');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    AppState.selectedMovement = null;
}

function handleEditMovement(id) {
    const movement = AppState.movements.find(m => m.id === id);
    if (movement) {
        closeDetailModal();
        setTimeout(() => openEditMovementModal(movement), 300);
    }
}

function handleDownloadReceipt() {
    if (AppState.selectedMovement) {
        generateMovementReceipt(AppState.selectedMovement);
    }
}

// ============================================
// GENERACIÓN DE PDF
// ============================================

async function handleGeneratePDF() {
    if (AppState.movements.length === 0) {
        showToast('No hay movimientos para exportar', 'error');
        return;
    }

    showLoading(true, 'Generando PDF...');

    try {
        await generateMovementsReport(AppState.movements, AppState.stats, {
            periodo: 'Todos los movimientos'
        });
    } catch (error) {
        console.error('Error generando PDF:', error);
        showToast('Error al generar PDF', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// UTILIDADES
// ============================================

function showLoading(show, text = 'Cargando...') {
    let overlay = document.getElementById('loading-overlay');

    if (show) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
        <div class="spinner"></div>
        <div class="loading-text">${text}</div>
      `;
            document.body.appendChild(overlay);
        } else {
            overlay.querySelector('.loading-text').textContent = text;
            overlay.style.display = 'flex';
        }
        AppState.isLoading = true;
    } else {
        if (overlay) {
            overlay.style.display = 'none';
        }
        AppState.isLoading = false;
    }
}

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');

    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'} toast-icon"></i>
    <span class="toast-message">${message}</span>
  `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Formatea un número como moneda USD con 2 decimales
 * @param {number} amount - Monto a formatear
 * @returns {string} - Monto formateado (ej: $1,234.56)
 */
function formatCurrency(amount) {
    const value = parseFloat(amount) || 0;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

/**
 * Formatea una fecha
 * @param {string|Date} date - Fecha a formatear
 * @param {object} options - Opciones de formato
 * @returns {string} - Fecha formateada
 */
function formatDate(date, options = {}) {
    const d = new Date(date);
    const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options
    };
    return d.toLocaleDateString(CONFIG.DATE_LOCALE || 'en-US', defaultOptions);
}
