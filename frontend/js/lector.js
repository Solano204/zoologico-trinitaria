const API_BASE = 'https://zoologico-trinitaria-production.up.railway.app';
const PANEL_LOGIN_URL = 'https://zoologico-trinitaria-production.up.railway.app/panel-login';

let html5QrCode = null;
let camaraActiva = false;
let procesandoEscaneo = false;
let reservaPendientePago = null;

// ============================================
// 🚪 Logout — always goes to Railway
// ============================================
function cerrarSesion() {
    window.location.href = 'https://zoologico-trinitaria-production.up.railway.app/panel-logout';
}

// ============================================
// 🔐 Auth helpers
// ============================================
function mostrarUsuarioLector(username) {
    const box = document.getElementById('lectorUsername');
    if (box) {
        box.textContent = username || 'Usuario desconocido';
    }
}

async function verificarSesionPanel() {
    try {
        const res = await fetch(`${API_BASE}/api/panel-me`, {
            credentials: 'include'
        });

        if (!res.ok) {
            window.location.href = `${PANEL_LOGIN_URL}?next=${encodeURIComponent(window.location.href)}`;
            return false;
        }

        const data = await res.json();

        if (!data.success) {
            window.location.href = `${PANEL_LOGIN_URL}?next=${encodeURIComponent(window.location.href)}`;
            return false;
        }

        // FIX: was calling mostrarUsuarioPanel (undefined), now calls the correct function
        mostrarUsuarioLector(data.user?.username || 'admin');
        return true;
    } catch (error) {
        window.location.href = `${PANEL_LOGIN_URL}?next=${encodeURIComponent(window.location.href)}`;
        return false;
    }
}

// ============================================
// 🧰 Helpers
// ============================================
function money(valor) {
    return '$' + Number(valor || 0).toFixed(2) + ' MXN';
}

function fechaHoraActual() {
    return new Date().toLocaleString('es-MX');
}

function limpiarCodigo(codigo) {
    let limpio = String(codigo || '')
        .normalize('NFKC')
        .toUpperCase()
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[''‚‛´`'"]/g, '-')
        .replace(/[‐-‒–—−]/g, '-')
        .replace(/\s+/g, '')
        .replace(/[^A-Z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    const mFolio = limpio.match(/^ZB-?(\d{8})-?([A-Z0-9]{6})$/);
    if (mFolio) {
        limpio = `ZB-${mFolio[1]}-${mFolio[2]}`;
    }

    return limpio;
}

function getDispositivo() {
    const valor = document.getElementById('nombreDispositivo').value.trim();
    const final = valor || 'Lector NETUM / Cámara QR';
    document.getElementById('nombreEquipoTexto').textContent = final;
    return final;
}

function getTaquilleroId() {
    const valor = document.getElementById('taquilleroId').value.trim();
    return valor ? Number(valor) : null;
}

function setResultado(texto, tipo = '') {
    const resultadoDiv = document.getElementById('resultado');
    resultadoDiv.className = 'resultado';
    if (tipo) resultadoDiv.classList.add(tipo);
    resultadoDiv.innerHTML = texto;
}

function limpiarPantalla() {
    setResultado('Esperando código QR...');
    document.getElementById('info-boleto').style.display = 'none';
    document.getElementById('codigoManual').value = '';
    document.getElementById('sincronizacion').textContent = '---';
    ocultarAccionesPago();
    document.getElementById('codigoManual').focus();
}

function renderDetalles(detalles) {
    const lista = document.getElementById('listaDetalles');
    if (!Array.isArray(detalles) || !detalles.length) {
        lista.innerHTML = '<li>Sin detalles disponibles</li>';
        return;
    }
    lista.innerHTML = detalles.map(item => `<li>${item.nombre} x${item.cantidad} — ${money(item.subtotal)}</li>`).join('');
}

function mostrarInfo(data, aceptado) {
    const datos = data?.datos || {};
    const detalles = datos?.detalles || [];

    document.getElementById('folio').textContent = datos.folio || 'N/A';
    document.getElementById('nombreCliente').textContent = datos.nombre_cliente || 'N/A';
    document.getElementById('email').textContent = datos.email || 'N/A';
    document.getElementById('telefono').textContent = datos.telefono || 'N/A';
    document.getElementById('fechaVisita').textContent = datos.fecha_visita || 'N/A';
    document.getElementById('metodoPago').textContent = datos.metodo_pago || 'N/A';
    document.getElementById('cantidadPersonas').textContent = datos.cantidad_personas ?? 'N/A';
    document.getElementById('total').textContent = datos.total ? money(datos.total) : 'N/A';
    document.getElementById('fechaAcceso').textContent = fechaHoraActual();
    document.getElementById('estadoAcceso').textContent = aceptado ? 'ACCESO PERMITIDO' : 'ACCESO DENEGADO';

    renderDetalles(detalles);
    document.getElementById('info-boleto').style.display = 'block';
}

// ============================================
// 💵 Acciones de pago
// ============================================
function mostrarAccionesPago(datos) {
    reservaPendientePago = datos || null;
    const box = document.getElementById('accionesPago');
    const texto = document.getElementById('accionesPagoTexto');

    if (!reservaPendientePago || !reservaPendientePago.folio) {
        box.style.display = 'none';
        return;
    }

    texto.innerHTML = `
        <strong>Folio:</strong> ${reservaPendientePago.folio}<br>
        <strong>Cliente:</strong> ${reservaPendientePago.nombre_cliente || 'N/A'}<br>
        <strong>Total a cobrar:</strong> ${money(reservaPendientePago.total)}<br>
        <strong>Personas:</strong> ${reservaPendientePago.cantidad_personas || 0}
    `;
    box.style.display = 'block';
}

function ocultarAccionesPago() {
    reservaPendientePago = null;
    document.getElementById('accionesPago').style.display = 'none';
}

async function confirmarPagoDesdeLector() {
    if (!reservaPendientePago || !reservaPendientePago.folio) {
        setResultado('❌ No hay reservación pendiente para confirmar.', 'rechazado');
        return;
    }

    const folio = reservaPendientePago.folio;
    const confirmado = confirm(`¿Confirmar pago de ${money(reservaPendientePago.total)} para el folio ${folio}?`);
    if (!confirmado) return;

    try {
        setResultado('⏳ Confirmando pago...', 'cargando');

        // FIX: added credentials: 'include'
        const res = await fetch(`${API_BASE}/api/ventas/${encodeURIComponent(folio)}/confirmar-pago`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                metodo_pago: 'efectivo',
                referencia_pago: 'Pago confirmado desde lector QR'
            })
        });

        if (res.status === 401) {
            window.location.href = `${PANEL_LOGIN_URL}?next=${encodeURIComponent(window.location.href)}`;
            return;
        }

        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo confirmar el pago');

        ocultarAccionesPago();
        setResultado('✅ Pago confirmado. Validando acceso...', 'cargando');
        await procesarQR(folio);

    } catch (error) {
        setResultado('❌ ' + error.message, 'rechazado');
    }
}

function cancelarPagoDesdeLector() {
    ocultarAccionesPago();
    setResultado('⚠️ Pago no confirmado. Puedes volver a escanear el QR cuando el cliente pague.', 'rechazado');
    document.getElementById('codigoManual').value = '';
    document.getElementById('codigoManual').focus();
}

// ============================================
// 📷 Cámara
// ============================================
async function iniciarCamara() {
    try {
        if (camaraActiva) {
            setResultado('📷 La cámara ya está activa.');
            return;
        }
        html5QrCode = new Html5Qrcode('reader');
        await html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
                if (procesandoEscaneo) return;
                procesandoEscaneo = true;
                try {
                    await detenerCamara();
                    await procesarQR(decodedText);
                } finally {
                    procesandoEscaneo = false;
                }
            },
            () => {}
        );
        camaraActiva = true;
        setResultado('📷 Cámara activa. Coloca el QR frente a la cámara.');
    } catch (error) {
        console.error('Error al iniciar cámara:', error);
        setResultado('❌ No se pudo iniciar la cámara.', 'rechazado');
    }
}

async function detenerCamara() {
    try {
        if (html5QrCode && camaraActiva) {
            await html5QrCode.stop();
            await html5QrCode.clear();
        }
    } catch (error) {
        console.log('Aviso al detener cámara:', error.message);
    } finally {
        camaraActiva = false;
        html5QrCode = null;
    }
}

// ============================================
// 🔍 Procesar QR
// ============================================
async function procesarQR(codigo) {
    const codigoLimpio = limpiarCodigo(codigo);
    document.getElementById('debugCodigo').textContent =
        'Código leído: ' + codigoLimpio + ' | Original: ' + String(codigo);

    console.log('Código original:', codigo);
    console.log('Código limpio:', codigoLimpio);

    if (!codigoLimpio) {
        setResultado('❌ Código vacío o inválido.', 'rechazado');
        return;
    }

    try {
        setResultado('⏳ Validando acceso...', 'cargando');

        // FIX: added credentials: 'include'
        const response = await fetch(`${API_BASE}/api/validar-qr`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                codigo_qr: codigoLimpio,
                taquillero_id: getTaquilleroId(),
                dispositivo: getDispositivo(),
                observaciones: 'Validación desde lector.html'
            })
        });

        if (response.status === 401) {
            window.location.href = `${PANEL_LOGIN_URL}?next=${encodeURIComponent(window.location.href)}`;
            return;
        }

        const data = await response.json();
        console.log('Respuesta del servidor:', data);

        if (data.valido) {
            ocultarAccionesPago();
            setResultado('✅ ¡ACCESO PERMITIDO!<br>Bienvenido al Zoológico', 'aceptado');
            mostrarInfo(data, true);
        } else {
            setResultado(`${data.mensaje || '❌ ACCESO DENEGADO'}`, 'rechazado');
            if (data.datos) {
                mostrarInfo(data, false);
                const mensaje = String(data.mensaje || '').toLowerCase();
                if (mensaje.includes('pago no confirmado')) {
                    mostrarAccionesPago(data.datos);
                } else {
                    ocultarAccionesPago();
                }
            } else {
                ocultarAccionesPago();
                document.getElementById('info-boleto').style.display = 'none';
            }
        }

        document.getElementById('sincronizacion').textContent = fechaHoraActual();
        document.getElementById('codigoManual').value = '';
        document.getElementById('codigoManual').focus();

    } catch (error) {
        console.error('Error al validar QR:', error);
        setResultado('❌ ERROR DE CONEXIÓN CON EL SERVIDOR', 'rechazado');
        document.getElementById('sincronizacion').textContent = 'Error';
        document.getElementById('info-boleto').style.display = 'none';
    }
}

function procesarManual() {
    const codigo = document.getElementById('codigoManual').value;
    if (!codigo.trim()) {
        setResultado('❌ Ingresa o escanea un código.', 'rechazado');
        return;
    }
    procesarQR(codigo);
}

async function verificarServidor() {
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        const data = await response.json();
        if (response.ok && data.ok) {
            document.getElementById('estadoServidor').textContent = 'Online ✅';
            document.getElementById('estadoServidor').style.color = '#28a745';
        } else {
            document.getElementById('estadoServidor').textContent = 'Offline ❌';
            document.getElementById('estadoServidor').style.color = '#dc3545';
        }
    } catch {
        document.getElementById('estadoServidor').textContent = 'Offline ❌';
        document.getElementById('estadoServidor').style.color = '#dc3545';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
document.getElementById('codigoManual').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        procesarManual();
    }
});

document.getElementById('nombreDispositivo').addEventListener('input', function() {
    getDispositivo();
});

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    const ok = await verificarSesionPanel();
    if (!ok) return;

    getDispositivo();
    verificarServidor();
    setInterval(verificarServidor, 10000);
    document.getElementById('codigoManual').focus();
});