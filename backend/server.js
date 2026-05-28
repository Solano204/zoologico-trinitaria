// ============================================
// 🔧 FORZAR IPv4
// ============================================
const VERCEL_BASE = 'https://zoologico-trinitaria-o7psz689z-solano204s-projects.vercel.app';

require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// ============================================
// 📦 IMPORTACIONES
// ============================================
const express = require('express');
const mysql = require('mysql2/promise');
const QRCode = require('qrcode');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;

function cleanEnv(name) {
  return String(process.env[name] || '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}
const DB_CONFIG = {
  host: cleanEnv('DB_HOST'),
  user: cleanEnv('DB_USER'),
  password: cleanEnv('DB_PASSWORD'),
  database: cleanEnv('DB_NAME'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
};


const PANEL_USER = cleanEnv('PANEL_USER') || 'admin';
const PANEL_PASS = cleanEnv('PANEL_PASS') || 'Sabinal2026*';
const PANEL_SESSION_HOURS = Number(cleanEnv('PANEL_SESSION_HOURS') || 12);
const panelSessions = new Map();
// ============================================
// ⚙️ CONFIG GENERAL
// ============================================
const FRONTEND_DIR = path.join(__dirname, ''); // ajusta si cambia tu estructura
const QR_DIR = path.join(__dirname, 'qrs');

if (!fs.existsSync(QR_DIR)) {
    fs.mkdirSync(QR_DIR, { recursive: true });
    console.log('📁 Carpeta de QRs creada');
}

app.use(cors({
    origin: [
        'https://zoologico-trinitaria-o7psz689z-solano204s-projects.vercel.app',
        'http://localhost:3000',
        'http://localhost:5500'
    ],
    credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

function aplicarNoCache(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
}

app.use((req, res, next) => {
    const rutasNoCache = [
        '/admin.html',
        '/lector.html',
        '/panel-login',
        '/panel-logout'
    ];

    if (rutasNoCache.includes(req.path)) {
        aplicarNoCache(res);
    }

    next();
});

app.use('/qrs', express.static(QR_DIR));

app.use((req, res, next) => {
    const protegidas = ['/admin.html', '/lector.html'];

    if (protegidas.includes(req.path)) {
        return requirePanelAuth(req, res, next);
    }

    next();
});

app.get('/admin.html', (req, res) => {
    res.redirect(`${VERCEL_BASE}/admin.html`);
});

app.get('/lector.html', (req, res) => {
    res.redirect(`${VERCEL_BASE}/lector.html`);
});

app.get('/index.html', (req, res) => {
    res.redirect(`${VERCEL_BASE}/index.html`);
});

app.get('/', (req, res) => {
    res.redirect(`${VERCEL_BASE}/`);
});

// ============================================
// 🗄️ CONEXIÓN A MySQL
// ============================================
//const pool = mysql.createPool({
//    host: process.env.DB_HOST || 'localhost',
//    user: process.env.DB_USER || 'root',
//    password: process.env.DB_PASSWORD || '123',
//    database: process.env.DB_NAME || 'zoologicosabinal',
 //   waitForConnections: true,
 //   connectionLimit: 10,
//    queueLimit: 0
//});



console.log('🧪 DB DEBUG:', {
  host: DB_CONFIG.host,
  user: DB_CONFIG.user,
  database: DB_CONFIG.database
});

const pool = mysql.createPool(DB_CONFIG);


// ============================================
// 📧 CONFIGURACIÓN DE CORREO
// ⚠️ CAMBIA ESTAS VARIABLES EN TU SISTEMA
// ============================================
const SMTP_HOST = cleanEnv('SMTP_HOST') || 'smtp.gmail.com';
const SMTP_PORT = Number(cleanEnv('SMTP_PORT') || 465);
const SMTP_USER = cleanEnv('SMTP_USER') || '';
const SMTP_PASS = cleanEnv('SMTP_PASS') || '';
const SMTP_FROM_NAME = cleanEnv('SMTP_FROM_NAME') || 'Zoológico El Sabinal';

const smtpHabilitado = Boolean(SMTP_USER && SMTP_PASS);
const EMAIL_PROVIDER = cleanEnv('EMAIL_PROVIDER') || 'smtp';
const RESEND_API_KEY = cleanEnv('RESEND_API_KEY') || '';
const RESEND_FROM = cleanEnv('RESEND_FROM') || 'Zoológico El Sabinal <onboarding@resend.dev>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

console.log('📧 EMAIL DEBUG:', {
    provider: EMAIL_PROVIDER,
    hasResendKey: Boolean(RESEND_API_KEY)
});

console.log('🧪 SMTP DEBUG:', {
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER,
    hasPass: Boolean(SMTP_PASS)
});
function revisarConfiguracionInicial() {
    const faltantes = [];

    if (!DB_CONFIG.host) faltantes.push('DB_HOST');
    if (!DB_CONFIG.user) faltantes.push('DB_USER');
    if (!DB_CONFIG.password) faltantes.push('DB_PASSWORD');
    if (!DB_CONFIG.database) faltantes.push('DB_NAME');

    if (!cleanEnv('PANEL_USER')) faltantes.push('PANEL_USER');
    if (!cleanEnv('PANEL_PASS')) faltantes.push('PANEL_PASS');

    if (faltantes.length) {
        console.log('⚠️ Variables faltantes o vacías:', faltantes.join(', '));
        console.log('⚠️ El servidor puede iniciar, pero algunas funciones pueden fallar.');
    } else {
        console.log('✅ Variables principales configuradas.');
    }

    if (EMAIL_PROVIDER === 'resend' && !RESEND_API_KEY) {
        console.log('⚠️ EMAIL_PROVIDER está en resend, pero falta RESEND_API_KEY.');
    }

    if (EMAIL_PROVIDER === 'resend' && RESEND_FROM.includes('onboarding@resend.dev')) {
        console.log('⚠️ Estás usando onboarding@resend.dev. Para producción conviene usar un correo con dominio verificado.');
    }
}

revisarConfiguracionInicial();
let transporter = null;

async function resolverIPv4(hostname) {
    return new Promise((resolve, reject) => {
        dns.lookup(hostname, { family: 4, all: false }, (error, address) => {
            if (error) return reject(error);
            resolve(address);
        });
    });
}

async function crearTransporterSMTP() {
    if (!smtpHabilitado) {
        console.log('⚠️ SMTP no configurado. Las ventas sí se registran, pero no se enviarán correos.');
        return null;
    }

    try {
        const smtpIPv4 = await resolverIPv4(SMTP_HOST);

        console.log('📧 SMTP IPv4 resuelto:', {
            host: SMTP_HOST,
            ipv4: smtpIPv4,
            port: SMTP_PORT,
            user: SMTP_USER,
            hasPass: Boolean(SMTP_PASS)
        });

        const nuevoTransporter = nodemailer.createTransport({
            host: smtpIPv4,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS
            },
            tls: {
                servername: SMTP_HOST,
                rejectUnauthorized: false
            },
            connectionTimeout: 60000,
            greetingTimeout: 60000,
            socketTimeout: 60000
        });

        await nuevoTransporter.verify();

        console.log('✅ Correo SMTP listo');
        return nuevoTransporter;
    } catch (error) {
        console.log('❌ Error de conexión SMTP:', error.message);
        return null;
    }
}

if (EMAIL_PROVIDER !== 'resend') {
    crearTransporterSMTP().then(t => {
        transporter = t;
    });
} else {
    console.log('📧 Usando Resend. SMTP Gmail desactivado.');
}

// ============================================
// 🧰 HELPERS
// ============================================
function obtenerIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

function generarFolio() {
    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const d = String(ahora.getDate()).padStart(2, '0');
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `ZB-${y}${m}${d}-${random}`;
}

function generarQrToken() {
    return `ZQ-${crypto.randomBytes(24).toString('hex')}`;
}
function normalizarCodigoQR(codigo) {
    let limpio = String(codigo || '')
        .normalize('NFKC')
        .toUpperCase()
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[‘’‚‛´`'"]/g, '-')
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

function fechaHoyISO() {
    const ahora = new Date();

    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(ahora);

    const y = partes.find(p => p.type === 'year').value;
    const m = partes.find(p => p.type === 'month').value;
    const d = partes.find(p => p.type === 'day').value;

    return `${y}-${m}-${d}`;
}
function fechaHoraZoo() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(new Date());

    const get = (tipo) => partes.find(p => p.type === tipo)?.value;

    return {
        fecha: `${get('year')}-${get('month')}-${get('day')}`,
        hora: Number(get('hour')),
        minuto: Number(get('minute'))
    };
}

function formatearFecha(fecha) {
    try {
        const f = String(fecha).slice(0, 10);
        const [y, m, d] = f.split('-');
        return `${d}/${m}/${y}`;
    } catch {
        return String(fecha);
    }
}

function limpiarTexto(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}
function esEmailValido(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function parseCookies(req) {
    const raw = req.headers.cookie || '';
    const cookies = {};

    raw.split(';').forEach(parte => {
        const [k, ...v] = parte.split('=');
        if (!k) return;
        cookies[k.trim()] = decodeURIComponent(v.join('=').trim() || '');
    });

    return cookies;
}

function crearPanelSession(username) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (PANEL_SESSION_HOURS * 60 * 60 * 1000);

    panelSessions.set(token, {
        username,
        expiresAt
    });

    return { token, expiresAt };
}

function obtenerPanelSession(req) {
    const cookies = parseCookies(req);
    const token = cookies.panel_session;

    if (!token) return null;

    const session = panelSessions.get(token);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
        panelSessions.delete(token);
        return null;
    }

    return {
        token,
        ...session
    };
}

function limpiarSesionesExpiradas() {
    const ahora = Date.now();
    for (const [token, session] of panelSessions.entries()) {
        if (ahora > session.expiresAt) {
            panelSessions.delete(token);
        }
    }
}

setInterval(limpiarSesionesExpiradas, 10 * 60 * 1000);

function requirePanelAuth(req, res, next) {
    const session = obtenerPanelSession(req);

    if (!session) {
        const aceptaHtml = (req.headers.accept || '').includes('text/html');

        if (aceptaHtml) {
            const nextUrl = encodeURIComponent(req.originalUrl || '/admin.html');
            return res.redirect(`/panel-login?next=${nextUrl}`);
        }

        return res.status(401).json({
            success: false,
            message: 'No autorizado. Inicia sesión en el panel.'
        });
    }

   req.panelUser = session;
aplicarNoCache(res);
next();
}

function extraerNombreCategoria(textoEntrada) {
    const texto = limpiarTexto(textoEntrada);

    if (texto.includes('adulto mayor')) return 'Adulto Mayor';
    if (texto.includes('infantil')) return 'Infantil';
    if (texto.includes('estudiante')) return 'Estudiante';
    if (texto.includes('nino') || texto.includes('niño')) return 'Niño';
    if (texto.includes('adulto')) return 'Adulto';

    return null;
}

function crearUrlQR(req, folio) {
    return `${req.protocol}://${req.get('host')}/qrs/${encodeURIComponent(folio)}.png`;
}

async function generarYGuardarQR(folio) {
    const qrPath = path.join(QR_DIR, `${folio}.png`);

    await QRCode.toFile(qrPath, folio, {
        width: 520,
        margin: 3,
        errorCorrectionLevel: 'H',
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    });

    return qrPath;
}
function construirHtmlCorreo(venta, detalles) {
    const subtotalSinDescuento = Number(venta.subtotal_sin_descuento ?? venta.total ?? 0);
    const descuentoTotal = Number(venta.descuento_total ?? 0);
    const totalFinal = Number(venta.total ?? 0);

    const detallesHTML = detalles.map(d => `
        <tr>
            <td style="padding:10px 12px;background:#202124;border-left:5px solid #bc6c25;border-radius:10px;color:#ffffff;">
                <strong style="color:#ffffff;">${escapeHtml(d.nombre)}</strong>
                <span style="color:#d8d8d8;"> x${Number(d.cantidad || 0)}</span>
                <br>
                <span style="color:#f9b81b;font-weight:700;">
                    $${Number(d.subtotal || 0).toFixed(2)} MXN
                </span>
            </td>
        </tr>
        <tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
    `).join('');

    const promoHTML = descuentoTotal > 0 ? `
        <tr>
            <td style="padding:12px 14px;background:#fff3cd;border-left:5px solid #bc6c25;border-radius:10px;color:#856404;">
                <strong>🎉 Promoción aplicada:</strong>
                ${escapeHtml(venta.promocion_aplicada?.nombre || '2x1 web')}
                <br>
                <span>Descuento: <strong>$${descuentoTotal.toFixed(2)} MXN</strong></span>
            </td>
        </tr>
        <tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
    ` : '';

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reservación - Zoológico El Sabinal</title>
</head>

<body style="margin:0;padding:0;background:#101820;font-family:Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#101820;margin:0;padding:0;width:100%;">
        <tr>
            <td align="center" style="padding:16px 10px;">

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#151515;border-radius:18px;overflow:hidden;border:1px solid #333333;">
                    
                    <tr>
                        <td align="center" style="background:#1b4332;padding:24px 18px;border-bottom:5px solid #f9b81b;">
                            <h1 style="margin:0;color:#ffffff;font-size:26px;line-height:1.2;">
                                🦁 Zoológico El Sabinal
                            </h1>
                            <p style="margin:8px 0 0;color:#d8f3dc;font-size:15px;">
                                La Trinitaria, Chiapas
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:22px 18px;">

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="background:#fefae0;border-left:7px solid #bc6c25;border-radius:14px;padding:16px;color:#283618;">
                                        <h2 style="margin:0 0 10px;font-size:22px;line-height:1.2;color:#283618;">
                                            ✅ Reservación registrada
                                        </h2>

                                        <p style="margin:7px 0;font-size:15px;">
                                            <strong>Folio:</strong>
                                            <span style="word-break:break-word;">${escapeHtml(venta.folio)}</span>
                                        </p>

                                        <p style="margin:7px 0;font-size:15px;">
                                            <strong>Fecha de visita:</strong> ${formatearFecha(venta.fecha_visita)}
                                        </p>

                                        <p style="margin:7px 0;font-size:15px;">
                                            <strong>Total de personas:</strong> ${Number(venta.cantidad_personas || 0)}
                                        </p>

                                        <p style="margin:7px 0;font-size:15px;">
                                            <strong>Estado del pago:</strong> Pendiente de pago en taquilla
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="background:#202124;border-radius:14px;padding:16px;color:#ffffff;">
                                        <h3 style="margin:0 0 12px;color:#f9b81b;font-size:20px;border-bottom:2px solid #bc6c25;padding-bottom:8px;">
                                            🎟️ Detalle de la reservación
                                        </h3>

                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                            ${detallesHTML}
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                ${promoHTML}

                                <tr>
                                    <td style="padding:14px;background:#f8f9fa;border-radius:12px;color:#283618;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td style="padding:6px 0;font-size:15px;">Subtotal:</td>
                                                <td align="right" style="padding:6px 0;font-size:15px;font-weight:700;">
                                                    $${subtotalSinDescuento.toFixed(2)} MXN
                                                </td>
                                            </tr>

                                            <tr>
                                                <td style="padding:6px 0;font-size:15px;">Descuento:</td>
                                                <td align="right" style="padding:6px 0;font-size:15px;font-weight:700;color:#b02a37;">
                                                    -$${descuentoTotal.toFixed(2)} MXN
                                                </td>
                                            </tr>

                                            <tr>
                                                <td style="padding:10px 0 0;font-size:18px;font-weight:800;border-top:2px solid #d4a373;">
                                                    Total a pagar:
                                                </td>
                                                <td align="right" style="padding:10px 0 0;font-size:20px;font-weight:900;color:#bc6c25;border-top:2px solid #d4a373;">
                                                    $${totalFinal.toFixed(2)} MXN
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="center" style="background:#111111;border:2px dashed #bc6c25;border-radius:16px;padding:18px;">
                                        <p style="margin:0 0 14px;color:#9dd9b5;font-size:18px;line-height:1.35;font-weight:800;">
                                            📱 Presenta este QR en taquilla para confirmar tu pago
                                        </p>

                                        <img
                                            src="cid:qr-unico"
                                            alt="QR de reservación"
                                            width="230"
                                            style="display:block;width:230px;max-width:82%;height:auto;margin:0 auto;background:#ffffff;border:8px solid #ffffff;border-radius:18px;box-shadow:0 5px 15px rgba(0,0,0,0.35);"
                                        >
                                    </td>
                                </tr>
                            </table>

                            <div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="background:#283618;color:#ffffff;padding:16px;border-radius:14px;">
                                        <h3 style="color:#f9b81b;margin:0 0 12px;font-size:19px;">
                                            📍 Información importante
                                        </h3>

                                        <p style="margin:8px 0;font-size:15px;line-height:1.4;">
                                            📌 <strong>Dirección:</strong> El Sabinal, La Trinitaria, Chiapas
                                        </p>

                                        <p style="margin:8px 0;font-size:15px;line-height:1.4;">
                                            🕐 <strong>Horario:</strong> Lunes a Domingo - 9:00 AM a 5:00 PM
                                        </p>

                                        <p style="margin:8px 0;font-size:15px;line-height:1.4;">
                                            📞 <strong>Informes:</strong> 963 331 5111
                                        </p>

                                        <p style="margin:8px 0;font-size:15px;line-height:1.4;">
                                            👶 <strong>Nota:</strong> Menores de 5 años entran gratis.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="background:#fff3cd;color:#856404;padding:14px;border-radius:12px;border-left:5px solid #856404;">
                                        <p style="margin:0;font-size:15px;line-height:1.45;">
                                            <strong>⚠️ Importante:</strong> este QR corresponde a una reservación. Deberás presentarlo en taquilla y realizar el pago para poder ingresar.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <p style="text-align:center;margin:22px 0 0;color:#cccccc;font-size:14px;line-height:1.4;">
                                🌿 Gracias por reservar tu visita al Zoológico El Sabinal
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="background:#1b4332;padding:13px;color:rgba(255,255,255,0.75);font-size:13px;">
                            Zoológico El Sabinal © 2026
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}
async function enviarCorreoQR({ email, venta, detalles, qrPath }) {
    if (EMAIL_PROVIDER === 'resend') {
        if (!resend) {
            return {
                enviado: false,
                motivo: 'Resend no configurado. Falta RESEND_API_KEY.'
            };
        }

        const qrBase64 = fs.readFileSync(qrPath).toString('base64');

        const { data, error } = await resend.emails.send({
            from: RESEND_FROM,
            to: [email],
            subject: `🎟️ Reservación registrada - ${venta.folio}`,
            html: construirHtmlCorreo(venta, detalles),
           attachments: [
    {
        filename: `${venta.folio}.png`,
        content: qrBase64,
        contentId: 'qr-unico'
    }
]
        });

        if (error) {
            throw new Error(error.message || JSON.stringify(error));
        }

        return {
            enviado: true,
            respuesta: data?.id || 'Correo enviado por Resend'
        };
    }

    if (!smtpHabilitado || !transporter) {
        return { enviado: false, motivo: 'SMTP no configurado' };
    }

    const info = await transporter.sendMail({
        from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
        to: email,
        subject: `🎟️ Reservación registrada - ${venta.folio}`,
        html: construirHtmlCorreo(venta, detalles),
        attachments: [
            {
                filename: `${venta.folio}.png`,
                path: qrPath,
                cid: 'qr-unico'
            }
        ]
    });

    return {
        enviado: true,
        respuesta: info.response
    };
}

async function obtenerCategoriasActivas(conn) {
    const [rows] = await conn.query(`
        SELECT id, clave, nombre, precio, requiere_credencial, activo
        FROM categorias
        WHERE activo = 1
        ORDER BY id
    `);
    return rows;
}

async function normalizarDetallesEntrada(conn, body) {
    const detallesEntrada = Array.isArray(body.detalles)
        ? body.detalles
        : Array.isArray(body.boletos)
            ? body.boletos
            : [];

    if (!detallesEntrada.length) {
        throw new Error('No se recibieron categorías para la venta');
    }

    const categorias = await obtenerCategoriasActivas(conn);
    const porId = new Map(categorias.map(c => [Number(c.id), c]));
    const porNombre = new Map(categorias.map(c => [limpiarTexto(c.nombre), c]));

    const detallesNormalizados = [];

    for (const item of detallesEntrada) {
        const cantidad = Number(item.cantidad || 0);

        if (!Number.isFinite(cantidad) || cantidad <= 0) {
            continue;
        }

        let categoria = null;

        if (item.categoria_id) {
            categoria = porId.get(Number(item.categoria_id)) || null;
        } else {
            const nombreDetectado = extraerNombreCategoria(
                item.categoria ||
                item.nombre_categoria ||
                item.nombre ||
                ''
            );

            if (nombreDetectado) {
                categoria = porNombre.get(limpiarTexto(nombreDetectado)) || null;
            }
        }

        if (!categoria) {
            throw new Error(`No se pudo resolver la categoría para: ${JSON.stringify(item)}`);
        }

        const precioUnitario = Number(categoria.precio);
        const subtotal = Number((precioUnitario * cantidad).toFixed(2));

        detallesNormalizados.push({
            categoria_id: Number(categoria.id),
            nombre: categoria.nombre,
            cantidad,
            precio_unitario: precioUnitario,
            subtotal
        });
    }

    if (!detallesNormalizados.length) {
        throw new Error('Todos los renglones de la venta quedaron en cantidad 0');
    }

    // Unificar por categoría por si vienen repetidas
    const agrupados = new Map();

    for (const d of detallesNormalizados) {
        if (!agrupados.has(d.categoria_id)) {
            agrupados.set(d.categoria_id, { ...d });
        } else {
            const actual = agrupados.get(d.categoria_id);
            actual.cantidad += d.cantidad;
            actual.subtotal = Number((actual.cantidad * actual.precio_unitario).toFixed(2));
        }
    }

    return Array.from(agrupados.values());
}
function obtenerDiaSemanaMySQL(fechaISO) {
    const fecha = new Date(`${String(fechaISO).slice(0, 10)}T12:00:00`);
    return fecha.getDay() + 1; // JS: 0 domingo, MySQL: 1 domingo
}

async function obtenerPromocionWebActiva(conn, fechaVisita, detalles) {
    const diaSemana = obtenerDiaSemanaMySQL(fechaVisita);
    const categoriaIds = detalles.map(d => Number(d.categoria_id));

    const [rows] = await conn.query(`
        SELECT 
            p.*,
            c.nombre AS categoria_nombre
        FROM promociones p
        LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE p.activo = 1
          AND p.tipo = '2x1'
          AND p.canal IN ('web', 'ambos')
          AND p.fecha_inicio <= ?
          AND p.fecha_fin >= ?
          AND (p.dia_semana IS NULL OR p.dia_semana = ?)
        ORDER BY p.fecha_creacion DESC
        LIMIT 10
    `, [fechaVisita, fechaVisita, diaSemana]);

    for (const promo of rows) {
        if (!promo.categoria_id) return promo;

        if (categoriaIds.includes(Number(promo.categoria_id))) {
            return promo;
        }
    }

    return null;
}

function aplicarPromocion2x1(detalles, promocion) {
    if (!promocion || promocion.tipo !== '2x1') {
        return {
            detalles,
            descuento_total: 0,
            promocion_aplicada: null
        };
    }

    let descuentoTotal = 0;

    const detallesConPromo = detalles.map(d => {
        const aplicaCategoria = !promocion.categoria_id || Number(promocion.categoria_id) === Number(d.categoria_id);

        if (!aplicaCategoria) {
            return {
                ...d,
                descuento: 0
            };
        }

        const cantidadGratis = Math.floor(Number(d.cantidad || 0) / 2);
        const descuento = Number((cantidadGratis * Number(d.precio_unitario || 0)).toFixed(2));

        descuentoTotal += descuento;

        return {
            ...d,
            descuento,
            subtotal: Number((Number(d.subtotal || 0) - descuento).toFixed(2))
        };
    });

    return {
        detalles: detallesConPromo,
        descuento_total: Number(descuentoTotal.toFixed(2)),
        promocion_aplicada: descuentoTotal > 0 ? promocion : null
    };
}

async function obtenerVentaCompletaPorFiltro(filtro, valor) {
    const conn = await pool.getConnection();

    try {
        let where = '';
        if (filtro === 'folio') where = 'v.folio = ?';
        else if (filtro === 'qr_token') where = 'v.qr_token = ?';
        else if (filtro === 'id') where = 'v.id = ?';
        else throw new Error('Filtro no válido');

        const [ventas] = await conn.query(`
            SELECT 
                v.*,
                u.nombre AS usuario_nombre,
                u.apellidos AS usuario_apellidos,
                t.nombre AS taquillero_nombre,
                t.apellidos AS taquillero_apellidos
            FROM ventas v
            LEFT JOIN usuarios u ON v.usuario_id = u.id
            LEFT JOIN usuarios t ON v.taquillero_id = t.id
            WHERE ${where}
            LIMIT 1
        `, [valor]);

        if (!ventas.length) return null;

        const venta = ventas[0];

        const [detalles] = await conn.query(`
            SELECT 
                dv.id,
                dv.categoria_id,
                c.nombre,
                c.clave,
                dv.cantidad,
                dv.precio_unitario,
                dv.subtotal
            FROM detalle_venta dv
            INNER JOIN categorias c ON c.id = dv.categoria_id
            WHERE dv.venta_id = ?
            ORDER BY c.id
        `, [venta.id]);

        const [accesos] = await conn.query(`
            SELECT 
                a.*,
                u.nombre AS taquillero_nombre,
                u.apellidos AS taquillero_apellidos
            FROM accesos a
            LEFT JOIN usuarios u ON a.taquillero_id = u.id
            WHERE a.venta_id = ?
            ORDER BY a.fecha_acceso DESC
        `, [venta.id]);

        return { venta, detalles, accesos };
    } finally {
        conn.release();
    }
}

async function registrarAcceso({
    conn,
    ventaId,
    taquilleroId = null,
    dispositivo = 'Lector QR',
    resultado,
    ip,
    motivoRechazo = null,
    observaciones = null
}) {
    await conn.query(`
        INSERT INTO accesos
        (
            venta_id,
            taquillero_id,
            dispositivo,
            fecha_acceso,
            resultado,
            ip_dispositivo,
            motivo_rechazo,
            observaciones
        )
        VALUES (?, ?, ?, NOW(), ?, ?, ?, ?)
    `, [
        ventaId,
        taquilleroId,
        dispositivo,
        resultado,
        ip,
        motivoRechazo,
        observaciones
    ]);
}

// ============================================
// 🔐 LOGIN DEL PANEL PERSONALIZADO
// ============================================
function escapeHtml(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizarNextUrl(valor) {
    const nextUrl = String(valor || '/admin.html');

    if (!nextUrl.startsWith('/') || nextUrl.startsWith('//')) {
        return '/admin.html';
    }

    return nextUrl;
}

app.get('/panel-login', (req, res) => {
    aplicarNoCache(res);

    const nextUrl = sanitizarNextUrl(req.query.next || `${VERCEL_BASE}/admin.html`);
    const hayError = Boolean(req.query.error);
    const logout = Boolean(req.query.logout);

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Zoológico La Trinitaria Chiapas - Login</title>
            <style>
                * {
                    box-sizing: border-box;
                    font-family: "Segoe UI", Arial, sans-serif;
                }

                body {
                    margin: 0;
                    min-height: 100vh;
                    display: grid;
                    place-items: center;
                    padding: 20px;
                    background:
                        linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.65)),
                        url('/img/max.jpg') center center / cover no-repeat fixed;
                    color: white;
                    overflow: hidden;
                }

                .login-card {
                    width: 100%;
                    max-width: 370px;
                    min-height: 470px;
                    background: rgba(28, 18, 12, 0.58);
                    border: 1px solid rgba(255,255,255,.22);
                    border-radius: 16px;
                    padding: 28px;
                    box-shadow: 0 24px 55px rgba(0,0,0,.45);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                }

                .logo-wrap {
                    text-align: center;
                    margin-bottom: 16px;
                }

                .logo-wrap img {
                    width: 72px;
                    height: 72px;
                    object-fit: contain;
                    border-radius: 10px;
                    background: rgba(255,255,255,.9);
                    padding: 5px;
                    box-shadow: 0 8px 18px rgba(0,0,0,.35);
                }

                h1 {
                    margin: 8px 0 22px;
                    text-align: center;
                    color: #ffc247;
                    font-size: 1.45rem;
                    line-height: 1.18;
                    text-shadow: 0 3px 10px rgba(0,0,0,.45);
                }

                label {
                    display: block;
                    margin: 12px 0 7px;
                    font-weight: 800;
                    color: #ffffff;
                    font-size: .95rem;
                }

                input {
                    width: 100%;
                    padding: 12px 14px;
                    border-radius: 9px;
                    border: 1px solid rgba(255,255,255,.35);
                    background: rgba(255,255,255,.12);
                    color: white;
                    font-size: .96rem;
                    outline: none;
                    transition: .22s ease;
                }

                input::placeholder {
                    color: rgba(255,255,255,.65);
                }

                input:focus {
                    background: rgba(255,255,255,.18);
                    border-color: #ffc247;
                    box-shadow: 0 0 0 4px rgba(255,194,71,.16);
                }

                .password-wrap {
                    position: relative;
                }

                .password-wrap input {
                    padding-right: 48px;
                }

                .toggle-pass {
                    position: absolute;
                    right: 9px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 33px;
                    height: 28px;
                    border: none;
                    border-radius: 7px;
                    cursor: pointer;
                    background: rgba(255,255,255,.85);
                    color: #111;
                    font-weight: 900;
                }

                .btn-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 10px;
                    margin-top: 20px;
                }

                .btn {
                    border: none;
                    border-radius: 9px;
                    padding: 12px 8px;
                    color: white;
                    font-weight: 900;
                    cursor: pointer;
                    transition: .22s ease;
                    box-shadow: 0 8px 16px rgba(0,0,0,.28);
                }

                .btn:hover {
                    transform: translateY(-2px);
                }

                .btn-login {
                    background: linear-gradient(145deg, #f7931e, #d46b00);
                }

                .btn-clear {
                    background: linear-gradient(145deg, #7f9dad, #54717f);
                }

                .btn-exit {
                    background: linear-gradient(145deg, #d84a3a, #a92920);
                }

                .message-zone {
                    min-height: 58px;
                    margin-top: 14px;
                }

                .login-message {
                    padding: 13px 14px;
                    border-radius: 10px;
                    font-weight: 800;
                    text-align: center;
                    animation: aparecer .25s ease;
                }

                .login-message.error {
                    background: rgba(120, 20, 20, .62);
                    border-left: 4px solid #ff5b5b;
                    color: #ffecec;
                }

                .login-message.ok {
                    background: rgba(20, 100, 55, .62);
                    border-left: 4px solid #42d97d;
                    color: #eafff0;
                }

                .login-message.hide {
                    opacity: 0;
                    transform: translateY(-6px);
                    transition: .35s ease;
                }

                @keyframes aparecer {
                    from {
                        opacity: 0;
                        transform: translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @media (max-width: 480px) {
                    body {
                        padding: 14px;
                    }

                    .login-card {
                        max-width: 100%;
                        padding: 24px 20px;
                    }

                    .btn-row {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        </head>
        <body>
            <form class="login-card" method="POST" action="/panel-login" id="loginForm" autocomplete="off">
                <div class="logo-wrap">
                    <img src="/img/logo2.png" alt="Logo Zoológico El Sabinal">
                </div>

                <h1>Zoológico La Trinitaria<br>Chiapas</h1>

                <input type="hidden" name="next" value="${escapeHtml(nextUrl)}">

                <label for="username">Username:</label>
                <input
                    type="text"
                    id="username"
                    name="username"
                    placeholder="Ingresa tu usuario"
                    autocomplete="off"
                    required
                >

                <label for="passwordInput">Password:</label>
                <div class="password-wrap">
                    <input
                        type="password"
                        id="passwordInput"
                        name="password"
                        placeholder="Ingresa tu contraseña"
                        autocomplete="new-password"
                        required
                    >
                    <button type="button" class="toggle-pass" id="togglePass">👁️</button>
                </div>

                <div class="btn-row">
                    <button type="submit" class="btn btn-login">Aceptar</button>
                    <button type="button" class="btn btn-clear" id="btnCancelar">Cancelar</button>
                    <button type="button" class="btn btn-exit" id="btnSalir">Salir</button>
                </div>

                <div class="message-zone" id="messageZone">
                    ${hayError ? `<div class="login-message error" id="loginMessage">Username o Password incorrecta</div>` : ''}
                    ${logout ? `<div class="login-message ok" id="loginMessage">Sesión cerrada correctamente</div>` : ''}
                </div>
            </form>

            <script>
                const form = document.getElementById('loginForm');
                const username = document.getElementById('username');
                const passwordInput = document.getElementById('passwordInput');
                const togglePass = document.getElementById('togglePass');
                const btnCancelar = document.getElementById('btnCancelar');
                const btnSalir = document.getElementById('btnSalir');
                const loginMessage = document.getElementById('loginMessage');

                if (togglePass && passwordInput) {
                    togglePass.addEventListener('click', () => {
                        const visible = passwordInput.type === 'text';
                        passwordInput.type = visible ? 'password' : 'text';
                        togglePass.textContent = visible ? '👁️' : '🙈';
                    });
                }

                if (btnCancelar) {
                    btnCancelar.addEventListener('click', () => {
                        username.value = '';
                        passwordInput.value = '';
                        username.focus();

                        if (loginMessage) {
                            loginMessage.classList.add('hide');
                            setTimeout(() => loginMessage.remove(), 350);
                        }
                    });
                }

                if (btnSalir) {
                    btnSalir.addEventListener('click', () => {
                        window.location.href = '/';
                    });
                }

                if (loginMessage) {
                    username.value = '';
                    passwordInput.value = '';

                    setTimeout(() => {
                        loginMessage.classList.add('hide');
                    }, 3000);

                    setTimeout(() => {
                        if (loginMessage && loginMessage.parentNode) {
                            loginMessage.remove();
                        }

                        username.value = '';
                        passwordInput.value = '';
                        username.focus();

                        const limpio = '/panel-login?next=' + encodeURIComponent(${JSON.stringify(nextUrl)});
                        window.history.replaceState({}, document.title, limpio);
                    }, 3400);
                }

                window.addEventListener('pageshow', function (event) {
                    if (event.persisted) {
                        window.location.reload();
                    }
                });
            <\/script>
        </body>
        </html>
    `);
});

app.post('/panel-login', (req, res) => {
    aplicarNoCache(res);

    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const nextUrl = sanitizarNextUrl(req.body.next || '/admin.html');

    if (username !== PANEL_USER || password !== PANEL_PASS) {
        return res.redirect(`/panel-login?error=1&next=${encodeURIComponent(nextUrl)}`);
    }

    const session = crearPanelSession(username);
    const cookieSecure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  res.setHeader(
  'Set-Cookie',
  `panel_session=${session.token}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=${PANEL_SESSION_HOURS * 60 * 60}`
);
    return res.redirect(nextUrl);
});

app.post('/panel-login', (req, res) => {
    aplicarNoCache(res);

    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const nextUrl = sanitizarNextUrl(req.body.next || '/admin.html');

    if (username !== PANEL_USER || password !== PANEL_PASS) {
        return res.redirect(`/panel-login?error=1&next=${encodeURIComponent(nextUrl)}`);
    }

    const session = crearPanelSession(username);

    res.setHeader(
        'Set-Cookie',
        `panel_session=${session.token}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=${PANEL_SESSION_HOURS * 60 * 60}`
    );

    // Si nextUrl es una URL completa (http/https), redirige directo
    // Si es una ruta relativa como /admin.html, la prepende con Vercel
    const redirectTo = nextUrl.startsWith('http')
        ? nextUrl
        : `${VERCEL_BASE}${nextUrl}`;

    return res.redirect(redirectTo);
});

app.get('/panel-logout', (req, res) => {
    aplicarNoCache(res);

    const cookies = parseCookies(req);
    const token = cookies.panel_session;

    if (token) {
        panelSessions.delete(token);
    }

    res.setHeader(
        'Set-Cookie',
        `panel_session=; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=0`
    );

    res.setHeader('Clear-Site-Data', '"cache"');

    return res.redirect('/panel-login?logout=1');
});

app.get('/api/panel-me', requirePanelAuth, (req, res) => {
    aplicarNoCache(res);

    res.json({
        success: true,
        user: {
            username: req.panelUser.username
        }
    });
});

// ============================================
// 🛡️ RUTAS PRIVADAS DEL PANEL
// ============================================
app.use('/api/validar-qr', requirePanelAuth);
app.use('/api/historial-ventas', requirePanelAuth);
app.use('/api/historial-accesos', requirePanelAuth);
app.use('/api/corte-basico', requirePanelAuth);
app.use('/api/estadisticas', requirePanelAuth);
app.use('/api/bi-dashboard', requirePanelAuth);
app.use('/api/test-email', requirePanelAuth);
app.use('/api/promociones', requirePanelAuth);
app.use('/api/animales-admin', requirePanelAuth);

app.use(/^\/api\/ventas\/[^/]+\/cancelar$/, requirePanelAuth);
app.use(/^\/api\/ventas\/[^/]+\/confirmar-pago$/, requirePanelAuth);
app.use(/^\/api\/ventas\/[^/]+\/registrar-entrada$/, requirePanelAuth);

// ============================================
// 🖼️ QR DINÁMICO POR FOLIO
// Si el PNG no existe, se vuelve a generar
// ============================================
app.get('/qrs/:archivo', async (req, res) => {
    try {
        const archivo = String(req.params.archivo || '');

        if (!archivo.toLowerCase().endsWith('.png')) {
            return res.status(400).send('Archivo no válido');
        }

        const folioRaw = archivo.replace(/\.png$/i, '');
        const folio = normalizarCodigoQR(folioRaw);

        if (!folio || !folio.startsWith('ZB-')) {
            return res.status(400).send('Folio no válido');
        }

        const [rows] = await pool.query(`
            SELECT id, folio
            FROM ventas
            WHERE folio = ?
            LIMIT 1
        `, [folio]);

        if (!rows.length) {
            return res.status(404).send('QR no encontrado');
        }

        const qrPath = path.join(QR_DIR, `${folio}.png`);

        if (!fs.existsSync(qrPath)) {
            await generarYGuardarQR(folio);
        }

        return res.sendFile(qrPath);
    } catch (error) {
        console.log('❌ Error generando/mostrando QR:', error.message);
        return res.status(500).send('Error generando QR');
    }
});
// ============================================
// 🚑 HEALTHCHECK
// ============================================
app.get('/api/health', async (req, res) => {
    try {
        const conn = await pool.getConnection();
        const [rows] = await conn.query('SELECT NOW() AS servidor');
        conn.release();

        res.json({
            ok: true,
            mensaje: 'Servidor y base de datos funcionando',
            fecha_servidor: rows[0].servidor
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: 'Error de conexión',
            error: error.message
        });
    }
});

// ============================================
// 📂 LISTAR CATEGORÍAS
// ============================================
app.get('/api/categorias', async (req, res) => {
    try {
        const conn = await pool.getConnection();
        const categorias = await obtenerCategoriasActivas(conn);
        conn.release();

        res.json({
            success: true,
            categorias
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo categorías',
            error: error.message
        });
    }
});
// ============================================
// 🐯 ANIMALES PÚBLICOS
// ============================================
app.get('/api/animales-publicos', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                id,
                nombre,
                especie,
                descripcion,
                imagen_url,
                habitat,
                alimentacion
            FROM animales
            WHERE activo = 1
            ORDER BY orden ASC, nombre ASC
        `);

        res.json({
            success: true,
            animales: rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo animales públicos',
            error: error.message
        });
    }
});

// ============================================
// 🐾 ANIMALES ADMIN
// ============================================
app.get('/api/animales-admin', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                id,
                nombre,
                especie,
                descripcion,
                imagen_url,
                habitat,
                alimentacion,
                activo,
                orden,
                fecha_creacion,
                fecha_actualizacion
            FROM animales
            ORDER BY orden ASC, nombre ASC
        `);

        res.json({
            success: true,
            animales: rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo animales',
            error: error.message
        });
    }
});

app.post('/api/animales-admin', async (req, res) => {
    try {
        const {
            nombre,
            especie = '',
            descripcion,
            imagen_url,
            habitat = '',
            alimentacion = '',
            orden = 0,
            activo = 1
        } = req.body || {};

        if (!nombre || !descripcion || !imagen_url) {
            return res.status(400).json({
                success: false,
                message: 'Nombre, descripción e imagen son obligatorios'
            });
        }

        const [result] = await pool.query(`
            INSERT INTO animales
            (
                nombre,
                especie,
                descripcion,
                imagen_url,
                habitat,
                alimentacion,
                orden,
                activo
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            String(nombre).trim(),
            String(especie || '').trim() || null,
            String(descripcion).trim(),
            String(imagen_url).trim(),
            String(habitat || '').trim() || null,
            String(alimentacion || '').trim() || null,
            Number(orden || 0),
            Number(activo) ? 1 : 0
        ]);

        res.json({
            success: true,
            message: '✅ Animal agregado correctamente',
            id: result.insertId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error guardando animal',
            error: error.message
        });
    }
});

app.put('/api/animales-admin/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: 'ID de animal no válido'
            });
        }

        const {
            nombre,
            especie = '',
            descripcion,
            imagen_url,
            habitat = '',
            alimentacion = '',
            orden = 0,
            activo = 1
        } = req.body || {};

        if (!nombre || !descripcion || !imagen_url) {
            return res.status(400).json({
                success: false,
                message: 'Nombre, descripción e imagen son obligatorios'
            });
        }

        const [existe] = await pool.query(`
            SELECT id
            FROM animales
            WHERE id = ?
            LIMIT 1
        `, [id]);

        if (!existe.length) {
            return res.status(404).json({
                success: false,
                message: 'Animal no encontrado'
            });
        }

        await pool.query(`
            UPDATE animales
            SET
                nombre = ?,
                especie = ?,
                descripcion = ?,
                imagen_url = ?,
                habitat = ?,
                alimentacion = ?,
                orden = ?,
                activo = ?
            WHERE id = ?
        `, [
            String(nombre).trim(),
            String(especie || '').trim() || null,
            String(descripcion).trim(),
            String(imagen_url).trim(),
            String(habitat || '').trim() || null,
            String(alimentacion || '').trim() || null,
            Number(orden || 0),
            Number(activo) ? 1 : 0,
            id
        ]);

        res.json({
            success: true,
            message: '✅ Animal actualizado correctamente'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error actualizando animal',
            error: error.message
        });
    }
});

app.post('/api/animales-admin/:id/toggle', async (req, res) => {
    try {
        const id = Number(req.params.id);

        const [rows] = await pool.query(`
            SELECT activo
            FROM animales
            WHERE id = ?
            LIMIT 1
        `, [id]);

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: 'Animal no encontrado'
            });
        }

        const nuevoEstado = Number(rows[0].activo) === 1 ? 0 : 1;

        await pool.query(`
            UPDATE animales
            SET activo = ?
            WHERE id = ?
        `, [nuevoEstado, id]);

        res.json({
            success: true,
            message: nuevoEstado ? '✅ Animal activado' : '✅ Animal desactivado',
            activo: nuevoEstado
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error cambiando estado del animal',
            error: error.message
        });
    }
});

app.delete('/api/animales-admin/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: 'ID de animal no válido'
            });
        }

        const [existe] = await pool.query(`
            SELECT id
            FROM animales
            WHERE id = ?
            LIMIT 1
        `, [id]);

        if (!existe.length) {
            return res.status(404).json({
                success: false,
                message: 'Animal no encontrado'
            });
        }

        await pool.query(`
            DELETE FROM animales
            WHERE id = ?
        `, [id]);

        res.json({
            success: true,
            message: '✅ Animal eliminado correctamente'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error eliminando animal',
            error: error.message
        });
    }
});
// ============================================
// 🎯 PROMOCIONES ADMIN
// ============================================
app.get('/api/promociones', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                p.*,
                c.nombre AS categoria_nombre
            FROM promociones p
            LEFT JOIN categorias c ON c.id = p.categoria_id
            ORDER BY p.fecha_creacion DESC
        `);

        res.json({
            success: true,
            promociones: rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo promociones',
            error: error.message
        });
    }
});

app.post('/api/promociones', async (req, res) => {
    try {
        const {
            nombre,
            descripcion = '',
            tipo = '2x1',
            canal = 'web',
            categoria_id = null,
            dia_semana = null,
            fecha_inicio,
            fecha_fin,
            activo = 1
        } = req.body || {};

        if (!nombre || !fecha_inicio || !fecha_fin) {
            return res.status(400).json({
                success: false,
                message: 'Nombre, fecha inicial y fecha final son obligatorios'
            });
        }

        if (fecha_inicio > fecha_fin) {
            return res.status(400).json({
                success: false,
                message: 'La fecha inicial no puede ser mayor que la fecha final'
            });
        }

        const [result] = await pool.query(`
            INSERT INTO promociones
            (
                nombre,
                descripcion,
                tipo,
                canal,
                categoria_id,
                dia_semana,
                fecha_inicio,
                fecha_fin,
                activo
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            nombre,
            descripcion || null,
            tipo,
            canal,
            categoria_id ? Number(categoria_id) : null,
            dia_semana ? Number(dia_semana) : null,
            fecha_inicio,
            fecha_fin,
            Number(activo) ? 1 : 0
        ]);

        res.json({
            success: true,
            message: '✅ Promoción guardada correctamente',
            id: result.insertId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error guardando promoción',
            error: error.message
        });
    }
});

app.post('/api/promociones/:id/toggle', async (req, res) => {
    try {
        const id = Number(req.params.id);

        const [rows] = await pool.query(`
            SELECT activo
            FROM promociones
            WHERE id = ?
            LIMIT 1
        `, [id]);

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: 'Promoción no encontrada'
            });
        }

        const nuevoEstado = Number(rows[0].activo) === 1 ? 0 : 1;

        await pool.query(`
            UPDATE promociones
            SET activo = ?
            WHERE id = ?
        `, [nuevoEstado, id]);

        res.json({
            success: true,
            message: nuevoEstado ? '✅ Promoción activada' : '✅ Promoción desactivada',
            activo: nuevoEstado
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error cambiando estado de promoción',
            error: error.message
        });
    }
});
// ============================================
// ✏️ EDITAR PROMOCIÓN
// ============================================
app.put('/api/promociones/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: 'ID de promoción no válido'
            });
        }

        const {
            nombre,
            descripcion = '',
            categoria_id = null,
            dia_semana = null,
            fecha_inicio,
            fecha_fin
        } = req.body || {};

        if (!nombre || !fecha_inicio || !fecha_fin) {
            return res.status(400).json({
                success: false,
                message: 'Nombre, fecha inicial y fecha final son obligatorios'
            });
        }

        if (fecha_inicio > fecha_fin) {
            return res.status(400).json({
                success: false,
                message: 'La fecha inicial no puede ser mayor que la fecha final'
            });
        }

        const [existe] = await pool.query(`
            SELECT id
            FROM promociones
            WHERE id = ?
            LIMIT 1
        `, [id]);

        if (!existe.length) {
            return res.status(404).json({
                success: false,
                message: 'Promoción no encontrada'
            });
        }

        await pool.query(`
            UPDATE promociones
            SET
                nombre = ?,
                descripcion = ?,
                tipo = '2x1',
                canal = 'web',
                categoria_id = ?,
                dia_semana = ?,
                fecha_inicio = ?,
                fecha_fin = ?
            WHERE id = ?
        `, [
            nombre,
            descripcion || null,
            categoria_id ? Number(categoria_id) : null,
            dia_semana ? Number(dia_semana) : null,
            fecha_inicio,
            fecha_fin,
            id
        ]);

        res.json({
            success: true,
            message: '✅ Promoción actualizada correctamente'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error actualizando promoción',
            error: error.message
        });
    }
});

// ============================================
// 🗑️ ELIMINAR PROMOCIÓN SEGURA
// Si ya fue usada en ventas, solo se desactiva.
// Si no fue usada, sí se elimina.
// ============================================
app.delete('/api/promociones/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: 'ID de promoción no válido'
            });
        }

        const [promoRows] = await pool.query(`
            SELECT id, nombre
            FROM promociones
            WHERE id = ?
            LIMIT 1
        `, [id]);

        if (!promoRows.length) {
            return res.status(404).json({
                success: false,
                message: 'Promoción no encontrada'
            });
        }

        const [usoRows] = await pool.query(`
            SELECT COUNT(*) AS total_usos
            FROM ventas
            WHERE promocion_id = ?
        `, [id]);

        const totalUsos = Number(usoRows[0]?.total_usos || 0);

        if (totalUsos > 0) {
            await pool.query(`
                UPDATE promociones
                SET activo = 0
                WHERE id = ?
            `, [id]);

            return res.json({
                success: true,
                message: '✅ La promoción ya fue usada en ventas, por seguridad solo se desactivó.',
                modo: 'desactivada',
                total_usos: totalUsos
            });
        }

        await pool.query(`
            DELETE FROM promociones
            WHERE id = ?
        `, [id]);

        res.json({
            success: true,
            message: '✅ Promoción eliminada correctamente',
            modo: 'eliminada'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error eliminando promoción',
            error: error.message
        });
    }
});

// ============================================
// 🎯 PROMOCIONES PÚBLICAS WEB
// ============================================
app.get('/api/promociones-publicas', async (req, res) => {
    try {
        const fecha = String(req.query.fecha || fechaHoyISO()).slice(0, 10);
        const diaSemana = obtenerDiaSemanaMySQL(fecha);

        const [rows] = await pool.query(`
            SELECT 
                p.id,
                p.nombre,
                p.descripcion,
                p.tipo,
                p.canal,
                p.categoria_id,
                p.dia_semana,
                p.fecha_inicio,
                p.fecha_fin,
                c.nombre AS categoria_nombre
            FROM promociones p
            LEFT JOIN categorias c ON c.id = p.categoria_id
            WHERE p.activo = 1
              AND p.canal IN ('web', 'ambos')
              AND p.fecha_inicio <= ?
              AND p.fecha_fin >= ?
              AND (p.dia_semana IS NULL OR p.dia_semana = ?)
            ORDER BY p.fecha_creacion DESC
        `, [fecha, fecha, diaSemana]);

        res.json({
            success: true,
            fecha,
            promociones: rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo promociones públicas',
            error: error.message
        });
    }
});

// ============================================
// 🎟️ CREAR VENTA
// Acepta:
// 1) detalles: [{ categoria_id, cantidad }]
// 2) boletos: [{ categoria: "Adulto", cantidad: 2 }]
// ============================================
app.post('/api/venta', async (req, res) => {
    const conn = await pool.getConnection();

    try {
        const {
            usuario_id = null,
            taquillero_id = null,
            corte_id = null,
            nombre_cliente = null,
            email = '',
            telefono = null,
            fecha_visita,
            metodo_pago,
            referencia_pago = null,
            canal_venta = 'web',
            observaciones = null
        } = req.body;

        const canalVentaFinal = String(canal_venta || 'web').toLowerCase() === 'taquilla'
            ? 'taquilla'
            : 'web';

        const emailLimpio = String(email || '').trim();
        const emailFinal = emailLimpio || null;

        if (!fecha_visita) {
            return res.status(400).json({
                success: false,
                message: 'fecha_visita es obligatoria'
            });
        }

        // En venta web sí pedimos correo, en taquilla es opcional
        if (canalVentaFinal === 'web' && !emailFinal) {
            return res.status(400).json({
                success: false,
                message: 'Email es obligatorio para ventas web'
            });
        }

        if (emailFinal && !esEmailValido(emailFinal)) {
            return res.status(400).json({
                success: false,
                message: 'El correo no tiene un formato válido'
            });
        }

       let detalles = await normalizarDetallesEntrada(conn, req.body);

const cantidadPersonas = detalles.reduce((acc, d) => acc + Number(d.cantidad), 0);
const subtotalSinDescuento = Number(detalles.reduce((acc, d) => acc + Number(d.subtotal), 0).toFixed(2));

let descuentoTotal = 0;
let promocionAplicada = null;

if (canalVentaFinal === 'web') {
    const promoActiva = await obtenerPromocionWebActiva(conn, fecha_visita, detalles);

    if (promoActiva) {
        const resultadoPromo = aplicarPromocion2x1(detalles, promoActiva);
        detalles = resultadoPromo.detalles;
        descuentoTotal = resultadoPromo.descuento_total;
        promocionAplicada = resultadoPromo.promocion_aplicada;
    }
}

const total = Number(detalles.reduce((acc, d) => acc + Number(d.subtotal), 0).toFixed(2));

const folio = generarFolio();
const qrToken = generarQrToken();

const metodoPagoFinal = 'efectivo';

const estadoPagoFinal = canalVentaFinal === 'web'
    ? 'pendiente'
    : 'pagado';
        const ipCompra = obtenerIP(req);

        await conn.beginTransaction();

        const [ventaResult] = await conn.query(`
            INSERT INTO ventas
            (
                folio,
                qr_token,
                usuario_id,
                taquillero_id,
               corte_id,
               promocion_id,
               nombre_cliente,
                email,
                telefono,
                fecha_visita,
                cantidad_personas,
subtotal_sin_descuento,
descuento_total,
total,
                metodo_pago,
                referencia_pago,
                estado_pago,
                estado_acceso,
                qr_usado,
                canal_venta,
                ip_compra,
                observaciones,
                fecha_venta
            )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', 0, ?, ?, ?, NOW())
        `, [
            folio,
            qrToken,
            usuario_id,
            taquillero_id,
            corte_id,
promocionAplicada ? promocionAplicada.id : null,
nombre_cliente,
emailFinal,
            telefono,
            fecha_visita,
           cantidadPersonas,
subtotalSinDescuento,
descuentoTotal,
total,
metodoPagoFinal,
            referencia_pago,
            estadoPagoFinal,
            canalVentaFinal,
            ipCompra,
            observaciones
        ]);

        const ventaId = ventaResult.insertId;

        for (const d of detalles) {
    await conn.query(`
        INSERT INTO detalle_venta
        (
            venta_id,
            categoria_id,
            cantidad,
            precio_unitario,
            subtotal
        )
        VALUES (?, ?, ?, ?, ?)
    `, [
        ventaId,
        d.categoria_id,
        d.cantidad,
        d.precio_unitario,
        d.subtotal
    ]);
}

// Si la venta es en taquilla, el cliente ya pagó y ya puede entrar.
// Por eso registramos automáticamente el acceso como aceptado.
if (canalVentaFinal === 'taquilla') {
    await registrarAcceso({
        conn,
        ventaId,
        taquilleroId: taquillero_id,
        dispositivo: 'Venta en taquilla',
        resultado: 'aceptado',
        ip: ipCompra,
        observaciones: 'Acceso registrado automáticamente al cobrar en taquilla'
    });

    await conn.query(`
        UPDATE ventas
        SET qr_usado = 1,
            estado_acceso = 'usado',
            fecha_uso = NOW(),
            observaciones = CONCAT(
                IFNULL(observaciones, ''),
                CASE WHEN IFNULL(observaciones, '') = '' THEN '' ELSE ' | ' END,
                'Acceso otorgado automáticamente por venta en taquilla'
            )
        WHERE id = ?
    `, [ventaId]);
}

await conn.commit();

        const qrPath = await generarYGuardarQR(folio);
        const qrUrl = crearUrlQR(req, folio);

        let correoEnviado = false;
        let correoInfo = null;

        // Solo intentar correo si sí existe email
        if (emailFinal && canalVentaFinal === 'web') {
            try {
                const resultadoCorreo = await enviarCorreoQR({
                    email: emailFinal,
                   venta: {
    folio,
    fecha_visita,
    total,
    cantidad_personas: cantidadPersonas,
    subtotal_sin_descuento: subtotalSinDescuento,
    descuento_total: descuentoTotal,
    promocion_aplicada: promocionAplicada ? {
        id: promocionAplicada.id,
        nombre: promocionAplicada.nombre,
        descripcion: promocionAplicada.descripcion,
        tipo: promocionAplicada.tipo
    } : null
},
                    detalles,
                    qrPath
                });

                correoEnviado = Boolean(resultadoCorreo.enviado);
                correoInfo = resultadoCorreo;

                if (correoEnviado) {
                    await pool.query(`
                        UPDATE ventas
                        SET correo_enviado = 1,
                            fecha_envio_qr = NOW()
                        WHERE id = ?
                    `, [ventaId]);
                }
            } catch (correoError) {
                correoInfo = {
                    enviado: false,
                    motivo: correoError.message
                };
                console.log('⚠️ La venta se guardó, pero falló el correo:', correoError.message);
            }
     } else {
    correoInfo = {
        enviado: false,
        motivo: canalVentaFinal === 'taquilla'
            ? 'Venta de taquilla: ticket generado en el panel. Envío por correo pendiente de implementar.'
            : 'Venta sin correo; no se envió QR por email'
    };
}

   res.json({
    success: true,
    message: canalVentaFinal === 'taquilla'
        ? '✅ Venta de taquilla registrada correctamente'
        : '✅ Reservación registrada correctamente. Presenta tu QR y paga en taquilla.',
    venta: {
        id: ventaId,
        folio,
        qr_token: qrToken,
        qr_url: qrUrl,
        email: emailFinal,
        fecha_visita,
        cantidad_personas: cantidadPersonas,

        subtotal_sin_descuento: subtotalSinDescuento,
        descuento_total: descuentoTotal,
        total,

        promocion_aplicada: promocionAplicada ? {
            id: promocionAplicada.id,
            nombre: promocionAplicada.nombre,
            descripcion: promocionAplicada.descripcion,
            tipo: promocionAplicada.tipo
        } : null,

        estado_pago: estadoPagoFinal,
        estado_acceso: canalVentaFinal === 'taquilla' ? 'usado' : 'pendiente',
        canal_venta: canalVentaFinal,
        correo_enviado: correoEnviado
    },
    detalles,
    correo: correoInfo
});
    } catch (error) {
        try { await conn.rollback(); } catch {}
        res.status(500).json({
            success: false,
            message: 'Error procesando la venta',
            error: error.message
        });
    } finally {
        conn.release();
    }
});

// ============================================
// 🔍 VALIDAR QR
// Busca por qr_token o por folio
// ============================================
app.post('/api/validar-qr', async (req, res) => {
    const conn = await pool.getConnection();

    try {
        const {
    codigo_qr,
    taquillero_id = null,
    dispositivo = 'Lector QR',
    observaciones = null
} = req.body;

const codigoNormalizado = normalizarCodigoQR(codigo_qr);
if (!codigoNormalizado) {
            return res.status(400).json({
                valido: false,
                mensaje: 'Debes enviar el código_qr'
            });
        }

        const ip = obtenerIP(req);

        await conn.beginTransaction();

       const [ventas] = await conn.query(`
    SELECT *
    FROM ventas
    WHERE qr_token = ? OR folio = ?
    LIMIT 1
`, [codigoNormalizado, codigoNormalizado]);

        if (!ventas.length) {
            await conn.rollback();
            return res.json({
                valido: false,
                mensaje: '❌ QR no encontrado'
            });
        }

        const venta = ventas[0];

        const [detalles] = await conn.query(`
            SELECT 
                dv.categoria_id,
                c.nombre,
                dv.cantidad,
                dv.precio_unitario,
                dv.subtotal
            FROM detalle_venta dv
            INNER JOIN categorias c ON c.id = dv.categoria_id
            WHERE dv.venta_id = ?
            ORDER BY c.id
        `, [venta.id]);

   const ahoraZoo = fechaHoraZoo();
const hoy = ahoraZoo.fecha;
const horaActual = ahoraZoo.hora;
const minutoActual = ahoraZoo.minuto;
const fechaVenta = String(venta.fecha_visita).slice(0, 10);

console.log('🧪 QR DEBUG:', {
    codigo: codigoNormalizado,
    fechaVenta,
    hoy,
    horaActual,
    minutoActual,
    fechaRaw: venta.fecha_visita
});

if (venta.estado_pago !== 'pagado') {
    await registrarAcceso({
        conn,
        ventaId: venta.id,
        taquilleroId: taquillero_id,
        dispositivo,
        resultado: 'rechazado',
        ip,
        motivoRechazo: 'Pago no confirmado',
        observaciones
    });

    await conn.commit();

    return res.json({
        valido: false,
        mensaje: '❌ Pago no confirmado',
        datos: {
            folio: venta.folio,
            email: venta.email,
            telefono: venta.telefono,
            nombre_cliente: venta.nombre_cliente,
            total: venta.total,
            cantidad_personas: venta.cantidad_personas,
            fecha_visita: venta.fecha_visita,
            metodo_pago: venta.metodo_pago,
            detalles
        }
    });
}

if (venta.estado_acceso === 'usado' || Number(venta.qr_usado) === 1) {
    await registrarAcceso({
        conn,
        ventaId: venta.id,
        taquilleroId: taquillero_id,
        dispositivo,
        resultado: 'rechazado',
        ip,
        motivoRechazo: 'QR ya utilizado',
        observaciones
    });

    await conn.commit();

    return res.json({
        valido: false,
        mensaje: '❌ Este QR ya fue utilizado',
        datos: {
            folio: venta.folio,
            email: venta.email,
            telefono: venta.telefono,
            nombre_cliente: venta.nombre_cliente,
            total: venta.total,
            cantidad_personas: venta.cantidad_personas,
            fecha_visita: venta.fecha_visita,
            metodo_pago: venta.metodo_pago,
            detalles
        }
    });
}

if (fechaVenta !== hoy) {
    await registrarAcceso({
        conn,
        ventaId: venta.id,
        taquilleroId: taquillero_id,
        dispositivo,
        resultado: 'rechazado',
        ip,
        motivoRechazo: 'Fecha de visita no válida',
        observaciones
    });

    await conn.commit();

    return res.json({
        valido: false,
        mensaje: `❌ Este QR corresponde a la fecha ${fechaVenta}. Hoy en el zoológico es ${hoy}.`,
        datos: {
            folio: venta.folio,
            email: venta.email,
            telefono: venta.telefono,
            nombre_cliente: venta.nombre_cliente,
            total: venta.total,
            cantidad_personas: venta.cantidad_personas,
            fecha_visita: venta.fecha_visita,
            metodo_pago: venta.metodo_pago,
            detalles
        }
    });
}

if (horaActual < 9 || horaActual >= 17) {
    await registrarAcceso({
        conn,
        ventaId: venta.id,
        taquilleroId: taquillero_id,
        dispositivo,
        resultado: 'rechazado',
        ip,
        motivoRechazo: 'Fuera del horario del zoológico',
        observaciones
    });

    await conn.commit();

    return res.json({
        valido: false,
        mensaje: `❌ Hoy sí es ${hoy}, pero estás fuera del horario del zoológico (9:00 AM a 5:00 PM). Hora actual: ${String(horaActual).padStart(2, '0')}:${String(minutoActual).padStart(2, '0')}`,
        datos: {
            folio: venta.folio,
            email: venta.email,
            telefono: venta.telefono,
            nombre_cliente: venta.nombre_cliente,
            total: venta.total,
            cantidad_personas: venta.cantidad_personas,
            fecha_visita: venta.fecha_visita,
            metodo_pago: venta.metodo_pago,
            detalles
        }
    });
}
        await registrarAcceso({
            conn,
            ventaId: venta.id,
            taquilleroId: taquillero_id,
            dispositivo,
            resultado: 'aceptado',
            ip,
            observaciones
        });

        await conn.query(`
            UPDATE ventas
            SET qr_usado = 1,
                estado_acceso = 'usado',
                fecha_uso = NOW()
            WHERE id = ?
        `, [venta.id]);

        await conn.commit();

        res.json({
            valido: true,
            mensaje: '✅ ACCESO PERMITIDO',
            datos: {
                id: venta.id,
                folio: venta.folio,
                email: venta.email,
                telefono: venta.telefono,
                nombre_cliente: venta.nombre_cliente,
                total: Number(venta.total).toFixed(2),
                cantidad_personas: venta.cantidad_personas,
                fecha_visita: venta.fecha_visita,
                metodo_pago: venta.metodo_pago,
                detalles
            }
        });
    } catch (error) {
        try { await conn.rollback(); } catch {}
        res.status(500).json({
            valido: false,
            mensaje: 'Error al validar el QR',
            error: error.message
        });
    } finally {
        conn.release();
    }
});

// ============================================
// 📄 OBTENER DETALLE DE UNA VENTA POR FOLIO
// ============================================
app.get('/api/ventas/:folio', async (req, res) => {
    try {
        const data = await obtenerVentaCompletaPorFiltro('folio', req.params.folio);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Venta no encontrada'
            });
        }

        res.json({
            success: true,
            ...data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo la venta',
            error: error.message
        });
    }
});

// ============================================
// 📧 CONSULTAR VENTAS POR EMAIL
// ============================================
app.get('/api/ventas-por-email', async (req, res) => {
    try {
        const email = String(req.query.email || '').trim();

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Debes enviar el email'
            });
        }

        const [ventas] = await pool.query(`
            SELECT
                v.id,
                v.folio,
                v.nombre_cliente,
                v.email,
                v.telefono,
                v.fecha_visita,
                v.cantidad_personas,
                v.total,
                v.metodo_pago,
                v.estado_pago,
                v.estado_acceso,
                v.qr_usado,
                v.canal_venta,
                v.fecha_venta
            FROM ventas v
            WHERE v.email = ?
            ORDER BY v.fecha_venta DESC
        `, [email]);

        res.json({
            success: true,
            total: ventas.length,
            ventas
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error consultando ventas por email',
            error: error.message
        });
    }
});

// ============================================
// ❌ CANCELAR VENTA POR FOLIO
// ============================================
app.post('/api/ventas/:folio/cancelar', async (req, res) => {
    const conn = await pool.getConnection();

    try {
        const folio = req.params.folio;
        const motivo = (req.body?.motivo || 'Cancelación manual desde panel admin').trim();

        await conn.beginTransaction();

        const [rows] = await conn.query(`
            SELECT *
            FROM ventas
            WHERE folio = ?
            LIMIT 1
        `, [folio]);

        if (!rows.length) {
            await conn.rollback();
            return res.status(404).json({
                success: false,
                message: 'Venta no encontrada'
            });
        }

        const venta = rows[0];

        if (String(venta.estado_acceso).toLowerCase() === 'usado' || Number(venta.qr_usado) === 1) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: 'No se puede cancelar una venta ya utilizada'
            });
        }

        if (
            String(venta.estado_pago).toLowerCase() === 'cancelado' ||
            String(venta.estado_acceso).toLowerCase() === 'cancelado'
        ) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: 'La venta ya está cancelada'
            });
        }

        await conn.query(`
            UPDATE ventas
            SET
                estado_pago = 'cancelado',
                estado_acceso = 'cancelado',
                observaciones = CONCAT(
                    IFNULL(observaciones, ''),
                    CASE WHEN IFNULL(observaciones, '') = '' THEN '' ELSE ' | ' END,
                    ?
                )
            WHERE id = ?
        `, [`Cancelada: ${motivo}`, venta.id]);

        await conn.commit();

        res.json({
            success: true,
            message: 'Venta cancelada correctamente'
        });
    } catch (error) {
        try { await conn.rollback(); } catch {}
        res.status(500).json({
            success: false,
            message: 'Error cancelando la venta',
            error: error.message
        });
    } finally {
        conn.release();
    }
});

// ============================================
// 💵 CONFIRMAR PAGO DE RESERVACIÓN
// ============================================
app.post('/api/ventas/:folio/confirmar-pago', async (req, res) => {
    const conn = await pool.getConnection();

    try {
        const folio = req.params.folio;
        const metodo_pago = String(req.body?.metodo_pago || 'efectivo').trim();
        const referencia_pago = String(req.body?.referencia_pago || '').trim() || null;

        const metodosPermitidos = ['efectivo', 'tarjeta', 'transferencia', 'pago_en_linea', 'cortesia'];

        if (!metodosPermitidos.includes(metodo_pago)) {
            return res.status(400).json({
                success: false,
                message: 'Método de pago no válido'
            });
        }

        await conn.beginTransaction();

        const [rows] = await conn.query(`
            SELECT *
            FROM ventas
            WHERE folio = ?
            LIMIT 1
        `, [folio]);

        if (!rows.length) {
            await conn.rollback();
            return res.status(404).json({
                success: false,
                message: 'Reservación no encontrada'
            });
        }

        const venta = rows[0];

        if (venta.estado_pago === 'cancelado') {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: 'No se puede cobrar una reservación cancelada'
            });
        }

        if (venta.estado_acceso === 'usado' || Number(venta.qr_usado) === 1) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: 'Esta reservación ya fue utilizada'
            });
        }

        if (venta.estado_pago === 'pagado') {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: 'Esta reservación ya está pagada'
            });
        }

        await conn.query(`
            UPDATE ventas
            SET estado_pago = 'pagado',
                metodo_pago = ?,
                referencia_pago = ?,
                observaciones = CONCAT(
                    IFNULL(observaciones, ''),
                    CASE WHEN IFNULL(observaciones, '') = '' THEN '' ELSE ' | ' END,
                    'Pago confirmado en taquilla'
                )
            WHERE id = ?
        `, [metodo_pago, referencia_pago, venta.id]);

        await conn.commit();

        res.json({
            success: true,
            message: '✅ Pago confirmado correctamente'
        });
    } catch (error) {
        try { await conn.rollback(); } catch {}
        res.status(500).json({
            success: false,
            message: 'Error confirmando pago',
            error: error.message
        });
    } finally {
        conn.release();
    }
});

// ============================================
// 🚪 REGISTRAR ENTRADA MANUAL POR FOLIO
// Para tickets de taquilla o ventas ya pagadas
// ============================================
app.post('/api/ventas/:folio/registrar-entrada', async (req, res) => {
    const conn = await pool.getConnection();

    try {
        const folio = req.params.folio;
        const {
            taquillero_id = null,
            dispositivo = 'Registro manual desde panel',
            observaciones = 'Entrada registrada manualmente desde panel admin'
        } = req.body || {};

        await conn.beginTransaction();

        const [rows] = await conn.query(`
            SELECT *
            FROM ventas
            WHERE folio = ?
            LIMIT 1
        `, [folio]);

        if (!rows.length) {
            await conn.rollback();
            return res.status(404).json({
                success: false,
                message: 'Venta no encontrada'
            });
        }

        const venta = rows[0];

        if (venta.estado_pago !== 'pagado') {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: 'No se puede registrar entrada porque el pago no está confirmado'
            });
        }

        if (venta.estado_pago === 'cancelado' || venta.estado_acceso === 'cancelado') {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: 'No se puede registrar entrada de una venta cancelada'
            });
        }

        if (venta.estado_acceso === 'usado' || Number(venta.qr_usado) === 1) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: 'Esta entrada ya fue registrada anteriormente'
            });
        }

        const ahoraZoo = fechaHoraZoo();
        const hoy = ahoraZoo.fecha;
        const horaActual = ahoraZoo.hora;
        const minutoActual = ahoraZoo.minuto;
        const fechaVenta = String(venta.fecha_visita).slice(0, 10);

        if (fechaVenta !== hoy) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: `La entrada corresponde a la fecha ${fechaVenta}. Hoy en el zoológico es ${hoy}.`
            });
        }

        if (horaActual < 9 || horaActual >= 17) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: `No se puede registrar entrada fuera del horario del zoológico. Hora actual: ${String(horaActual).padStart(2, '0')}:${String(minutoActual).padStart(2, '0')}`
            });
        }

        await registrarAcceso({
            conn,
            ventaId: venta.id,
            taquilleroId: taquillero_id,
            dispositivo,
            resultado: 'aceptado',
            ip: obtenerIP(req),
            observaciones
        });

        await conn.query(`
            UPDATE ventas
            SET qr_usado = 1,
                estado_acceso = 'usado',
                fecha_uso = NOW(),
                observaciones = CONCAT(
                    IFNULL(observaciones, ''),
                    CASE WHEN IFNULL(observaciones, '') = '' THEN '' ELSE ' | ' END,
                    'Entrada registrada manualmente'
                )
            WHERE id = ?
        `, [venta.id]);

        await conn.commit();

        res.json({
            success: true,
            message: '✅ Entrada registrada correctamente'
        });
    } catch (error) {
        try { await conn.rollback(); } catch {}

        res.status(500).json({
            success: false,
            message: 'Error registrando la entrada',
            error: error.message
        });
    } finally {
        conn.release();
    }
});

// ============================================
// 📚 HISTORIAL DE VENTAS
// Filtros opcionales:
// ?fecha=2026-03-31
// ?email=correo@dominio.com
// ?folio=ZB-...
// ?canal_venta=web
// ?estado_pago=pagado
// ?estado_acceso=pendiente
// ?limit=50
// ============================================
app.get('/api/historial-ventas', async (req, res) => {
    try {
        const {
            fecha,
            email,
            folio,
            canal_venta,
            estado_pago,
            estado_acceso,
            usuario_id,
            taquillero_id,
            limit = 100
        } = req.query;

        const condiciones = [];
        const valores = [];

        if (fecha) {
            condiciones.push('DATE(v.fecha_venta) = ?');
            valores.push(fecha);
        }

        if (email) {
            condiciones.push('v.email LIKE ?');
            valores.push(`%${email}%`);
        }

        if (folio) {
            condiciones.push('v.folio LIKE ?');
            valores.push(`%${folio}%`);
        }

        if (canal_venta) {
            condiciones.push('v.canal_venta = ?');
            valores.push(canal_venta);
        }

        if (estado_pago) {
            condiciones.push('v.estado_pago = ?');
            valores.push(estado_pago);
        }

        if (estado_acceso) {
            condiciones.push('v.estado_acceso = ?');
            valores.push(estado_acceso);
        }

        if (usuario_id) {
            condiciones.push('v.usuario_id = ?');
            valores.push(Number(usuario_id));
        }

        if (taquillero_id) {
            condiciones.push('v.taquillero_id = ?');
            valores.push(Number(taquillero_id));
        }

        const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

        const [rows] = await pool.query(`
            SELECT 
                v.id,
                v.folio,
                v.email,
                v.telefono,
                v.nombre_cliente,
                v.fecha_visita,
                v.cantidad_personas,
                v.total,
                v.metodo_pago,
                v.estado_pago,
                v.estado_acceso,
                v.qr_usado,
                v.canal_venta,
                v.fecha_venta,
                u.nombre AS usuario_nombre,
                u.apellidos AS usuario_apellidos,
                t.nombre AS taquillero_nombre,
                t.apellidos AS taquillero_apellidos,
                (
                    SELECT COUNT(*) 
                    FROM accesos a
                    WHERE a.venta_id = v.id
                ) AS total_escaneos
            FROM ventas v
            LEFT JOIN usuarios u ON v.usuario_id = u.id
            LEFT JOIN usuarios t ON v.taquillero_id = t.id
            ${where}
            ORDER BY v.fecha_venta DESC
            LIMIT ?
        `, [...valores, Number(limit)]);

        res.json({
            success: true,
            total: rows.length,
            ventas: rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo historial',
            error: error.message
        });
    }
});



// ============================================
// 💰 CORTE BÁSICO MEJORADO
// ============================================
app.get('/api/corte-basico', async (req, res) => {
    try {
        const fecha = req.query.fecha || fechaHoyISO();

        const [resumenRows] = await pool.query(`
            SELECT
                COUNT(*) AS total_operaciones,
                COALESCE(SUM(total), 0) AS monto_total,
                COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN total ELSE 0 END), 0) AS total_efectivo,
                COALESCE(SUM(cantidad_personas), 0) AS total_personas,
                COALESCE(SUM(CASE WHEN canal_venta = 'web' THEN 1 ELSE 0 END), 0) AS ventas_web,
                COALESCE(SUM(CASE WHEN canal_venta = 'taquilla' THEN 1 ELSE 0 END), 0) AS ventas_taquilla
            FROM ventas
            WHERE DATE(fecha_venta) = ?
              AND estado_pago = 'pagado'
        `, [fecha]);

        const [accesosRows] = await pool.query(`
            SELECT
                COALESCE(SUM(CASE WHEN resultado = 'aceptado' THEN 1 ELSE 0 END), 0) AS accesos_aceptados,
                COALESCE(SUM(CASE WHEN resultado = 'rechazado' THEN 1 ELSE 0 END), 0) AS accesos_rechazados
            FROM accesos
            WHERE DATE(fecha_acceso) = ?
        `, [fecha]);

        const [detalleRows] = await pool.query(`
            SELECT
                v.id,
                v.folio,
                DATE_FORMAT(v.fecha_venta, '%H:%i') AS hora,
                v.nombre_cliente,
                v.email,
                v.telefono,
                v.canal_venta,
                v.cantidad_personas,
                v.total,
                v.metodo_pago,
                v.estado_pago,
                v.estado_acceso,
                COALESCE(
                    GROUP_CONCAT(
                        CONCAT(c.nombre, ' x', dv.cantidad, ' = $', FORMAT(dv.subtotal, 2))
                        ORDER BY c.id
                        SEPARATOR ' | '
                    ),
                    'Sin detalle'
                ) AS detalle_boletos
            FROM ventas v
            LEFT JOIN detalle_venta dv ON dv.venta_id = v.id
            LEFT JOIN categorias c ON c.id = dv.categoria_id
            WHERE DATE(v.fecha_venta) = ?
              AND v.estado_pago = 'pagado'
            GROUP BY
                v.id,
                v.folio,
                v.fecha_venta,
                v.nombre_cliente,
                v.email,
                v.telefono,
                v.canal_venta,
                v.cantidad_personas,
                v.total,
                v.metodo_pago,
                v.estado_pago,
                v.estado_acceso
            ORDER BY v.fecha_venta DESC
        `, [fecha]);

        const resumen = resumenRows[0] || {};
        const accesos = accesosRows[0] || {};

        res.json({
            success: true,
            fecha,
            total_operaciones: Number(resumen.total_operaciones || 0),
            monto_total: Number(resumen.monto_total || 0),
            total_efectivo: Number(resumen.total_efectivo || 0),
            total_personas: Number(resumen.total_personas || 0),
            ventas_web: Number(resumen.ventas_web || 0),
            ventas_taquilla: Number(resumen.ventas_taquilla || 0),
            accesos_aceptados: Number(accesos.accesos_aceptados || 0),
            accesos_rechazados: Number(accesos.accesos_rechazados || 0),
            detalle: detalleRows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo corte básico',
            error: error.message
        });
    }
});

// ============================================
// 📈 BI Y GRAFICACIÓN DEL PANEL ADMIN
// ============================================
app.get('/api/bi-dashboard', async (req, res) => {
    try {
        const fechaFin = String(req.query.fecha_fin || req.query.fecha || fechaHoyISO()).slice(0, 10);
        const dias = Number(req.query.dias || 30);

        let fechaInicio = String(req.query.fecha_inicio || '').slice(0, 10);

        if (!fechaInicio) {
            const [rangoRows] = await pool.query(`
                SELECT DATE_SUB(?, INTERVAL ? DAY) AS fecha_inicio
            `, [fechaFin, dias]);

            fechaInicio = String(rangoRows[0].fecha_inicio).slice(0, 10);
        }

        if (fechaInicio > fechaFin) {
            return res.status(400).json({
                success: false,
                message: 'La fecha inicial no puede ser mayor que la fecha final'
            });
        }

        const diasSemana = {
            1: 'Domingo',
            2: 'Lunes',
            3: 'Martes',
            4: 'Miércoles',
            5: 'Jueves',
            6: 'Viernes',
            7: 'Sábado'
        };

        const nombresMes = {
            1: 'Enero',
            2: 'Febrero',
            3: 'Marzo',
            4: 'Abril',
            5: 'Mayo',
            6: 'Junio',
            7: 'Julio',
            8: 'Agosto',
            9: 'Septiembre',
            10: 'Octubre',
            11: 'Noviembre',
            12: 'Diciembre'
        };

        function factorTemporada(mes) {
            const factores = {
                1: 1.15,
                2: 0.85,
                3: 1.00,
                4: 1.25,
                5: 0.95,
                6: 1.05,
                7: 1.45,
                8: 1.30,
                9: 0.80,
                10: 0.95,
                11: 1.10,
                12: 1.35
            };

            return factores[mes] || 1;
        }

        function motivoTemporada(mes) {
            const motivos = {
                1: 'Vacaciones de invierno y visitas familiares',
                2: 'Mes regular, menor movimiento escolar',
                3: 'Mes regular con posible incremento por primavera',
                4: 'Semana Santa y periodo vacacional',
                5: 'Mes regular después de vacaciones',
                6: 'Inicio de temporada de verano',
                7: 'Vacaciones de verano, alta afluencia familiar',
                8: 'Vacaciones y cierre de verano',
                9: 'Regreso a clases, menor demanda',
                10: 'Mes regular previo a puentes fuertes',
                11: 'Puentes y fines de semana largos',
                12: 'Vacaciones decembrinas'
            };

            return motivos[mes] || 'Comportamiento regular';
        }

        function sumarMes(fechaBase, offset) {
            const fecha = new Date(`${fechaBase}T00:00:00`);
            fecha.setMonth(fecha.getMonth() + offset);
            return {
                year: fecha.getFullYear(),
                month: fecha.getMonth() + 1
            };
        }

        function diasDelMes(year, month) {
            return new Date(year, month, 0).getDate();
        }

        // Resumen del periodo
        const [resumenRows] = await pool.query(`
            SELECT
                COUNT(*) AS total_operaciones,
                COALESCE(SUM(CASE WHEN canal_venta = 'web' THEN 1 ELSE 0 END), 0) AS reservaciones_web,
                COALESCE(SUM(CASE WHEN canal_venta = 'taquilla' THEN 1 ELSE 0 END), 0) AS ventas_taquilla,
                COALESCE(SUM(CASE WHEN estado_pago = 'pendiente' THEN 1 ELSE 0 END), 0) AS pendientes_pago,
                COALESCE(SUM(CASE WHEN estado_pago = 'pagado' THEN 1 ELSE 0 END), 0) AS pagadas,
                COALESCE(SUM(cantidad_personas), 0) AS personas_periodo,
                COALESCE(SUM(total), 0) AS ingresos_estimados,
                COALESCE(SUM(CASE WHEN estado_pago = 'pagado' THEN total ELSE 0 END), 0) AS ingresos_cobrados
            FROM ventas
            WHERE fecha_visita BETWEEN ? AND ?
              AND estado_pago <> 'cancelado'
        `, [fechaInicio, fechaFin]);

        // Categorías más vendidas/reservadas
        const [categoriasRows] = await pool.query(`
            SELECT 
                c.nombre,
                COALESCE(SUM(dv.cantidad), 0) AS cantidad,
                COALESCE(SUM(dv.subtotal), 0) AS total
            FROM detalle_venta dv
            INNER JOIN ventas v ON v.id = dv.venta_id
            INNER JOIN categorias c ON c.id = dv.categoria_id
            WHERE v.fecha_visita BETWEEN ? AND ?
              AND v.estado_pago <> 'cancelado'
            GROUP BY c.id, c.nombre
            ORDER BY cantidad DESC
        `, [fechaInicio, fechaFin]);

        // Estados de pago
        const [estadosRows] = await pool.query(`
            SELECT
                estado_pago,
                COUNT(*) AS total
            FROM ventas
            WHERE fecha_visita BETWEEN ? AND ?
              AND estado_pago <> 'cancelado'
            GROUP BY estado_pago
        `, [fechaInicio, fechaFin]);

        // Web vs taquilla
        const [canalesRows] = await pool.query(`
            SELECT
                canal_venta,
                COUNT(*) AS total,
                COALESCE(SUM(cantidad_personas), 0) AS personas,
                COALESCE(SUM(CASE WHEN estado_pago = 'pagado' THEN total ELSE 0 END), 0) AS ingresos_cobrados
            FROM ventas
            WHERE fecha_visita BETWEEN ? AND ?
              AND estado_pago <> 'cancelado'
            GROUP BY canal_venta
        `, [fechaInicio, fechaFin]);

        // Tendencia por fecha
        const [tendenciaRows] = await pool.query(`
            SELECT
                fecha_visita,
                COUNT(*) AS operaciones,
                COALESCE(SUM(cantidad_personas), 0) AS personas,
                COALESCE(SUM(total), 0) AS ingresos_estimados,
                COALESCE(SUM(CASE WHEN estado_pago = 'pagado' THEN total ELSE 0 END), 0) AS ingresos_cobrados
            FROM ventas
            WHERE fecha_visita BETWEEN ? AND ?
              AND estado_pago <> 'cancelado'
            GROUP BY fecha_visita
            ORDER BY fecha_visita ASC
        `, [fechaInicio, fechaFin]);

        // Días de la semana con mayor demanda
        const [diasRows] = await pool.query(`
            SELECT
                DAYOFWEEK(fecha_visita) AS dia_numero,
                COUNT(*) AS operaciones,
                COALESCE(SUM(cantidad_personas), 0) AS personas,
                COALESCE(SUM(total), 0) AS ingresos_estimados
            FROM ventas
            WHERE fecha_visita BETWEEN ? AND ?
              AND estado_pago <> 'cancelado'
            GROUP BY DAYOFWEEK(fecha_visita)
            ORDER BY personas DESC
        `, [fechaInicio, fechaFin]);

        const diasProcesados = diasRows.map(d => ({
            dia_numero: Number(d.dia_numero),
            dia_nombre: diasSemana[Number(d.dia_numero)] || 'Sin dato',
            operaciones: Number(d.operaciones || 0),
            personas: Number(d.personas || 0),
            ingresos_estimados: Number(d.ingresos_estimados || 0)
        }));

        const diasBajos = [...diasProcesados]
            .filter(d => Number(d.personas || 0) > 0)
            .sort((a, b) => Number(a.personas || 0) - Number(b.personas || 0))
            .slice(0, 5);

        const resumen = resumenRows[0] || {};
        const categoriaTop = categoriasRows.length ? categoriasRows[0].nombre : 'Sin datos';
        const diaTop = diasProcesados.length ? diasProcesados[0].dia_nombre : 'Sin datos';
        const diaBajo = diasBajos.length ? diasBajos[0].dia_nombre : 'Sin datos';

        const pendientes = Number(resumen.pendientes_pago || 0);
        const pagadas = Number(resumen.pagadas || 0);
        const totalOps = Number(resumen.total_operaciones || 0);
        const personasPeriodo = Number(resumen.personas_periodo || 0);

        const conversionPago = totalOps > 0
            ? Number(((pagadas / totalOps) * 100).toFixed(1))
            : 0;

        const fechaInicioDate = new Date(`${fechaInicio}T00:00:00`);
        const fechaFinDate = new Date(`${fechaFin}T00:00:00`);
        const diasPeriodo = Math.max(
            1,
            Math.round((fechaFinDate - fechaInicioDate) / (1000 * 60 * 60 * 24)) + 1
        );

        const promedioDiario = personasPeriodo > 0
            ? personasPeriodo / diasPeriodo
            : 20;

        const pronosticoMensual = [];

        for (let i = 1; i <= 6; i++) {
            const { year, month } = sumarMes(fechaFin, i);
            const factor = factorTemporada(month);
            const diasMes = diasDelMes(year, month);
            const estimado = Math.round(promedioDiario * diasMes * factor);

            pronosticoMensual.push({
                year,
                month,
                mes_nombre: `${nombresMes[month]} ${year}`,
                visitantes_estimados: estimado,
                factor_temporada: factor,
                motivo: motivoTemporada(month)
            });
        }

        const canalTop = canalesRows.length
            ? canalesRows
                .map(c => ({
                    canal_venta: c.canal_venta,
                    total: Number(c.total || 0),
                    personas: Number(c.personas || 0)
                }))
                .sort((a, b) => b.total - a.total)[0]
            : null;

        const mesPronosticoTop = pronosticoMensual.length
            ? [...pronosticoMensual].sort((a, b) => b.visitantes_estimados - a.visitantes_estimados)[0]
            : null;

        res.json({
            success: true,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            resumen: {
                total_operaciones: totalOps,
                reservaciones_web: Number(resumen.reservaciones_web || 0),
                ventas_taquilla: Number(resumen.ventas_taquilla || 0),
                pendientes_pago: pendientes,
                pagadas,
                personas_periodo: personasPeriodo,
                ingresos_estimados: Number(resumen.ingresos_estimados || 0),
                ingresos_cobrados: Number(resumen.ingresos_cobrados || 0),
                conversion_pago: conversionPago
            },
            categorias: categoriasRows.map(c => ({
                nombre: c.nombre,
                cantidad: Number(c.cantidad || 0),
                total: Number(c.total || 0)
            })),
            estados: estadosRows.map(e => ({
                estado_pago: e.estado_pago,
                total: Number(e.total || 0)
            })),
            canales: canalesRows.map(c => ({
                canal_venta: c.canal_venta,
                total: Number(c.total || 0),
                personas: Number(c.personas || 0),
                ingresos_cobrados: Number(c.ingresos_cobrados || 0)
            })),
            tendencia_dias: tendenciaRows.map(t => ({
                fecha_visita: String(t.fecha_visita).slice(0, 10),
                operaciones: Number(t.operaciones || 0),
                personas: Number(t.personas || 0),
                ingresos_estimados: Number(t.ingresos_estimados || 0),
                ingresos_cobrados: Number(t.ingresos_cobrados || 0)
            })),
            dias_semana: diasProcesados,
            dias_bajos: diasBajos,
            pronostico_mensual: pronosticoMensual,
            insights: {
                categoria_top: categoriaTop,
                dia_top: diaTop,
                dia_bajo: diaBajo,
                mensaje_categoria: categoriaTop !== 'Sin datos'
                    ? `La categoría con mayor demanda es ${categoriaTop}. Conviene crear paquetes o promociones relacionadas con este tipo de visitante.`
                    : 'Aún no hay suficientes datos por categoría.',
                mensaje_dia: diaTop !== 'Sin datos'
                    ? `El día con mayor demanda es ${diaTop}. Se recomienda reforzar atención en taquilla y acceso ese día.`
                    : 'Aún no hay suficientes datos por día.',
                mensaje_pago: pendientes > 0
                    ? `Hay ${pendientes} reservación(es) pendiente(s) de pago. Conviene dar seguimiento en taquilla.`
                    : 'No hay reservaciones pendientes de pago para este periodo.',
                mensaje_promocion: diaBajo !== 'Sin datos'
                    ? `El día con menor demanda es ${diaBajo}. Se recomienda probar una promoción 2x1 solo en compras en línea para aumentar visitantes sin saturar taquilla.`
                    : 'Aún no hay suficientes datos para sugerir una promoción por día bajo.',
                mensaje_canal: canalTop
                    ? `El canal con más operaciones es ${canalTop.canal_venta === 'web' ? 'reservación web' : 'venta en taquilla'}. Se recomienda impulsar la venta web para reducir filas y mejorar la planeación.`
                    : 'Aún no hay suficientes datos por canal.',
                mensaje_pronostico: mesPronosticoTop
                    ? `${mesPronosticoTop.mes_nombre} podría tener mayor afluencia aproximada por: ${mesPronosticoTop.motivo}.`
                    : 'Aún no hay suficientes datos para generar pronóstico.'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo BI',
            error: error.message
        });
    }
});

// ============================================
// 🚪 HISTORIAL DE ACCESOS
// ============================================
app.get('/api/historial-accesos', async (req, res) => {
    try {
        const {
            fecha,
            resultado,
            folio,
            limit = 100
        } = req.query;

        const condiciones = [];
        const valores = [];

        if (fecha) {
            condiciones.push('DATE(a.fecha_acceso) = ?');
            valores.push(fecha);
        }

        if (resultado) {
            condiciones.push('a.resultado = ?');
            valores.push(resultado);
        }

        if (folio) {
            condiciones.push('v.folio LIKE ?');
            valores.push(`%${folio}%`);
        }

        const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

        const [rows] = await pool.query(`
            SELECT
                a.id,
                a.fecha_acceso,
                a.resultado,
                a.dispositivo,
                a.ip_dispositivo,
                a.motivo_rechazo,
                a.observaciones,
                v.folio,
                v.email,
                v.nombre_cliente,
                v.fecha_visita,
                v.total,
                u.nombre AS taquillero_nombre,
                u.apellidos AS taquillero_apellidos
            FROM accesos a
            INNER JOIN ventas v ON v.id = a.venta_id
            LEFT JOIN usuarios u ON u.id = a.taquillero_id
            ${where}
            ORDER BY a.fecha_acceso DESC
            LIMIT ?
        `, [...valores, Number(limit)]);

        res.json({
            success: true,
            total: rows.length,
            accesos: rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo historial de accesos',
            error: error.message
        });
    }
});

// ============================================
// 📊 ESTADÍSTICAS DINÁMICAS
// ============================================
app.get('/api/estadisticas', async (req, res) => {
    try {
        const fecha = fechaHoyISO();

        const [ventasHoyRows] = await pool.query(`
            SELECT 
                COUNT(*) AS ventas_hoy,
                COALESCE(SUM(CASE WHEN estado_pago = 'pagado' THEN total ELSE 0 END), 0) AS ingresos_hoy,
                COALESCE(SUM(cantidad_personas), 0) AS personas_hoy,
                COALESCE(SUM(CASE WHEN canal_venta = 'web' THEN 1 ELSE 0 END), 0) AS ventas_web,
                COALESCE(SUM(CASE WHEN canal_venta = 'taquilla' THEN 1 ELSE 0 END), 0) AS ventas_taquilla
            FROM ventas
            WHERE DATE(fecha_venta) = ?
              AND estado_pago <> 'cancelado'
        `, [fecha]);

        const [accesosHoyRows] = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN resultado = 'aceptado' THEN 1 ELSE 0 END), 0) AS accesos_aceptados_hoy,
                COALESCE(SUM(CASE WHEN resultado = 'rechazado' THEN 1 ELSE 0 END), 0) AS accesos_rechazados_hoy
            FROM accesos
            WHERE DATE(fecha_acceso) = ?
        `, [fecha]);

        const [pendientesRows] = await pool.query(`
            SELECT 
                COUNT(*) AS pendientes_hoy
            FROM ventas
            WHERE fecha_visita = ?
              AND canal_venta = 'web'
              AND estado_acceso = 'pendiente'
              AND estado_pago <> 'cancelado'
              AND qr_usado = 0
        `, [fecha]);

        const [masVendidaRows] = await pool.query(`
            SELECT 
                c.nombre,
                COALESCE(SUM(dv.cantidad), 0) AS total_vendidos
            FROM detalle_venta dv
            INNER JOIN ventas v ON v.id = dv.venta_id
            INNER JOIN categorias c ON c.id = dv.categoria_id
            WHERE DATE(v.fecha_venta) = ?
              AND v.estado_pago <> 'cancelado'
            GROUP BY c.id, c.nombre
            ORDER BY total_vendidos DESC
            LIMIT 1
        `, [fecha]);

        const [ultimasVentasRows] = await pool.query(`
            SELECT
                v.folio,
                DATE_FORMAT(v.fecha_venta, '%H:%i') AS hora,
                v.nombre_cliente,
                v.email,
                v.canal_venta,
                v.estado_pago,
                v.estado_acceso,
                v.cantidad_personas,
                v.total
            FROM ventas v
            WHERE DATE(v.fecha_venta) = ?
              AND v.estado_pago <> 'cancelado'
            ORDER BY v.fecha_venta DESC
            LIMIT 15
        `, [fecha]);

        const diaSemana = obtenerDiaSemanaMySQL(fecha);

        const [promoRows] = await pool.query(`
            SELECT 
                p.id,
                p.nombre,
                p.descripcion,
                p.tipo,
                p.canal,
                p.categoria_id,
                c.nombre AS categoria_nombre
            FROM promociones p
            LEFT JOIN categorias c ON c.id = p.categoria_id
            WHERE p.activo = 1
              AND p.canal IN ('web', 'ambos')
              AND p.fecha_inicio <= ?
              AND p.fecha_fin >= ?
              AND (p.dia_semana IS NULL OR p.dia_semana = ?)
            ORDER BY p.fecha_creacion DESC
            LIMIT 1
        `, [fecha, fecha, diaSemana]);

        const ventas = ventasHoyRows[0] || {};
        const accesos = accesosHoyRows[0] || {};
        const pendientes = pendientesRows[0] || {};

        res.json({
            success: true,
            fecha,
            ventas_hoy: Number(ventas.ventas_hoy || 0),
            ingresos_hoy: Number(ventas.ingresos_hoy || 0),
            personas_hoy: Number(ventas.personas_hoy || 0),
            visitantes_actuales: Number(accesos.accesos_aceptados_hoy || 0),
            accesos_rechazados_hoy: Number(accesos.accesos_rechazados_hoy || 0),
            qr_pendientes_hoy: Number(pendientes.pendientes_hoy || 0),
            boletos_mas_vendidos: masVendidaRows.length ? masVendidaRows[0].nombre : 'Sin datos',

            canales: {
                web: Number(ventas.ventas_web || 0),
                taquilla: Number(ventas.ventas_taquilla || 0)
            },

            promocion_activa: promoRows.length ? promoRows[0] : null,
            ultimas_ventas: ultimasVentasRows,
            alertas_fraude: 0
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estadísticas',
            error: error.message
        });
    }
});

// ============================================
// 📧 PROBAR SMTP
// ============================================
app.get('/api/test-email', async (req, res) => {
    try {
        const correoPrueba = SMTP_USER || 'ramirezerickdamian30@gmail.com';

        if (EMAIL_PROVIDER === 'resend') {
            if (!resend) {
                return res.json({
                    success: false,
                    message: 'Resend no configurado. Falta RESEND_API_KEY.'
                });
            }

            const { data, error } = await resend.emails.send({
                from: RESEND_FROM,
                to: [correoPrueba],
                subject: '✅ Prueba de correo - Zoológico El Sabinal',
                html: `
                    <h2>✅ Correo funcionando</h2>
                    <p>Resend ya está enviando correos desde Railway.</p>
                `
            });

            if (error) {
                return res.json({
                    success: false,
                    message: error.message || JSON.stringify(error)
                });
            }

            return res.json({
                success: true,
                message: '✅ Correo enviado correctamente con Resend',
                data
            });
        }

        if (!smtpHabilitado || !transporter) {
            return res.json({
                success: false,
                message: 'SMTP no configurado'
            });
        }

        await transporter.verify();

        res.json({
            success: true,
            message: '✅ Conexión SMTP exitosa'
        });
    } catch (error) {
        res.json({
            success: false,
            message: error.message
        });
    }
});

// ============================================
// 🏠 RUTA BASE
// ============================================
app.get('/', (req, res) => {
    if (fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
        return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
    }

    res.json({
        ok: true,
        mensaje: 'API Zoológico El Sabinal funcionando'
    });
});

// ============================================
// 🚀 INICIAR SERVIDOR
// ============================================
app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📁 Carpeta de QRs: ${QR_DIR}`);

  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT DATABASE() AS db_actual, USER() AS usuario_actual');
    conn.release();

    console.log('✅ Conectado a MySQL');
    console.log('🧪 MySQL DEBUG:', rows[0]);
  } catch (error) {
    console.log('❌ Error conectando a MySQL:', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      message: error.message
    });
  }
});