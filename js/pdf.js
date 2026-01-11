// ============================================
// DAVIPLATA - PDF GENERATION MODULE
// Reportes profesionales con jsPDF
// ============================================

/**
 * Formatea un monto como moneda USD con 2 decimales
 */
function formatCurrencyPDF(amount) {
    const value = parseFloat(amount) || 0;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

/**
 * Formatea una fecha en español
 */
function formatDatePDF(date, options = {}) {
    const defaultOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        ...options
    };
    return new Date(date).toLocaleDateString('es-ES', defaultOptions);
}

/**
 * Formatea fecha corta
 */
function formatDateShort(date) {
    return new Date(date).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

/**
 * Limpia el texto para nombre de archivo
 */
function sanitizeFilename(text) {
    return text
        .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 30);
}

/**
 * Carga una imagen y la convierte a base64 conservando transparencia (PNG)
 */
async function loadImageAsBase64(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                // Limpiar el canvas para asegurar transparencia
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                // Usar image/png para conservar transparencia y evitar bordes negros (del JPEG)
                resolve(canvas.toDataURL('image/png'));
            } catch (e) {
                console.warn('Error convirtiendo imagen:', e);
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

/**
 * Guarda el PDF con el nombre correcto
 * Usa un método robusto con Blob y enlace temporal para asegurar la descarga y el nombre del archivo
 */
function savePDFWithName(doc, filename) {
    // Sanitizar el nombre del archivo por si acaso
    // Elimina caracteres prohibidos en sistemas de archivos (Windows/Linux/Mac)
    let safeFilename = filename.replace(/[<>:"/\\|?*]/g, '_').trim();
    
    // Asegurar que el filename tenga extensión .pdf
    if (!safeFilename.toLowerCase().endsWith('.pdf')) {
        safeFilename = safeFilename + '.pdf';
    }

    // Si por alguna razón el nombre queda vacío, usar un default
    if (safeFilename === '.pdf') {
        safeFilename = 'reporte_' + Date.now() + '.pdf';
    }

    try {
        // Generar el blob del PDF
        const blob = doc.output('blob');
        
        // Crear una URL para el blob
        const url = URL.createObjectURL(blob);
        
        // Crear un elemento de enlace temporal
        const link = document.createElement('a');
        link.href = url;
        link.download = safeFilename; // Aquí se especifica el nombre del archivo
        
        // Añadir al DOM, hacer click y remover
        document.body.appendChild(link);
        link.click();
        
        // Limpieza suave con un timeout para asegurar que el navegador procese el click
        setTimeout(() => {
            if (document.body.contains(link)) {
                document.body.removeChild(link);
            }
            URL.revokeObjectURL(url);
        }, 150);

        console.log('PDF generado exitosamente:', safeFilename);
    } catch (error) {
        console.error('Error durante la descarga del PDF:', error);
        // Fallback final al método nativo de jsPDF por si el método manual falla
        try {
            doc.save(safeFilename);
        } catch (e2) {
            console.error('Fallback doc.save también falló:', e2);
        }
    }
}

/**
 * Genera un PDF de reporte consolidado de movimientos
 * @param {Array} movements - Lista de movimientos
 * @param {Object} stats - Estadísticas
 * @param {Object} options - Opciones del reporte
 */
async function generateMovementsReport(movements, stats, options = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let yPos = margin;

    // Colores de marca
    const primaryColor = [217, 107, 43]; // #D96B2B
    const darkColor = [64, 64, 63]; // #40403F
    const successColor = [16, 185, 129]; // Verde
    const dangerColor = [239, 68, 68]; // Rojo

    // ============================================
    // HEADER
    // ============================================
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 6, 'F');

    yPos = 18;

    // Logo (Imagen en lugar de texto)
    const logoUrl = 'https://i.ibb.co/FLFGvTNp/DAVIPLATALOGO.png';
    const logoData = await loadImageAsBase64(logoUrl);
    
    if (logoData) {
        // Añadir logo con relación de aspecto 4.5:1 (45mm x 10mm)
        doc.addImage(logoData, 'PNG', margin, yPos - 8, 45, 10);
    } else {
        // Fallback texto si la imagen falla
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(24);
        doc.setTextColor(...primaryColor);
        doc.text('DAVIPLATA', margin, yPos);
    }

    // Fecha de generación
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generado: ${formatDatePDF(new Date())}`, pageWidth - margin, yPos, { align: 'right' });

    // Subtítulo
    yPos += 6;
    doc.setFontSize(10);
    doc.text('Reporte Consolidado de Movimientos', margin, yPos);

    // Línea separadora
    yPos += 6;
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);

    // ============================================
    // RESUMEN FINANCIERO
    // ============================================
    yPos += 10;

    // Caja de resumen
    const boxHeight = 28;
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), boxHeight, 2, 2, 'F');

    // Tres columnas
    const colWidth = (pageWidth - (margin * 2)) / 3;
    const boxYCenter = yPos + (boxHeight / 2);

    // Ingresos
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('INGRESOS', margin + (colWidth / 2), boxYCenter - 6, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...successColor);
    doc.text(formatCurrencyPDF(stats.total_ingresos), margin + (colWidth / 2), boxYCenter + 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`${stats.cantidad_ingresos || 0} mov.`, margin + (colWidth / 2), boxYCenter + 8, { align: 'center' });

    // Egresos
    doc.setFontSize(8);
    doc.text('EGRESOS', margin + colWidth + (colWidth / 2), boxYCenter - 6, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...dangerColor);
    doc.text(formatCurrencyPDF(stats.total_egresos), margin + colWidth + (colWidth / 2), boxYCenter + 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`${stats.cantidad_egresos || 0} mov.`, margin + colWidth + (colWidth / 2), boxYCenter + 8, { align: 'center' });

    // Balance
    doc.setFontSize(8);
    doc.text('BALANCE', margin + (colWidth * 2) + (colWidth / 2), boxYCenter - 6, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...(stats.balance >= 0 ? successColor : dangerColor));
    doc.text(formatCurrencyPDF(stats.balance), margin + (colWidth * 2) + (colWidth / 2), boxYCenter + 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`${stats.total_movimientos || 0} total`, margin + (colWidth * 2) + (colWidth / 2), boxYCenter + 8, { align: 'center' });

    yPos += boxHeight + 10;

    // ============================================
    // TABLA DE MOVIMIENTOS
    // ============================================
    const tableHeaders = ['Fecha', 'Tipo', 'Descripción', 'Monto', 'Comprobante'];
    const colWidths = [25, 20, 65, 30, 28];

    // Header de tabla
    doc.setFillColor(...darkColor);
    doc.rect(margin, yPos, pageWidth - (margin * 2), 7, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);

    let xPos = margin + 2;
    tableHeaders.forEach((header, i) => {
        doc.text(header, xPos, yPos + 4.5);
        xPos += colWidths[i];
    });

    yPos += 8;

    // Filas de datos
    let rowCount = 0;
    const maxRowsPerPage = 30;

    movements.forEach((mov, index) => {
        // Nueva página si es necesario
        if (rowCount >= maxRowsPerPage) {
            doc.addPage();
            yPos = margin;
            rowCount = 0;

            // Re-dibujar header
            doc.setFillColor(...darkColor);
            doc.rect(margin, yPos, pageWidth - (margin * 2), 7, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);

            xPos = margin + 2;
            tableHeaders.forEach((header, i) => {
                doc.text(header, xPos, yPos + 4.5);
                xPos += colWidths[i];
            });
            yPos += 8;
        }

        // Fondo alternado
        if (index % 2 === 0) {
            doc.setFillColor(252, 252, 252);
            doc.rect(margin, yPos, pageWidth - (margin * 2), 6, 'F');
        }

        xPos = margin + 2;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        // Fecha
        doc.setTextColor(...darkColor);
        doc.text(formatDateShort(mov.fecha), xPos, yPos + 4);
        xPos += colWidths[0];

        // Tipo
        doc.setTextColor(...(mov.tipo === 'INGRESO' ? successColor : dangerColor));
        doc.text(mov.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso', xPos, yPos + 4);
        xPos += colWidths[1];

        // Descripción (truncar)
        doc.setTextColor(...darkColor);
        let motivo = mov.motivo || '';
        if (motivo.length > 38) {
            motivo = motivo.substring(0, 35) + '...';
        }
        doc.text(motivo, xPos, yPos + 4);
        xPos += colWidths[2];

        // Monto
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(mov.tipo === 'INGRESO' ? successColor : dangerColor));
        const prefix = mov.tipo === 'INGRESO' ? '+' : '-';
        doc.text(prefix + formatCurrencyPDF(mov.monto), xPos, yPos + 4);
        doc.setFont('helvetica', 'normal');
        xPos += colWidths[3];

        // Comprobante (link)
        if (mov.comprobante_url) {
            doc.setTextColor(...primaryColor);
            doc.textWithLink('Ver archivo', xPos, yPos + 4, { url: mov.comprobante_url });
        } else {
            doc.setTextColor(180, 180, 180);
            doc.text('-', xPos, yPos + 4);
        }

        yPos += 6;
        rowCount++;
    });

    // ============================================
    // FOOTER
    // ============================================
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const footerY = pageHeight - 10;

        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text('DaviPlata - Sistema de Control de Movimientos', margin, footerY);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
    }

    // ============================================
    // GUARDAR
    // ============================================
    const fecha = formatDateShort(new Date()).replace(/\//g, '-');
    const filename = `DaviPlata_Reporte_${fecha}.pdf`;
    savePDFWithName(doc, filename);
    showToast('Reporte PDF descargado', 'success');
}

/**
 * Genera un comprobante individual de movimiento con imagen
 * @param {Object} movement - Datos del movimiento
 */
async function generateMovementReceipt(movement) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let yPos = 0;

    // Colores
    const primaryColor = [217, 107, 43];
    const darkColor = [64, 64, 63];
    const isIngreso = movement.tipo === 'INGRESO';
    const typeColor = isIngreso ? [16, 185, 129] : [239, 68, 68];

    // ============================================
    // HEADER
    // ============================================
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 8, 'F');

    yPos = 22;

    // Logo (Imagen centrada en lugar de texto)
    const logoUrl = 'https://i.ibb.co/FLFGvTNp/DAVIPLATALOGO.png';
    const logoData = await loadImageAsBase64(logoUrl);
    
    if (logoData) {
        const logoWidth = 54;
        const logoHeight = 12;
        const logoX = (pageWidth - logoWidth) / 2;
        // Posicionar logo centrado con relación 4.5:1
        doc.addImage(logoData, 'PNG', logoX, yPos - 10, logoWidth, logoHeight);
    } else {
        // Fallback texto si la imagen falla
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(26);
        doc.setTextColor(...primaryColor);
        doc.text('DAVIPLATA', pageWidth / 2, yPos, { align: 'center' });
    }

    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text('Comprobante de Movimiento', pageWidth / 2, yPos, { align: 'center' });

    // Línea decorativa
    yPos += 8;
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.8);
    doc.line(margin + 40, yPos, pageWidth - margin - 40, yPos);

    // ============================================
    // TIPO Y MONTO
    // ============================================
    yPos += 15;

    // Badge de tipo
    const badgeWidth = 35;
    const badgeHeight = 8;
    const badgeX = (pageWidth - badgeWidth) / 2;
    doc.setFillColor(...typeColor);
    doc.roundedRect(badgeX, yPos - 5, badgeWidth, badgeHeight, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(movement.tipo, pageWidth / 2, yPos, { align: 'center' });

    // Monto grande
    yPos += 18;
    doc.setFontSize(36);
    doc.setTextColor(...typeColor);
    const prefix = isIngreso ? '+' : '-';
    doc.text(prefix + formatCurrencyPDF(movement.monto), pageWidth / 2, yPos, { align: 'center' });

    // ============================================
    // DETALLES
    // ============================================
    yPos += 18;

    // Caja de detalles
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 55, 3, 3, 'F');

    const labelX = margin + 10;
    const valueX = margin + 45;
    yPos += 15;

    // Fecha
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Fecha:', labelX, yPos);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    doc.text(formatDatePDF(movement.fecha, { hour: '2-digit', minute: '2-digit' }), valueX, yPos);

    // Motivo
    yPos += 12;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Motivo:', labelX, yPos);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);

    const maxWidth = pageWidth - valueX - margin - 5;
    const motivoLines = doc.splitTextToSize(movement.motivo || 'Sin descripción', maxWidth);
    doc.text(motivoLines.slice(0, 2), valueX, yPos);

    // Usuario
    yPos += (Math.min(motivoLines.length, 2) * 5) + 7;
    if (movement.daviplata_usuarios) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text('Registrado por:', labelX, yPos);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(movement.daviplata_usuarios.nombre || movement.daviplata_usuarios.email || '-', valueX, yPos);
    }

    // ID
    yPos += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`ID: ${movement.id}`, labelX, yPos);

    // ============================================
    // IMAGEN DEL COMPROBANTE
    // ============================================
    if (movement.comprobante_url) {
        yPos += 20;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...darkColor);
        doc.text('Comprobante Adjunto', margin, yPos);

        yPos += 5;

        // Intentar cargar la imagen
        const imgData = await loadImageAsBase64(movement.comprobante_url);

        if (imgData) {
            const imgMaxWidth = pageWidth - (margin * 2);
            const imgMaxHeight = pageHeight - yPos - 30;

            try {
                // Obtener dimensiones originales
                const img = new Image();
                img.src = imgData;
                await new Promise(resolve => { img.onload = resolve; });

                let imgWidth = img.width;
                let imgHeight = img.height;

                // Escalar manteniendo proporción
                if (imgWidth > imgMaxWidth) {
                    const ratio = imgMaxWidth / imgWidth;
                    imgWidth = imgMaxWidth;
                    imgHeight = imgHeight * ratio;
                }
                if (imgHeight > imgMaxHeight) {
                    const ratio = imgMaxHeight / imgHeight;
                    imgHeight = imgMaxHeight;
                    imgWidth = imgWidth * ratio;
                }

                // Centrar imagen
                const imgX = (pageWidth - imgWidth) / 2;

                // Marco para imagen
                doc.setDrawColor(230, 230, 230);
                doc.setLineWidth(0.5);
                doc.roundedRect(imgX - 2, yPos, imgWidth + 4, imgHeight + 4, 2, 2, 'S');

                doc.addImage(imgData, 'JPEG', imgX, yPos + 2, imgWidth, imgHeight);
            } catch (e) {
                console.warn('Error agregando imagen al PDF:', e);
                // Link como fallback
                doc.setTextColor(...primaryColor);
                doc.textWithLink('Ver comprobante en línea', margin, yPos + 10, { url: movement.comprobante_url });
            }
        } else {
            // Si no se pudo cargar, mostrar link
            yPos += 5;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...primaryColor);
            doc.textWithLink('Ver comprobante en línea', margin, yPos, { url: movement.comprobante_url });
        }
    }

    // ============================================
    // FOOTER
    // ============================================
    const footerY = pageHeight - 15;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('Documento generado automáticamente por DaviPlata', pageWidth / 2, footerY, { align: 'center' });
    doc.text(formatDatePDF(new Date(), { hour: '2-digit', minute: '2-digit' }), pageWidth / 2, footerY + 4, { align: 'center' });

    // ============================================
    // GUARDAR
    // ============================================
    // Generar nombre de archivo basado en el motivo
    let motivoClean = (movement.motivo || 'Movimiento')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-zA-Z0-9\s]/g, '') // Solo letras, números y espacios
        .replace(/\s+/g, '_') // Espacios a guiones bajos
        .substring(0, 30)
        .trim();

    if (!motivoClean) motivoClean = 'Comprobante';

    const fechaStr = formatDateShort(movement.fecha).replace(/\//g, '-');
    const filename = `${motivoClean}_${fechaStr}.pdf`;
    savePDFWithName(doc, filename);
    showToast('Comprobante descargado', 'success');
}
