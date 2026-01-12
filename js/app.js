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
    hasWelcomed: false, // Evitar mensajes duplicados
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

    // Mensaje de bienvenida elegante
    if (!AppState.hasWelcomed && AppState.userProfile) {
        const nombreDisplay = formatDisplayName(AppState.userProfile.nombre || AppState.userProfile.email.split('@')[0]);
        
        // Toast elegante
        setTimeout(() => {
            showToast(`¡Bienvenido de nuevo, ${nombreDisplay}!`, 'success');
        }, 800);
        
        AppState.hasWelcomed = true;
    }
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
        userNameEl.textContent = 'Hola,';
    }

    // Mostrar badge con el nombre formateado (antes mostraba ADMIN/USUARIO)
    const roleBadge = document.getElementById('role-badge');
    if (roleBadge && AppState.userProfile) {
        const nombreDisplay = formatDisplayName(AppState.userProfile.nombre || AppState.userProfile.email.split('@')[0]);
        roleBadge.textContent = nombreDisplay;
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

/**
 * Muestra un diálogo de confirmación personalizado
 * @param {string} title - Título del modal
 * @param {string} message - Mensaje del modal
 * @param {string} icon - Icono FontAwesome (opcional)
 * @returns {Promise<boolean>}
 */
function showConfirm(title, message, icon = 'fa-question-circle') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal-overlay');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const iconEl = modal?.querySelector('.confirm-icon i');
        const btnOk = document.getElementById('confirm-ok');
        const btnCancel = document.getElementById('confirm-cancel');

        if (!modal || !btnOk || !btnCancel) {
            resolve(confirm(message));
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;
        if (iconEl) iconEl.className = `fas ${icon}`;

        modal.classList.add('active');

        const onOk = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            modal.classList.remove('active');
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
        };

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
    });
}

// ============================================
// RENDERIZADO
// ============================================

function renderBalance(stats) {
    const balanceAmount = document.getElementById('balance-amount');
    const incomeStat = document.getElementById('income-stat');
    const expenseStat = document.getElementById('expense-stat');
    const pendingContainer = document.getElementById('pending-balance-container');
    const pendingAmount = document.getElementById('pending-balance-amount');

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

    // Manejar saldo pendiente
    if (pendingContainer && pendingAmount) {
        if (stats.total_pendiente > 0) {
            pendingAmount.textContent = formatCurrency(stats.total_pendiente);
            pendingContainer.style.display = 'flex';
        } else {
            pendingContainer.style.display = 'none';
        }
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
        const isPending = mov.verified === 'PENDIENTE';

        return `
      <div class="movement-card ${canEdit ? 'editable' : ''} ${isPending ? 'pending' : ''}" data-id="${mov.id}" onclick="showMovementDetail('${mov.id}')">
        <div class="movement-icon ${mov.tipo === 'INGRESO' ? 'income' : 'expense'}">
          <i class="fas fa-${mov.tipo === 'INGRESO' ? 'arrow-down' : 'arrow-up'}"></i>
        </div>
        <div class="movement-info">
          <div class="movement-motivo">
            ${escapeHtml(mov.motivo)}
            ${isPending ? '<span class="pending-badge"><i class="fas fa-clock"></i> Pendiente</span>' : ''}
          </div>
          <div class="movement-date">
            ${formatDate(mov.fecha, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            ${mov.daviplata_usuarios ? ` · ${formatDisplayName(mov.daviplata_usuarios.nombre || mov.daviplata_usuarios.email.split('@')[0])}` : ''}
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
        pdfBtn.addEventListener('click', openPdfModal);
    }

    const btnGeneratePdf = document.getElementById('btn-generate-pdf');
    if (btnGeneratePdf) {
        btnGeneratePdf.addEventListener('click', handleGeneratePDF);
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

    // Mostrar preview si ya tiene imagen
    const previewContainer = document.getElementById('file-preview-container');
    if (previewContainer) {
        if (movement.comprobante_url) {
            if (movement.comprobante_url.toLowerCase().endsWith('.pdf')) {
                previewContainer.innerHTML = `
                    <div class="file-name-badge">
                        <i class="fas fa-file-pdf"></i>
                        <span>Documento PDF existente</span>
                    </div>
                `;
            } else {
                previewContainer.innerHTML = `
                    <img src="${movement.comprobante_url}" class="upload-preview-img" alt="Preview" onclick="window.open('${movement.comprobante_url}', '_blank')">
                `;
            }
        } else {
            previewContainer.innerHTML = '';
        }
    }

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

    // Solo permitir imágenes
    if (!file.type.startsWith('image/')) {
        showToast('Solo se permiten imágenes (JPG, PNG)', 'warning');
        event.target.value = '';
        return;
    }

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
    if (!previewContainer) return;

    if (file.type.startsWith('image/')) {
        const dataUrl = await readFileAsDataURL(file);
        if (previewContainer) {
            previewContainer.innerHTML = `<img src="${dataUrl}" class="upload-preview-img" alt="Preview" onclick="window.open('${dataUrl}', '_blank')">`;
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

        // Definir estado de verificación
        // Si lo edita/crea un ADMIN se autoverifica. Si es un USUARIO normal, siempre pasa a PENDIENTE.
        const verified = AppState.isAdmin ? 'VERIFICADO' : 'PENDIENTE';

        if (isEditing) {
            // ============================================
            // FLUJO DE EDICIÓN (ORDEN CRÍTICO)
            // ============================================
            
            // 1. Obtener datos actuales antes de actualizar
            const oldMovement = await getMovementById(AppState.editingMovementId);
            
            // 2. Webhook de eliminación PRIMERO (si tiene idmessage)
            if (oldMovement && oldMovement.idmessage) {
                await notifyDeletionWebhook(oldMovement);
            }

            // 3. Actualizar en Base de Datos con los nuevos valores
            const updates = { monto, motivo, verified };
            if (comprobanteUrl) updates.comprobante_url = comprobanteUrl;

            const updatedData = await updateMovement(AppState.editingMovementId, updates);

            if (updatedData) {
                // 4. Webhook de Notificación con los datos nuevos
                // (Este webhook registra internamente el nuevo idmessage retornado por n8n)
                await notifyMovementWebhook(updatedData);

                showToast('Movimiento actualizado y re-notificado', 'success');
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
                comprobante_url: comprobanteUrl,
                verified
            }, AppState.userProfile.id);

            if (movement) {
                showToast(verified === 'PENDIENTE' ? 'Registrado (Pendiente de verificación)' : 'Movimiento registrado', 'success');
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
    const isPending = movement.verified === 'PENDIENTE';
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
        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
          <span class="detail-type ${isIngreso ? 'income' : 'expense'}">
            <i class="fas fa-${isIngreso ? 'arrow-down' : 'arrow-up'}"></i>
            ${movement.tipo}
          </span>
          ${isPending ? '<span class="pending-badge" style="margin:0"><i class="fas fa-clock"></i> PENDIENTE DE VERIFICACIÓN</span>' : ''}
        </div>
        <div class="detail-amount ${isIngreso ? 'income' : 'expense'} ${isPending ? 'pending' : ''}" style="${isPending ? 'color: #9CA3AF !important' : ''}">
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
          <div class="detail-value">${formatDisplayName(movement.daviplata_usuarios.nombre || movement.daviplata_usuarios.email)}</div>
        </div>
      ` : ''}
      
      ${movement.comprobante_url ? `
        <div class="detail-section">
          <div class="detail-label">Comprobante</div>
          <div class="detail-image-container">
            ${movement.comprobante_url.toLowerCase().endsWith('.pdf') ? `
              <div class="detail-image-square pdf-preview" onclick="window.open('${movement.comprobante_url}', '_blank')">
                <i class="fas fa-file-pdf"></i>
                <span>Abrir documento</span>
              </div>
            ` : `
              <div class="detail-image-square" onclick="window.open('${movement.comprobante_url}', '_blank')">
                <div class="loader" id="detail-img-loader"></div>
                <img src="${movement.comprobante_url}" alt="Comprobante" 
                     onload="document.getElementById('detail-img-loader').style.display='none'">
              </div>
            `}
          </div>
        </div>
      ` : ''}
      
      <div class="detail-actions">
        ${AppState.isAdmin && isPending ? `
          <button class="btn btn-success circle-btn" onclick="handleVerifyMovement('${movement.id}')" title="Verificar Movimiento">
            <i class="fas fa-check"></i>
          </button>
        ` : ''}
        <button class="btn btn-secondary circle-btn" onclick="handleDownloadReceipt()" title="Descargar PDF">
          <i class="fas fa-file-pdf"></i>
        </button>
        ${editCheck.canEdit ? `
          <button class="btn btn-primary circle-btn" onclick="handleEditMovement('${movement.id}')" title="Editar">
            <i class="fas fa-pen"></i>
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

async function handleVerifyMovement(id) {
    const movement = AppState.movements.find(m => m.id === id);
    if (!movement) return;

    const confirmed = await showConfirm(
        'Verificar Movimiento',
        '¿Estás seguro de que deseas verificar este movimiento? Esto actualizará el saldo y enviará una notificación.',
        'fa-check-circle'
    );

    if (!confirmed) return;

    showLoading(true, 'Verificando movimiento...');

    try {
        // 1. Obtener la versión más reciente del movimiento para asegurar tener idmessage y remote_jid
        const latestMovement = await getMovementById(id);
        if (!latestMovement) {
            showToast('No se pudo encontrar el movimiento actualizado', 'error');
            return;
        }

        // 2. Actualizar en Supabase a VERIFICADO
        const success = await updateMovement(id, { verified: 'VERIFICADO' });

        if (success) {
            // 3. Notificar al webhook de verificación (solo si es admin y se verifica manualmente)
            // Usamos latestMovement para asegurar que tenemos idmessage y remote_jid
            if (latestMovement.idmessage && latestMovement.remote_jid) {
                await notifyVerificationWebhook(latestMovement);
            } else {
                console.warn('No se pudo enviar notificación de WhatsApp: faltan datos del webhook original');
                showToast('Verificado sin notificación (datos de WhatsApp no disponibles)', 'warning');
            }

            showToast('Movimiento verificado exitosamente', 'success');
            
            // 4. Recargar datos para actualizar la UI
            closeDetailModal();
            await loadDashboard();
        } else {
            showToast('Error al actualizar el estado del movimiento', 'error');
        }
    } catch (error) {
        console.error('Error en handleVerifyMovement:', error);
        showToast('Ocurrió un error al verificar', 'error');
    } finally {
        showLoading(false);
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

function openPdfModal() {
    const modal = document.getElementById('pdf-modal-overlay');
    if (modal) {
        // Reset fechas por defecto (mes actual)
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        
        document.getElementById('pdf-date-start').value = firstDay;
        document.getElementById('pdf-date-end').value = lastDay;
        
        modal.classList.add('active');
    }
}

function closePdfModal() {
    const modal = document.getElementById('pdf-modal-overlay');
    if (modal) modal.classList.remove('active');
}

async function handleGeneratePDF() {
    const typeFilter = document.querySelector('input[name="pdf-type"]:checked').value;
    const dateStart = document.getElementById('pdf-date-start').value;
    const dateEnd = document.getElementById('pdf-date-end').value;
    const mode = document.querySelector('input[name="pdf-mode"]:checked').value;

    if (!dateStart || !dateEnd) {
        showToast('Selecciona un rango de fechas', 'error');
        return;
    }

    showLoading(true, 'Filtrando movimientos...');

    try {
        // Obtener el cliente de Supabase
        const client = getSupabase();
        if (!client) throw new Error('No se pudo conectar con Supabase');

        // Obtener movimientos filtrados desde Supabase
        const { data: movements, error } = await client
            .from('daviplata_movimientos')
            .select('*')
            .gte('fecha', dateStart + 'T00:00:00')
            .lte('fecha', dateEnd + 'T23:59:59')
            .order('fecha', { ascending: false });

        if (error) throw error;

        // Filtrar por tipo si no es TODOS
        let filteredMovements = movements;
        if (typeFilter !== 'TODOS') {
            filteredMovements = movements.filter(m => m.tipo === typeFilter);
        }

        if (filteredMovements.length === 0) {
            showToast('No hay movimientos en este rango', 'warning');
            return;
        }

        // Calcular estadísticas para el reporte basado en los filtrados
        const stats = {
            total_ingresos: filteredMovements.filter(m => m.tipo === 'INGRESO').reduce((acc, m) => acc + m.monto, 0),
            total_egresos: filteredMovements.filter(m => m.tipo === 'EGRESO').reduce((acc, m) => acc + m.monto, 0),
            balance: filteredMovements.reduce((acc, m) => acc + (m.tipo === 'INGRESO' ? m.monto : -m.monto), 0)
        };

        showLoading(true, 'Generando PDF...');

        await generateMovementsReport(filteredMovements, stats, {
            periodo: `${formatDateShort(dateStart)} al ${formatDateShort(dateEnd)}`,
            tipo: typeFilter,
            mode: mode // 'device' o 'print'
        });

        closePdfModal();
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
