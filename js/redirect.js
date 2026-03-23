// ============================================
// DAVIPLATA - DEVICE REDIRECTOR
// ============================================

function checkDeviceRedirect() {
    const width = window.innerWidth;
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileUA = /mobile|android|iphone|ipad|tablet/i.test(userAgent);
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // Determinar destino
    let target = 'mobile.html';
    if (width >= 992 && !isMobileUA) {
        target = 'desktop.html';
    }

    // Si no estamos en la página correcta, redireccionar
    if (currentPage !== target && (currentPage === 'mobile.html' || currentPage === 'desktop.html')) {
        window.location.href = target;
    }
}

// Ejecutar al cargar y al redimensionar
window.addEventListener('resize', checkDeviceRedirect);
checkDeviceRedirect();
