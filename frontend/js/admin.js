const API_BASE = 'https://zoologico-trinitaria-production.up.railway.app';
const PANEL_LOGIN_URL = 'https://zoologico-trinitaria-production.up.railway.app/panel-login';
let ventaActual = null;
let categoriasTaquilla = [];
let ventaTaquillaActual = null;

let chartCategorias = null;
let chartEstados = null;
let chartCanales = null;
let chartDashboardCanales = null;
let chartDiasSemana = null;
let chartTendencia = null;
let chartIngresos = null;
let chartDiasBajos = null;
let chartPronostico = null;
let animalesCache = [];
let animalEditandoId = null;

let ultimoBI = null;

// ============================================
// 🔐 Global fetch wrapper — ALWAYS sends the
// session cookie so every API call is authorized
// ============================================
async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    return res;
}

function cerrarSesion() {
    // Always redirect to Railway for logout — never Vercel
    window.location.href = 'https://zoologico-trinitaria-production.up.railway.app/panel-logout';
}


function mostrarUsuarioPanel(username) {
  const box = document.getElementById('panelUsername');
  if (box) {
    box.textContent = username || 'Usuario desconocido';
  }
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function addDaysISO(fechaISO, dias) {
  const fecha = new Date(`${fechaISO}T00:00:00`);
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().split('T')[0];
}

function firstDayOfCurrentMonthISO() {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function nombreArchivoSeguro(texto) {
  return String(texto || 'archivo')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function money(value) {
  return '$' + Number(value || 0).toFixed(2);
}

function destruirChart(chart) {
  if (chart) { chart.destroy(); }
  return null;
}

function crearGrafica(ctxId, tipo, labels, data, label, extraOptions = {}) {
  const ctx = document.getElementById(ctxId);
  if (!ctx) return null;
  return new Chart(ctx, {
    type: tipo,
    data: {
      labels,
      datasets: [{ label, data, borderWidth: 2, borderRadius: 8 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: tipo !== 'bar' && tipo !== 'line' } },
      scales: tipo === 'doughnut' || tipo === 'pie' ? {} : { y: { beginAtZero: true, ticks: { precision: 0 } } },
      ...extraOptions
    }
  });
}

function crearGraficaMultiple(ctxId, tipo, labels, datasets, extraOptions = {}) {
  const ctx = document.getElementById(ctxId);
  if (!ctx) return null;
  return new Chart(ctx, {
    type: tipo,
    data: {
      labels,
      datasets: datasets.map(ds => ({
        ...ds,
        borderWidth: 2,
        borderRadius: tipo === 'bar' ? 8 : 0,
        tension: tipo === 'line' ? 0.35 : undefined,
        fill: false
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      ...extraOptions
    }
  });
}

function setMessage(id, text, type = 'ok') {
  const box = document.getElementById(id);
  box.className = `message show ${type}`;
  box.textContent = text;
}

function clearMessage(id) {
  const box = document.getElementById(id);
  box.className = 'message';
  box.textContent = '';
}

function badgeEstado(valor) {
  const v = String(valor || '').toLowerCase();
  if (['pagado', 'usado', 'aceptado'].includes(v)) return `<span class="tag ok">${valor}</span>`;
  if (['pendiente'].includes(v)) return `<span class="tag warn">${valor}</span>`;
  return `<span class="tag bad">${valor}</span>`;
}

function cambiarPanel(nombre) {
  document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.panel === nombre);
  });
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(`panel-${nombre}`).classList.add('active');
}

function descargarCSV(nombreArchivo, filas) {
  if (!filas.length) return;
  const encabezados = Object.keys(filas[0]);
  const csv = [
    encabezados.join(','),
    ...filas.map(f =>
      encabezados.map(k => {
        const valor = String(f[k] ?? '').replace(/"/g, '""');
        return `"${valor}"`;
      }).join(',')
    )
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

function verDetalleDesdeVentas(folio) {
  cambiarPanel('buscar');
  document.getElementById('folioBuscar').value = folio;
  buscarFolio();
}

function descargarQRDetalle() {
  if (!ventaActual || !ventaActual.folio) {
    setMessage('msgBuscar', '❌ Primero busca una venta.', 'error');
    return;
  }
  const url = `${API_BASE}/qrs/${encodeURIComponent(ventaActual.folio)}.png`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ventaActual.folio}.png`;
  a.click();
}

function reimprimirDetalle() {
  if (!ventaActual) {
    setMessage('msgBuscar', '❌ Primero busca una venta.', 'error');
    return;
  }
  const detallesHtml = (ventaActual.detalles || []).length
    ? ventaActual.detalles.map(d => `<li>${d.nombre} x${d.cantidad} — ${money(d.subtotal)}</li>`).join('')
    : '<li>Sin detalle</li>';
  const popup = window.open('', '_blank', 'width=900,height=700');
  popup.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Comprobante ${ventaActual.folio}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#222;}.wrap{max-width:720px;margin:auto;border:2px solid #d4a373;border-radius:18px;padding:24px;}h1{margin-top:0;color:#1b4332;}.qr{text-align:center;margin:20px 0;}.qr img{max-width:220px;border:1px solid #ccc;padding:10px;border-radius:12px;}.box{background:#f8f9fa;padding:14px;border-radius:12px;margin:10px 0;}ul{margin:0;padding-left:20px;}</style>
</head><body><div class="wrap"><h1>🦁 Zoológico El Sabinal</h1>
<div class="box"><strong>Folio:</strong> ${ventaActual.folio}</div>
<div class="box"><strong>Cliente:</strong> ${ventaActual.nombre_cliente || 'N/A'}</div>
<div class="box"><strong>Email:</strong> ${ventaActual.email || 'N/A'}</div>
<div class="box"><strong>Teléfono:</strong> ${ventaActual.telefono || 'N/A'}</div>
<div class="box"><strong>Fecha visita:</strong> ${ventaActual.fecha_visita ? String(ventaActual.fecha_visita).slice(0,10) : 'N/A'}</div>
<div class="box"><strong>Total:</strong> ${money(ventaActual.total)}</div>
<div class="box"><strong>Método de pago:</strong> ${ventaActual.metodo_pago || 'N/A'}</div>
<div class="box"><strong>Estado pago:</strong> ${ventaActual.estado_pago || 'N/A'}</div>
<div class="box"><strong>Estado acceso:</strong> ${ventaActual.estado_acceso || 'N/A'}</div>
<div class="qr"><img src="${API_BASE}/qrs/${encodeURIComponent(ventaActual.folio)}.png" alt="QR"></div>
<div class="box"><strong>Detalle de compra</strong><ul>${detallesHtml}</ul></div>
</div><script>window.onload=function(){window.print();}<\/script></body></html>`);
  popup.document.close();
}

async function cancelarVentaActual() {
  if (!ventaActual || !ventaActual.folio) {
    setMessage('msgBuscar', '❌ Primero busca una venta.', 'error');
    return;
  }
  const confirmado = confirm(`¿Seguro que deseas cancelar la venta ${ventaActual.folio}?`);
  if (!confirmado) return;
  const motivo = prompt('Motivo de cancelación:', 'Cancelación manual desde panel admin');
  if (motivo === null) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/ventas/${encodeURIComponent(ventaActual.folio)}/cancelar`, {
      method: 'POST',
      body: JSON.stringify({ motivo })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo cancelar la venta');
    setMessage('msgBuscar', '✅ Venta cancelada correctamente.', 'ok');
    await buscarFolio();
    await cargarVentas();
    await cargarDashboard();
    await cargarCorte();
  } catch (error) {
    setMessage('msgBuscar', '❌ ' + error.message, 'error');
  }
}

async function confirmarPagoActual() {
  if (!ventaActual || !ventaActual.folio) {
    setMessage('msgBuscar', '❌ Primero busca una reservación.', 'error');
    return;
  }
  const confirmado = confirm(`¿Confirmar pago de la reservación ${ventaActual.folio}?`);
  if (!confirmado) return;
  const metodoPago = prompt('Método de pago: efectivo, tarjeta, transferencia o cortesia', 'efectivo');
  if (metodoPago === null) return;
  const metodoFinal = metodoPago.trim().toLowerCase();
  const metodosValidos = ['efectivo', 'tarjeta', 'transferencia', 'pago_en_linea', 'cortesia'];
  if (!metodosValidos.includes(metodoFinal)) {
    setMessage('msgBuscar', '❌ Método de pago no válido.', 'error');
    return;
  }
  try {
    const res = await apiFetch(`${API_BASE}/api/ventas/${encodeURIComponent(ventaActual.folio)}/confirmar-pago`, {
      method: 'POST',
      body: JSON.stringify({ metodo_pago: metodoFinal, referencia_pago: 'Pago confirmado desde panel admin' })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo confirmar el pago');
    setMessage('msgBuscar', '✅ Pago confirmado correctamente. Ahora el QR ya puede validarse en el lector.', 'ok');
    await buscarFolio();
    await cargarDashboard();
    await cargarVentas();
    await cargarCorte();
    if (typeof cargarBI === 'function') await cargarBI();
  } catch (error) {
    setMessage('msgBuscar', '❌ ' + error.message, 'error');
  }
}

async function registrarEntradaManualActual() {
  if (!ventaActual || !ventaActual.folio) {
    setMessage('msgBuscar', '❌ Primero busca una venta.', 'error');
    return;
  }
  const confirmado = confirm(`¿Registrar entrada manual para el folio ${ventaActual.folio}?`);
  if (!confirmado) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/ventas/${encodeURIComponent(ventaActual.folio)}/registrar-entrada`, {
      method: 'POST',
      body: JSON.stringify({ dispositivo: 'Registro manual desde panel admin', observaciones: 'Entrada manual de ticket de taquilla' })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo registrar la entrada');
    setMessage('msgBuscar', '✅ Entrada registrada correctamente.', 'ok');
    await buscarFolio();
    await cargarDashboard();
    await cargarVentas();
    await cargarAccesos();
    await cargarCorte();
    if (typeof cargarBI === 'function') await cargarBI();
  } catch (error) {
    setMessage('msgBuscar', '❌ ' + error.message, 'error');
  }
}

async function cargarCategoriasTaquilla() {
  clearMessage('msgTaquilla');
  try {
    // categorias is public, no auth needed — but apiFetch is fine too
    const res = await apiFetch(`${API_BASE}/api/categorias`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudieron cargar las categorías');
    categoriasTaquilla = data.categorias || [];
    renderCategoriasTaquilla();
    recalcularTaquilla();
  } catch (error) {
    document.getElementById('tkCategoriasWrap').innerHTML = 'Error cargando categorías.';
    setMessage('msgTaquilla', '❌ ' + error.message, 'error');
  }
}

let promocionesCache = [];
let promoEditandoId = null;

function nombreDiaPromo(valor) {
  const mapa = { 1: 'Domingo', 2: 'Lunes', 3: 'Martes', 4: 'Miércoles', 5: 'Jueves', 6: 'Viernes', 7: 'Sábado' };
  return mapa[Number(valor)] || 'Todos los días';
}

function fechaCorta(valor) {
  return valor ? String(valor).slice(0, 10) : '';
}

async function cargarPromociones() {
  const lista = document.getElementById('listaPromociones');
  if (!lista) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/promociones`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudieron cargar promociones');
    promocionesCache = data.promociones || [];
    if (!promocionesCache.length) {
      lista.innerHTML = '<div class="tiny-note">Aún no hay promociones registradas.</div>';
      return;
    }
    lista.innerHTML = promocionesCache.map(p => `
      <div class="promo-card ${Number(p.activo) === 1 ? 'activa' : 'inactiva'}">
        <div>
          <h4>${p.nombre}</h4>
          <p>${p.descripcion || 'Sin descripción'}</p>
          <p><span class="promo-badge ok">${p.tipo}</span> <span class="promo-badge warn">${p.canal === 'web' ? 'Solo web' : p.canal}</span></p>
          <p><strong>Vigencia:</strong> ${fechaCorta(p.fecha_inicio)} al ${fechaCorta(p.fecha_fin)}</p>
          <p><strong>Día:</strong> ${nombreDiaPromo(p.dia_semana)}</p>
          <p><strong>Categoría:</strong> ${p.categoria_nombre || 'Todas'}</p>
          <p><strong>Estado:</strong> ${Number(p.activo) === 1 ? 'Activa ✅' : 'Inactiva ⏸️'}</p>
        </div>
        <div class="promo-actions">
          <button class="btn btn-outline btn-sm" onclick="editarPromocion(${p.id})">✏️ Modificar</button>
          <button class="btn ${Number(p.activo) === 1 ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="togglePromocion(${p.id})">${Number(p.activo) === 1 ? 'Desactivar' : 'Activar'}</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarPromocion(${p.id})">🗑️ Eliminar</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    lista.innerHTML = 'Error cargando promociones.';
    setMessage('msgPromos', '❌ ' + error.message, 'error');
  }
}

function limpiarFormularioPromo() {
  promoEditandoId = null;
  const editId = document.getElementById('promoEditId');
  if (editId) editId.value = '';
  document.getElementById('promoNombre').value = '';
  document.getElementById('promoCategoria').value = '';
  document.getElementById('promoDia').value = '';
  document.getElementById('promoDescripcion').value = '';
  const hoy = todayISO();
  document.getElementById('promoInicio').value = hoy;
  document.getElementById('promoFin').value = hoy;
  const btn = document.getElementById('btnGuardarPromo');
  if (btn) btn.textContent = 'Guardar promoción';
  clearMessage('msgPromos');
}

function editarPromocion(id) {
  const promo = promocionesCache.find(p => Number(p.id) === Number(id));
  if (!promo) { setMessage('msgPromos', '❌ No se encontró la promoción para editar.', 'error'); return; }
  promoEditandoId = Number(id);
  const editId = document.getElementById('promoEditId');
  if (editId) editId.value = String(id);
  document.getElementById('promoNombre').value = promo.nombre || '';
  document.getElementById('promoCategoria').value = promo.categoria_id || '';
  document.getElementById('promoDia').value = promo.dia_semana || '';
  document.getElementById('promoInicio').value = fechaCorta(promo.fecha_inicio);
  document.getElementById('promoFin').value = fechaCorta(promo.fecha_fin);
  document.getElementById('promoDescripcion').value = promo.descripcion || '';
  const btn = document.getElementById('btnGuardarPromo');
  if (btn) btn.textContent = 'Actualizar promoción';
  setMessage('msgPromos', '✏️ Editando promoción. Modifica los datos y presiona "Actualizar promoción".', 'ok');
  const panel = document.getElementById('panel-promociones');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function guardarPromocion() {
  clearMessage('msgPromos');
  const editId = document.getElementById('promoEditId')?.value || '';
  const idEditar = promoEditandoId || (editId ? Number(editId) : null);
  const nombre = document.getElementById('promoNombre').value.trim();
  const categoria_id = document.getElementById('promoCategoria').value || null;
  const dia_semana = document.getElementById('promoDia').value || null;
  const fecha_inicio = document.getElementById('promoInicio').value;
  const fecha_fin = document.getElementById('promoFin').value;
  const descripcion = document.getElementById('promoDescripcion').value.trim();
  if (!nombre || !fecha_inicio || !fecha_fin) {
    setMessage('msgPromos', '❌ Completa nombre, fecha inicial y fecha final.', 'error');
    return;
  }
  if (fecha_inicio > fecha_fin) {
    setMessage('msgPromos', '❌ La fecha inicial no puede ser mayor que la fecha final.', 'error');
    return;
  }
  try {
    const url = idEditar ? `${API_BASE}/api/promociones/${idEditar}` : `${API_BASE}/api/promociones`;
    const method = idEditar ? 'PUT' : 'POST';
    const res = await apiFetch(url, {
      method,
      body: JSON.stringify({ nombre, descripcion, tipo: '2x1', canal: 'web', categoria_id, dia_semana, fecha_inicio, fecha_fin, activo: 1 })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo guardar la promoción');
    setMessage('msgPromos', idEditar ? '✅ Promoción actualizada correctamente.' : '✅ Promoción guardada correctamente.', 'ok');
    limpiarFormularioPromo();
    await cargarPromociones();
  } catch (error) {
    setMessage('msgPromos', '❌ ' + error.message, 'error');
  }
}

async function togglePromocion(id) {
  try {
    const res = await apiFetch(`${API_BASE}/api/promociones/${id}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo cambiar el estado');
    await cargarPromociones();
  } catch (error) {
    setMessage('msgPromos', '❌ ' + error.message, 'error');
  }
}

async function eliminarPromocion(id) {
  const promo = promocionesCache.find(p => Number(p.id) === Number(id));
  const nombre = promo ? promo.nombre : 'esta promoción';
  const confirmado = confirm(`¿Seguro que deseas eliminar "${nombre}"?\n\nSi ya fue usada en ventas, el sistema solo la desactivará para no romper el historial.`);
  if (!confirmado) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/promociones/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo eliminar la promoción');
    setMessage('msgPromos', data.message || '✅ Promoción procesada correctamente.', 'ok');
    if (Number(id) === Number(promoEditandoId)) limpiarFormularioPromo();
    await cargarPromociones();
  } catch (error) {
    setMessage('msgPromos', '❌ ' + error.message, 'error');
  }
}

function cargarCategoriasPromos() {
  const select = document.getElementById('promoCategoria');
  if (!select) return;
  select.innerHTML = `<option value="">Todas las categorías</option>
    ${(categoriasTaquilla || []).map(cat => `<option value="${cat.id}">${cat.nombre}</option>`).join('')}`;
}

function renderCategoriasTaquilla() {
  const wrap = document.getElementById('tkCategoriasWrap');
  const iconos = { INF: '🧒', ADU: '🧑', AMY: '👴', EST: '🎓' };
  const categoriasVisibles = (categoriasTaquilla || []).filter(cat => {
    const clave = String(cat.clave || '').toUpperCase();
    const nombre = String(cat.nombre || '').toLowerCase();
    return clave !== 'NIN' && nombre !== 'niño' && Number(cat.precio || 0) > 0;
  });
  if (!categoriasVisibles.length) { wrap.innerHTML = 'No hay categorías activas para taquilla.'; return; }
  wrap.innerHTML = categoriasVisibles.map(cat => {
    const clave = String(cat.clave || '').toUpperCase();
    const icono = iconos[clave] || '🎟️';
    return `<div class="categoria-card" data-card-categoria="${cat.id}">
      <div class="cat-main">
        <div class="cat-icon">${icono}</div>
        <div>
          <div class="cat-nombre">${cat.nombre}</div>
          <div class="cat-meta">${cat.descripcion || 'Boleto de acceso al zoológico'}${Number(cat.requiere_credencial) === 1 ? '<br><strong>Requiere credencial vigente</strong>' : ''}</div>
          <span class="cat-precio">${money(cat.precio)}</span>
        </div>
      </div>
      <div class="qty-control">
        <button type="button" class="qty-btn" onclick="ajustarCantidadTaquilla(${cat.id}, -1)">−</button>
        <input id="tkCantidad-${cat.id}" type="number" min="0" step="1" value="0" data-categoria-id="${cat.id}" data-precio="${cat.precio}" class="tk-cantidad" oninput="recalcularTaquilla()">
        <button type="button" class="qty-btn" onclick="ajustarCantidadTaquilla(${cat.id}, 1)">+</button>
      </div>
    </div>`;
  }).join('');
}

function ajustarCantidadTaquilla(categoriaId, cambio) {
  const input = document.getElementById(`tkCantidad-${categoriaId}`);
  if (!input) return;
  const actual = Number(input.value || 0);
  const nuevo = Math.max(0, actual + cambio);
  input.value = nuevo;
  recalcularTaquilla();
}

function recalcularTaquilla() {
  const inputs = document.querySelectorAll('.tk-cantidad');
  let totalPersonas = 0;
  let totalMonto = 0;
  inputs.forEach(input => {
    const cantidad = Number(input.value || 0);
    const precio = Number(input.dataset.precio || 0);
    const card = input.closest('.categoria-card');
    if (card) card.classList.toggle('selected', cantidad > 0);
    totalPersonas += cantidad;
    totalMonto += cantidad * precio;
  });
  document.getElementById('tkTotalPersonas').textContent = totalPersonas;
  document.getElementById('tkTotalMonto').textContent = money(totalMonto);
  const btnVender = document.getElementById('btnTkVender');
  if (btnVender) btnVender.disabled = totalPersonas <= 0;
}

function limpiarTaquilla() {
  document.getElementById('tkNombre').value = '';
  document.getElementById('tkTelefono').value = '';
  document.getElementById('tkEmail').value = '';
  document.getElementById('tkFecha').value = todayISO();
  document.getElementById('tkMetodoPago').value = 'efectivo';
  document.querySelectorAll('.tk-cantidad').forEach(input => { input.value = 0; });
  ventaTaquillaActual = null;
  document.getElementById('tkResultado').classList.remove('show');
  clearMessage('msgTaquilla');
  recalcularTaquilla();
}

function obtenerDetallesTaquilla() {
  const inputs = document.querySelectorAll('.tk-cantidad');
  const detalles = [];
  inputs.forEach(input => {
    const cantidad = Number(input.value || 0);
    const categoriaId = Number(input.dataset.categoriaId);
    if (cantidad > 0) detalles.push({ categoria_id: categoriaId, cantidad });
  });
  return detalles;
}

async function venderEnTaquilla() {
  clearMessage('msgTaquilla');
  const btnVender = document.getElementById('btnTkVender');
  const textoOriginal = btnVender.textContent;
  const nombre = document.getElementById('tkNombre').value.trim();
  const telefono = document.getElementById('tkTelefono').value.trim();
  const emailCapturado = document.getElementById('tkEmail').value.trim();
  const fecha = document.getElementById('tkFecha').value;
  const metodoPago = 'efectivo';
  const detalles = obtenerDetallesTaquilla();
  if (!fecha) { setMessage('msgTaquilla', '❌ Selecciona la fecha de visita.', 'error'); return; }
  if (!detalles.length) { setMessage('msgTaquilla', '❌ Debes seleccionar al menos un boleto.', 'error'); return; }
  const emailFinal = emailCapturado || '';
  try {
    btnVender.disabled = true;
    btnVender.textContent = '⏳ Registrando venta...';
    const res = await apiFetch(`${API_BASE}/api/venta`, {
      method: 'POST',
      body: JSON.stringify({
        nombre_cliente: nombre || 'Cliente de taquilla',
        email: emailFinal, telefono, fecha_visita: fecha,
        metodo_pago: metodoPago, canal_venta: 'taquilla',
        observaciones: 'Venta en taquilla desde panel admin', detalles
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo generar la venta');
    ventaTaquillaActual = { ...data.venta, detalles: data.detalles || [], nombre_cliente: nombre || 'Cliente de taquilla', telefono, metodo_pago: metodoPago, email: emailFinal };
    const detalleTicketHtml = (data.detalles || []).map(d => `<div class="ticket-row"><span>${d.nombre} x${d.cantidad}</span><strong>${money(d.subtotal)}</strong></div>`).join('');
    document.getElementById('tkResumenVenta').innerHTML = `
      <div class="ticket-preview">
        <h4>🦁 Zoológico El Sabinal</h4>
        <p><strong>Ticket de compra en taquilla</strong></p>
        <div class="ticket-row"><span>Folio</span><strong>${data.venta.folio}</strong></div>
        <div class="ticket-row"><span>Cliente</span><strong>${nombre || 'Cliente de taquilla'}</strong></div>
        <div class="ticket-row"><span>Fecha de visita</span><strong>${data.venta.fecha_visita}</strong></div>
        <div class="ticket-row"><span>Método de pago</span><strong>Efectivo</strong></div>
        <div class="ticket-row"><span>Estado</span><strong>Pagado</strong></div>
        <hr>${detalleTicketHtml}
        <div class="ticket-total">Total pagado: ${money(data.venta.total)}</div>
        <p style="margin-top:12px;color:#5f6b7a;">Conserva este ticket como comprobante de compra.</p>
      </div>`;
    document.getElementById('tkQrImg').src = data.venta.qr_url;
    document.getElementById('tkResultado').classList.add('show');
    setMessage('msgTaquilla', '✅ Venta registrada. Ticket listo para imprimir.', 'ok');
    await cargarDashboard();
    await cargarVentas();
    await cargarCorte();
    setTimeout(() => { imprimirVentaTaquilla(); }, 350);
  } catch (error) {
    setMessage('msgTaquilla', '❌ ' + error.message, 'error');
  } finally {
    btnVender.textContent = textoOriginal;
    recalcularTaquilla();
  }
}

function descargarQRTaquilla() {
  if (!ventaTaquillaActual || !ventaTaquillaActual.folio) {
    setMessage('msgTaquilla', '❌ Primero genera una venta.', 'error');
    return;
  }
  const a = document.createElement('a');
  a.href = `${API_BASE}/qrs/${encodeURIComponent(ventaTaquillaActual.folio)}.png`;
  a.download = `${ventaTaquillaActual.folio}.png`;
  a.click();
}

function imprimirVentaTaquilla() {
  if (!ventaTaquillaActual) { setMessage('msgTaquilla', '❌ Primero genera una venta.', 'error'); return; }
  const detallesHtml = (ventaTaquillaActual.detalles || []).length
    ? ventaTaquillaActual.detalles.map(d => `<tr><td>${d.nombre||'Boleto'}</td><td style="text-align:center;">${d.cantidad}</td><td style="text-align:right;">${money(d.precio_unitario)}</td><td style="text-align:right;">${money(d.subtotal)}</td></tr>`).join('')
    : '<tr><td colspan="4">Sin detalle</td></tr>';
  const popup = window.open('', '_blank', 'width=420,height=700');
  popup.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Ticket ${ventaTaquillaActual.folio}</title>
<style>*{box-sizing:border-box;}body{font-family:Arial,sans-serif;color:#111;margin:0;padding:16px;background:#fff;}.ticket{width:100%;max-width:360px;margin:auto;border:1px dashed #111;padding:16px;}h1{font-size:20px;text-align:center;margin:0 0 6px;}.center{text-align:center;}.muted{color:#555;font-size:12px;}.line{border-top:1px dashed #111;margin:12px 0;}.row{display:flex;justify-content:space-between;gap:10px;margin:6px 0;font-size:13px;}table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;}th,td{padding:5px 2px;border-bottom:1px solid #eee;}th{text-align:left;}.total{font-size:18px;font-weight:bold;text-align:right;margin-top:12px;}.thanks{text-align:center;font-size:12px;margin-top:14px;}@media print{body{padding:0;}.ticket{border:none;}}</style>
</head><body><div class="ticket">
<h1>🦁 Zoológico El Sabinal</h1>
<div class="center muted">La Trinitaria, Chiapas</div>
<div class="center muted">Ticket de compra en taquilla</div>
<div class="line"></div>
<div class="row"><span>Folio:</span><strong>${ventaTaquillaActual.folio}</strong></div>
<div class="row"><span>Cliente:</span><strong>${ventaTaquillaActual.nombre_cliente||'Cliente de taquilla'}</strong></div>
<div class="row"><span>Teléfono:</span><strong>${ventaTaquillaActual.telefono||'N/A'}</strong></div>
<div class="row"><span>Correo:</span><strong>${ventaTaquillaActual.email||'N/A'}</strong></div>
<div class="row"><span>Fecha visita:</span><strong>${String(ventaTaquillaActual.fecha_visita||'').slice(0,10)}</strong></div>
<div class="row"><span>Método:</span><strong>Efectivo</strong></div>
<div class="row"><span>Estado:</span><strong>Pagado</strong></div>
<div class="line"></div>
<table><thead><tr><th>Boleto</th><th style="text-align:center;">Cant.</th><th style="text-align:right;">Precio</th><th style="text-align:right;">Subt.</th></tr></thead><tbody>${detallesHtml}</tbody></table>
<div class="total">Total: ${money(ventaTaquillaActual.total)}</div>
<div class="line"></div>
<div class="thanks">Gracias por tu visita 🌿<br>Conserva este ticket como comprobante.</div>
</div><script>window.onload=function(){window.print();}<\/script></body></html>`);
  popup.document.close();
}

function verDetalleTaquilla() {
  if (!ventaTaquillaActual || !ventaTaquillaActual.folio) {
    setMessage('msgTaquilla', '❌ Primero genera una venta.', 'error');
    return;
  }
  cambiarPanel('buscar');
  document.getElementById('folioBuscar').value = ventaTaquillaActual.folio;
  buscarFolio();
}

function formatoFechaMX(fechaISO) {
  if (!fechaISO) return '--/--/----';
  const [y, m, d] = String(fechaISO).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function renderDashboardRecientes(ventas = []) {
  const wrap = document.getElementById('dashboardRecientes');
  if (!wrap) return;
  if (!ventas.length) { wrap.innerHTML = '<div class="recent-empty">Sin operaciones recientes por ahora.</div>'; return; }
  wrap.innerHTML = ventas.map(v => `
    <div class="recent-item">
      <div class="recent-time">${v.hora || '--:--'}</div>
      <div class="recent-main">
        <strong>${v.nombre_cliente || 'Cliente sin nombre'}</strong>
        <small>${v.folio || 'Sin folio'} · ${v.canal_venta === 'taquilla' ? '💵 Taquilla' : '🌐 Web'} · ${v.estado_pago || 'N/A'}</small>
      </div>
      <div class="recent-total">${money(v.total)}</div>
    </div>`).join('');
}

function renderDashboardCanales(data) {
  const canales = data.canales || {};
  const web = Number(canales.web || 0);
  const taquilla = Number(canales.taquilla || 0);
  const dashWeb = document.getElementById('dashWeb');
  const dashTaquilla = document.getElementById('dashTaquilla');
  if (dashWeb) dashWeb.textContent = web;
  if (dashTaquilla) dashTaquilla.textContent = taquilla;
  chartDashboardCanales = destruirChart(chartDashboardCanales);
  chartDashboardCanales = crearGrafica('chartDashboardCanales', 'doughnut', ['Web', 'Taquilla'], [web, taquilla], 'Canales de venta', { plugins: { legend: { display: true, position: 'bottom' } }, cutout: '62%' });
}

function renderDashboardAlertas(data) {
  const pendientes = Number(data.qr_pendientes_hoy || 0);
  const personas = Number(data.personas_hoy || 0);
  const promocion = data.promocion_activa;
  const pendientesTexto = document.getElementById('dashPendientesTexto');
  const personasTexto = document.getElementById('dashPersonasTexto');
  const promoTexto = document.getElementById('dashPromoTexto');
  if (pendientesTexto) pendientesTexto.textContent = `${pendientes} pendiente${pendientes === 1 ? '' : 's'}`;
  if (personasTexto) personasTexto.textContent = `${personas} persona${personas === 1 ? '' : 's'}`;
  if (promoTexto) promoTexto.textContent = promocion ? `${promocion.nombre}${promocion.categoria_nombre ? ' · ' + promocion.categoria_nombre : ''}` : 'Sin promoción activa';
}

async function cargarDashboard() {
  clearMessage('msgDashboard');
  try {
    const res = await apiFetch(`${API_BASE}/api/estadisticas`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudieron cargar las estadísticas');
    document.getElementById('dashboardFechaHoy').textContent = formatoFechaMX(data.fecha);
    document.getElementById('cardVentasHoy').textContent = data.ventas_hoy ?? 0;
    document.getElementById('cardIngresosHoy').textContent = money(data.ingresos_hoy);
    document.getElementById('cardAccesosAceptados').textContent = data.visitantes_actuales ?? 0;
    document.getElementById('cardPendientes').textContent = data.qr_pendientes_hoy ?? 0;
    document.getElementById('cardMasVendido').textContent = data.boletos_mas_vendidos || '---';
    renderDashboardCanales(data);
    renderDashboardAlertas(data);
    renderDashboardRecientes(data.ultimas_ventas || []);
  } catch (error) {
    setMessage('msgDashboard', '❌ ' + error.message, 'error');
  }
}

async function cargarVentas() {
  clearMessage('msgVentas');
  const fecha = document.getElementById('fechaVentas').value;
  const estadoAcceso = document.getElementById('estadoAccesoVentas').value;
  const tbody = document.getElementById('tbodyVentas');
  tbody.innerHTML = '<tr><td colspan="11">Cargando ventas...</td></tr>';
  try {
    const params = new URLSearchParams();
    if (fecha) params.set('fecha', fecha);
    if (estadoAcceso) params.set('estado_acceso', estadoAcceso);
    params.set('limit', '100');
    const res = await apiFetch(`${API_BASE}/api/historial-ventas?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo cargar el historial de ventas');
    if (!data.ventas.length) { tbody.innerHTML = '<tr><td colspan="11">No hay ventas para los filtros seleccionados.</td></tr>'; return; }
    tbody.innerHTML = data.ventas.map(v => `<tr>
      <td>${v.folio}</td><td>${v.nombre_cliente || 'N/A'}</td><td>${v.email || 'N/A'}</td>
      <td>${v.fecha_visita ? String(v.fecha_visita).slice(0, 10) : 'N/A'}</td>
      <td>${v.cantidad_personas ?? 'N/A'}</td><td>${money(v.total)}</td>
      <td>${badgeEstado(v.estado_pago)}</td><td>${badgeEstado(v.estado_acceso)}</td>
      <td>${v.canal_venta || 'N/A'}</td><td>${v.total_escaneos ?? 0}</td>
      <td><button class="btn btn-secondary" onclick="verDetalleDesdeVentas('${v.folio}')">Ver detalle</button></td>
    </tr>`).join('');
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="11">Error cargando ventas.</td></tr>';
    setMessage('msgVentas', '❌ ' + error.message, 'error');
  }
}

async function cargarAccesos() {
  clearMessage('msgAccesos');
  const fecha = document.getElementById('fechaAccesos').value;
  const resultado = document.getElementById('resultadoAcceso').value;
  const tbody = document.getElementById('tbodyAccesos');
  tbody.innerHTML = '<tr><td colspan="7">Cargando accesos...</td></tr>';
  try {
    const params = new URLSearchParams();
    if (fecha) params.set('fecha', fecha);
    if (resultado) params.set('resultado', resultado);
    params.set('limit', '100');
    const res = await apiFetch(`${API_BASE}/api/historial-accesos?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo cargar el historial de accesos');
    if (!data.accesos.length) { tbody.innerHTML = '<tr><td colspan="7">No hay accesos para los filtros seleccionados.</td></tr>'; return; }
    tbody.innerHTML = data.accesos.map(a => `<tr>
      <td>${new Date(a.fecha_acceso).toLocaleString('es-MX')}</td>
      <td>${a.folio || 'N/A'}</td><td>${a.nombre_cliente || 'N/A'}</td>
      <td>${a.email || 'N/A'}</td><td>${badgeEstado(a.resultado)}</td>
      <td>${a.dispositivo || 'N/A'}</td><td>${a.motivo_rechazo || '-'}</td>
    </tr>`).join('');
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="7">Error cargando accesos.</td></tr>';
    setMessage('msgAccesos', '❌ ' + error.message, 'error');
  }
}

async function buscarFolio() {
  clearMessage('msgBuscar');
  const folio = document.getElementById('folioBuscar').value.trim();
  const card = document.getElementById('detalleVenta');
  const grid = document.getElementById('detalleGrid');
  const detalleLista = document.getElementById('detalleLista');
  const accesosLista = document.getElementById('accesosLista');
  const btnCancelar = document.getElementById('btnCancelarVenta');
  const btnConfirmarPago = document.getElementById('btnConfirmarPago');
  const btnRegistrarEntrada = document.getElementById('btnRegistrarEntrada');
  if (!folio) { setMessage('msgBuscar', '❌ Escribe un folio.', 'error'); return; }
  try {
    const res = await apiFetch(`${API_BASE}/api/ventas/${encodeURIComponent(folio)}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Venta no encontrada');
    const v = data.venta;
    ventaActual = { ...v, detalles: data.detalles || [], accesos: data.accesos || [] };
    grid.innerHTML = `
      <div><strong>Folio:</strong><br>${v.folio}</div>
      <div><strong>Cliente:</strong><br>${v.nombre_cliente || 'N/A'}</div>
      <div><strong>Email:</strong><br>${v.email || 'N/A'}</div>
      <div><strong>Teléfono:</strong><br>${v.telefono || 'N/A'}</div>
      <div><strong>Fecha visita:</strong><br>${v.fecha_visita ? String(v.fecha_visita).slice(0,10) : 'N/A'}</div>
      <div><strong>Total:</strong><br>${money(v.total)}</div>
      <div><strong>Pago:</strong><br>${v.estado_pago}</div>
      <div><strong>Acceso:</strong><br>${v.estado_acceso}</div>
      <div><strong>Método de pago:</strong><br>${v.metodo_pago || 'N/A'}</div>
      <div><strong>Personas:</strong><br>${v.cantidad_personas ?? 'N/A'}</div>`;
    detalleLista.innerHTML = data.detalles.length
      ? data.detalles.map(d => `<li>${d.nombre} x${d.cantidad} — ${money(d.subtotal)}</li>`).join('')
      : '<li>Sin detalle</li>';
    accesosLista.innerHTML = data.accesos.length
      ? data.accesos.map(a => `<li>${new Date(a.fecha_acceso).toLocaleString('es-MX')} — ${a.resultado} — ${a.dispositivo || 'N/A'}${a.motivo_rechazo ? ` — ${a.motivo_rechazo}` : ''}</li>`).join('')
      : '<li>Sin accesos registrados</li>';
    const accesoUsado = String(v.estado_acceso || '').toLowerCase() === 'usado';
    const cancelada = String(v.estado_pago || '').toLowerCase() === 'cancelado' || String(v.estado_acceso || '').toLowerCase() === 'cancelado';
    btnCancelar.style.display = (accesoUsado || cancelada) ? 'none' : 'inline-block';
    const pagoPendiente = String(v.estado_pago || '').toLowerCase() === 'pendiente';
    btnConfirmarPago.style.display = (!accesoUsado && !cancelada && pagoPendiente) ? 'inline-block' : 'none';
    const pagoPagado = String(v.estado_pago || '').toLowerCase() === 'pagado';
    const accesoPendiente = String(v.estado_acceso || '').toLowerCase() === 'pendiente';
    btnRegistrarEntrada.style.display = (!cancelada && pagoPagado && accesoPendiente) ? 'inline-block' : 'none';
    card.style.display = 'block';
  } catch (error) {
    ventaActual = null;
    card.style.display = 'none';
    setMessage('msgBuscar', '❌ ' + error.message, 'error');
  }
}

async function cargarBI() {
  clearMessage('msgBI');
  const fechaInicio = document.getElementById('fechaInicioBI').value || addDaysISO(todayISO(), -30);
  const fechaFin = document.getElementById('fechaFinBI').value || todayISO();
  if (fechaInicio > fechaFin) { setMessage('msgBI', '❌ La fecha inicial no puede ser mayor que la fecha final.', 'error'); return; }
  try {
    const params = new URLSearchParams();
    params.set('fecha_inicio', fechaInicio);
    params.set('fecha_fin', fechaFin);
    const res = await apiFetch(`${API_BASE}/api/bi-dashboard?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo cargar BI');
    ultimoBI = data;
    const resumen = data.resumen || {};
    document.getElementById('biReservacionesWeb').textContent = resumen.reservaciones_web ?? 0;
    document.getElementById('biVentasTaquilla').textContent = resumen.ventas_taquilla ?? 0;
    document.getElementById('biPendientesPago').textContent = resumen.pendientes_pago ?? 0;
    document.getElementById('biIngresosEstimados').textContent = money(resumen.ingresos_estimados);
    document.getElementById('biIngresosCobrados').textContent = money(resumen.ingresos_cobrados);
    document.getElementById('biConversionPago').textContent = `${resumen.conversion_pago ?? 0}%`;
    document.getElementById('biCategoriaTop').textContent = data.insights?.categoria_top || 'Sin datos';
    document.getElementById('biDiaTop').textContent = data.insights?.dia_top || 'Sin datos';
    document.getElementById('insightCategoria').textContent = data.insights?.mensaje_categoria || 'Sin datos por ahora.';
    document.getElementById('insightDia').textContent = data.insights?.mensaje_dia || 'Sin datos por ahora.';
    document.getElementById('insightPago').textContent = data.insights?.mensaje_pago || 'Sin datos por ahora.';
    document.getElementById('insightPromocion').textContent = data.insights?.mensaje_promocion || 'Sin datos suficientes para sugerir promoción.';
    document.getElementById('insightCanal').textContent = data.insights?.mensaje_canal || 'Sin datos suficientes para recomendar canal.';
    document.getElementById('insightPronostico').textContent = data.insights?.mensaje_pronostico || 'Sin datos suficientes para pronosticar.';
    const categorias = data.categorias || [];
    const estados = data.estados || [];
    const canales = data.canales || [];
    const diasSemana = data.dias_semana || [];
    const diasBajos = data.dias_bajos || [];
    const tendencia = data.tendencia_dias || [];
    const pronostico = data.pronostico_mensual || [];
    chartCategorias = destruirChart(chartCategorias);
    chartEstados = destruirChart(chartEstados);
    chartCanales = destruirChart(chartCanales);
    chartDiasSemana = destruirChart(chartDiasSemana);
    chartTendencia = destruirChart(chartTendencia);
    chartIngresos = destruirChart(chartIngresos);
    chartDiasBajos = destruirChart(chartDiasBajos);
    chartPronostico = destruirChart(chartPronostico);
    chartCategorias = crearGrafica('chartCategorias', 'bar', categorias.map(c => c.nombre), categorias.map(c => c.cantidad), 'Boletos vendidos/reservados');
    chartEstados = crearGrafica('chartEstados', 'doughnut', estados.map(e => e.estado_pago), estados.map(e => e.total), 'Reservaciones por estado');
    chartCanales = crearGrafica('chartCanales', 'doughnut', canales.map(c => c.canal_venta === 'web' ? 'Reservación web' : 'Venta taquilla'), canales.map(c => c.total), 'Canal de venta');
    chartIngresos = crearGraficaMultiple('chartIngresos', 'line', tendencia.map(t => t.fecha_visita), [{ label: 'Ingresos estimados', data: tendencia.map(t => t.ingresos_estimados) }, { label: 'Ingresos cobrados', data: tendencia.map(t => t.ingresos_cobrados) }], { scales: { y: { beginAtZero: true, ticks: { callback: value => '$' + value } } } });
    chartDiasSemana = crearGrafica('chartDiasSemana', 'bar', diasSemana.map(d => d.dia_nombre), diasSemana.map(d => d.personas), 'Visitantes esperados');
    chartDiasBajos = crearGrafica('chartDiasBajos', 'bar', diasBajos.map(d => d.dia_nombre), diasBajos.map(d => d.personas), 'Visitantes en días bajos');
    chartTendencia = crearGrafica('chartTendencia', 'line', tendencia.map(t => t.fecha_visita), tendencia.map(t => t.personas), 'Visitantes reales', { tension: 0.35 });
    chartPronostico = crearGrafica('chartPronostico', 'bar', pronostico.map(p => p.mes_nombre), pronostico.map(p => p.visitantes_estimados), 'Visitantes estimados');
    if (!categorias.length && !tendencia.length) {
      setMessage('msgBI', '⚠️ No hay datos suficientes para graficar en este periodo.', 'error');
    } else {
      setMessage('msgBI', '✅ BI actualizado correctamente.', 'ok');
    }
  } catch (error) {
    setMessage('msgBI', '❌ ' + error.message, 'error');
  }
}

function descargarGraficaCanvas(canvasId, nombreArchivo) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const enlace = document.createElement('a');
  enlace.href = canvas.toDataURL('image/png', 1.0);
  enlace.download = nombreArchivo;
  enlace.click();
}

function descargarGraficasBI() {
  const inicio = document.getElementById('fechaInicioBI').value || 'inicio';
  const fin = document.getElementById('fechaFinBI').value || 'fin';
  const sufijo = nombreArchivoSeguro(`${inicio}_${fin}`);
  const graficas = [
    ['chartCategorias', `bi-categorias-${sufijo}.png`], ['chartEstados', `bi-estados-pago-${sufijo}.png`],
    ['chartCanales', `bi-canales-${sufijo}.png`], ['chartIngresos', `bi-ingresos-${sufijo}.png`],
    ['chartDiasSemana', `bi-dias-demanda-${sufijo}.png`], ['chartDiasBajos', `bi-dias-bajos-${sufijo}.png`],
    ['chartTendencia', `bi-tendencia-${sufijo}.png`], ['chartPronostico', `bi-pronostico-${sufijo}.png`]
  ];
  graficas.forEach(([id, nombre], index) => { setTimeout(() => descargarGraficaCanvas(id, nombre), index * 250); });
}

function imprimirReporteBI() { window.print(); }

function exportarBICSV() {
  if (!ultimoBI) { setMessage('msgBI', '❌ Primero actualiza el BI.', 'error'); return; }
  const tendencia = ultimoBI.tendencia_dias || [];
  const pronostico = ultimoBI.pronostico_mensual || [];
  const filas = [
    ...tendencia.map(t => ({ tipo: 'real', fecha_o_mes: t.fecha_visita, personas: t.personas, ingresos_estimados: t.ingresos_estimados, ingresos_cobrados: t.ingresos_cobrados })),
    ...pronostico.map(p => ({ tipo: 'pronostico', fecha_o_mes: p.mes_nombre, personas: p.visitantes_estimados, ingresos_estimados: '', ingresos_cobrados: '', motivo: p.motivo }))
  ];
  if (!filas.length) { setMessage('msgBI', '⚠️ No hay datos para exportar.', 'error'); return; }
  const inicio = document.getElementById('fechaInicioBI').value || 'inicio';
  const fin = document.getElementById('fechaFinBI').value || 'fin';
  descargarCSV(`bi-reporte-${inicio}-${fin}.csv`, filas);
}

let ultimoCorte = null;

function formatearCanalCorte(canal) {
  const valor = String(canal || '').toLowerCase();
  if (valor === 'web') return '<span class="corte-canal web">🌐 Web</span>';
  if (valor === 'taquilla') return '<span class="corte-canal taquilla">💵 Taquilla</span>';
  return `<span class="corte-canal">${canal || 'N/A'}</span>`;
}

function renderCorteDetalle(detalle = []) {
  const tbody = document.getElementById('tbodyCorteDetalle');
  const totalDetalle = document.getElementById('corteTotalDetalle');
  if (!tbody) return;
  if (!detalle.length) {
    tbody.innerHTML = '<tr><td colspan="8">No hay ventas pagadas en esta fecha.</td></tr>';
    if (totalDetalle) totalDetalle.textContent = money(0);
    return;
  }
  tbody.innerHTML = detalle.map(v => `<tr>
    <td>${v.hora || '-'}</td><td><strong>${v.folio || 'N/A'}</strong></td>
    <td><strong>${v.nombre_cliente || 'Cliente sin nombre'}</strong><br><small>${v.email || ''}</small></td>
    <td>${formatearCanalCorte(v.canal_venta)}</td><td>${v.cantidad_personas || 0}</td>
    <td class="corte-detalle-boletos">${v.detalle_boletos || 'Sin detalle'}</td>
    <td><strong>${money(v.total)}</strong></td><td>${badgeEstado(v.estado_pago || 'pagado')}</td>
  </tr>`).join('');
  const total = detalle.reduce((acc, v) => acc + Number(v.total || 0), 0);
  if (totalDetalle) totalDetalle.textContent = money(total);
}

async function cargarCorte() {
  clearMessage('msgCorte');
  const fecha = document.getElementById('fechaCorte')?.value || todayISO();
  try {
    const res = await apiFetch(`${API_BASE}/api/corte-basico?fecha=${encodeURIComponent(fecha)}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo cargar el corte');
    ultimoCorte = data;
    document.getElementById('corteFechaLabel').textContent = `Fecha: ${data.fecha}`;
    document.getElementById('corteOperaciones').textContent = data.total_operaciones || 0;
    document.getElementById('corteMonto').textContent = money(data.monto_total);
    document.getElementById('corteEfectivo').textContent = money(data.total_efectivo);
    document.getElementById('cortePersonas').textContent = data.total_personas || 0;
    document.getElementById('corteVentasWeb').textContent = data.ventas_web || 0;
    document.getElementById('corteVentasTaquilla').textContent = data.ventas_taquilla || 0;
    document.getElementById('corteAceptados').textContent = data.accesos_aceptados || 0;
    document.getElementById('corteRechazados').textContent = data.accesos_rechazados || 0;
    renderCorteDetalle(data.detalle || []);
    setMessage('msgCorte', '✅ Corte cargado correctamente.', 'ok');
  } catch (error) {
    setMessage('msgCorte', '❌ ' + error.message, 'error');
  }
}

function exportarCorteCSV() {
  if (!ultimoCorte) { setMessage('msgCorte', '❌ Primero consulta un corte.', 'error'); return; }
  const rows = [['Fecha','Hora','Folio','Cliente','Email','Canal','Personas','Detalle de boletos','Total','Estado de pago']];
  (ultimoCorte.detalle || []).forEach(v => {
    rows.push([ultimoCorte.fecha, v.hora||'', v.folio||'', v.nombre_cliente||'', v.email||'', v.canal_venta||'', v.cantidad_personas||0, v.detalle_boletos||'', Number(v.total||0).toFixed(2), v.estado_pago||'']);
  });
  rows.push([]);
  rows.push(['','','','','','','','TOTAL', Number(ultimoCorte.monto_total||0).toFixed(2), '']);
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `corte_${ultimoCorte.fecha}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function imprimirCortePDF() {
  if (!ultimoCorte) { setMessage('msgCorte', '❌ Primero consulta un corte.', 'error'); return; }
  const detalleHTML = (ultimoCorte.detalle || []).map(v => `<tr><td>${v.hora||'-'}</td><td>${v.folio||'N/A'}</td><td>${v.nombre_cliente||'Cliente sin nombre'}</td><td>${v.canal_venta||'N/A'}</td><td>${v.cantidad_personas||0}</td><td>${v.detalle_boletos||'Sin detalle'}</td><td>$${Number(v.total||0).toFixed(2)}</td></tr>`).join('');
  const ventana = window.open('', '_blank', 'width=1000,height=800');
  ventana.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Corte de caja ${ultimoCorte.fecha}</title>
<style>body{font-family:Arial,sans-serif;margin:0;padding:28px;color:#1f2937;background:#fff;}.header{border-bottom:4px solid #bc6c25;padding-bottom:14px;margin-bottom:20px;}.header h1{margin:0;color:#1b4332;font-size:26px;}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0;}.box{border:1px solid #d4a373;border-radius:12px;padding:12px;background:#fefae0;}.box small{display:block;color:#555;margin-bottom:6px;}.box strong{color:#bc6c25;font-size:20px;}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:12px;}th{background:#283618;color:white;padding:9px;text-align:left;}td{border-bottom:1px solid #ddd;padding:8px;vertical-align:top;}.total{margin-top:20px;text-align:right;font-size:22px;color:#bc6c25;font-weight:900;}.footer{margin-top:30px;font-size:12px;color:#666;border-top:1px solid #ddd;padding-top:12px;}</style>
</head><body>
<div class="header"><h1>💰 Corte de caja - Zoológico El Sabinal</h1><p><strong>Fecha:</strong> ${ultimoCorte.fecha}</p><p>Reporte de ventas pagadas y accesos registrados.</p></div>
<div class="summary">
<div class="box"><small>Total operaciones</small><strong>${ultimoCorte.total_operaciones||0}</strong></div>
<div class="box"><small>Monto total</small><strong>${money(ultimoCorte.monto_total)}</strong></div>
<div class="box"><small>Ventas web cobradas</small><strong>${ultimoCorte.ventas_web||0}</strong></div>
<div class="box"><small>Ventas taquilla</small><strong>${ultimoCorte.ventas_taquilla||0}</strong></div>
</div>
<table><thead><tr><th>Hora</th><th>Folio</th><th>Cliente</th><th>Canal</th><th>Personas</th><th>Detalle</th><th>Total</th></tr></thead>
<tbody>${detalleHTML||'<tr><td colspan="7">Sin ventas registradas.</td></tr>'}</tbody></table>
<div class="total">Total del corte: ${money(ultimoCorte.monto_total)}</div>
<div class="footer">Reporte generado desde el Panel de control del Zoológico El Sabinal.</div>
<script>window.onload=function(){window.print();}<\/script></body></html>`);
  ventana.document.close();
}

async function exportarVentasCSV() {
  try {
    const fecha = document.getElementById('fechaVentas').value;
    const estadoAcceso = document.getElementById('estadoAccesoVentas').value;
    const params = new URLSearchParams();
    if (fecha) params.set('fecha', fecha);
    if (estadoAcceso) params.set('estado_acceso', estadoAcceso);
    params.set('limit', '500');
    const res = await apiFetch(`${API_BASE}/api/historial-ventas?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo exportar ventas');
    const filas = data.ventas.map(v => ({ folio: v.folio, cliente: v.nombre_cliente||'', email: v.email||'', telefono: v.telefono||'', fecha_visita: v.fecha_visita ? String(v.fecha_visita).slice(0,10) : '', cantidad_personas: v.cantidad_personas??'', total: v.total??'', estado_pago: v.estado_pago||'', estado_acceso: v.estado_acceso||'', canal_venta: v.canal_venta||'', escaneos: v.total_escaneos??0 }));
    descargarCSV(`ventas_${fecha||'todas'}.csv`, filas);
  } catch (error) {
    setMessage('msgVentas', '❌ ' + error.message, 'error');
  }
}

async function exportarAccesosCSV() {
  try {
    const fecha = document.getElementById('fechaAccesos').value;
    const resultado = document.getElementById('resultadoAcceso').value;
    const params = new URLSearchParams();
    if (fecha) params.set('fecha', fecha);
    if (resultado) params.set('resultado', resultado);
    params.set('limit', '500');
    const res = await apiFetch(`${API_BASE}/api/historial-accesos?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo exportar accesos');
    const filas = data.accesos.map(a => ({ fecha_acceso: new Date(a.fecha_acceso).toLocaleString('es-MX'), folio: a.folio||'', cliente: a.nombre_cliente||'', email: a.email||'', resultado: a.resultado||'', dispositivo: a.dispositivo||'', motivo_rechazo: a.motivo_rechazo||'' }));
    descargarCSV(`accesos_${fecha||'todos'}.csv`, filas);
  } catch (error) {
    setMessage('msgAccesos', '❌ ' + error.message, 'error');
  }
}

async function exportarCorteCSV() {
  try {
    const fecha = document.getElementById('fechaCorte').value || todayISO();
    const params = new URLSearchParams();
    params.set('fecha', fecha);
    const res = await apiFetch(`${API_BASE}/api/corte-basico?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo exportar el corte');
    const filas = [{ fecha: data.fecha||fecha, total_operaciones: data.total_operaciones??0, monto_total: data.monto_total??0, total_efectivo: data.total_efectivo??0, accesos_aceptados: data.accesos_aceptados??0, accesos_rechazados: data.accesos_rechazados??0 }];
    descargarCSV(`corte_${fecha}.csv`, filas);
  } catch (error) {
    setMessage('msgCorte', '❌ ' + error.message, 'error');
  }
}

function limpiarBusqueda() {
  ventaActual = null;
  document.getElementById('folioBuscar').value = '';
  document.getElementById('detalleVenta').style.display = 'none';
  clearMessage('msgBuscar');
}

function escapeHTMLFront(valor) {
  return String(valor ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function actualizarPreviewAnimal() {
  const img = document.getElementById('animalPreviewImg');
  const url = document.getElementById('animalImagen')?.value.trim();
  if (!img) return;
  if (!url) { img.src = ''; img.style.display = 'none'; return; }
  img.src = url;
  img.style.display = 'block';
}

async function cargarAnimalesAdmin() {
  const lista = document.getElementById('listaAnimalesAdmin');
  if (!lista) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/animales-admin`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudieron cargar animales');
    animalesCache = data.animales || [];
    if (!animalesCache.length) { lista.innerHTML = '<div class="tiny-note">Aún no hay animales registrados.</div>'; return; }
    lista.innerHTML = animalesCache.map(a => `
      <div class="animal-admin-card ${Number(a.activo) === 1 ? 'activo' : 'inactivo'}">
        <img src="${escapeHTMLFront(a.imagen_url)}" alt="${escapeHTMLFront(a.nombre)}">
        <div class="animal-admin-info">
          <h4>${escapeHTMLFront(a.nombre)}</h4>
          <p><strong>Especie:</strong> ${escapeHTMLFront(a.especie||'No especificada')}</p>
          <p><strong>Hábitat:</strong> ${escapeHTMLFront(a.habitat||'No especificado')}</p>
          <p><strong>Alimentación:</strong> ${escapeHTMLFront(a.alimentacion||'No especificada')}</p>
          <p>${escapeHTMLFront(a.descripcion||'')}</p>
          <span class="animal-status ${Number(a.activo) === 1 ? 'ok' : 'off'}">${Number(a.activo) === 1 ? 'Visible en página pública' : 'Oculto'}</span>
        </div>
        <div class="animal-admin-actions">
          <button class="btn btn-outline btn-sm" onclick="editarAnimal(${a.id})">✏️ Modificar</button>
          <button class="btn ${Number(a.activo) === 1 ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="toggleAnimal(${a.id})">${Number(a.activo) === 1 ? 'Ocultar' : 'Mostrar'}</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarAnimal(${a.id})">🗑️ Eliminar</button>
        </div>
      </div>`).join('');
  } catch (error) {
    lista.innerHTML = 'Error cargando animales.';
    setMessage('msgAnimales', '❌ ' + error.message, 'error');
  }
}

function limpiarFormularioAnimal() {
  animalEditandoId = null;
  const editId = document.getElementById('animalEditId');
  if (editId) editId.value = '';
  document.getElementById('animalNombre').value = '';
  document.getElementById('animalEspecie').value = '';
  document.getElementById('animalHabitat').value = '';
  document.getElementById('animalAlimentacion').value = '';
  document.getElementById('animalImagen').value = '';
  document.getElementById('animalOrden').value = '0';
  document.getElementById('animalDescripcion').value = '';
  const title = document.getElementById('animalFormTitle');
  if (title) title.textContent = 'Nuevo animal';
  const btn = document.getElementById('btnGuardarAnimal');
  if (btn) btn.textContent = 'Guardar animal';
  actualizarPreviewAnimal();
  clearMessage('msgAnimales');
}

function editarAnimal(id) {
  const animal = animalesCache.find(a => Number(a.id) === Number(id));
  if (!animal) { setMessage('msgAnimales', '❌ No se encontró el animal.', 'error'); return; }
  animalEditandoId = Number(id);
  document.getElementById('animalEditId').value = String(id);
  document.getElementById('animalNombre').value = animal.nombre || '';
  document.getElementById('animalEspecie').value = animal.especie || '';
  document.getElementById('animalHabitat').value = animal.habitat || '';
  document.getElementById('animalAlimentacion').value = animal.alimentacion || '';
  document.getElementById('animalImagen').value = animal.imagen_url || '';
  document.getElementById('animalOrden').value = animal.orden || 0;
  document.getElementById('animalDescripcion').value = animal.descripcion || '';
  const title = document.getElementById('animalFormTitle');
  if (title) title.textContent = 'Modificar animal';
  const btn = document.getElementById('btnGuardarAnimal');
  if (btn) btn.textContent = 'Actualizar animal';
  actualizarPreviewAnimal();
  setMessage('msgAnimales', '✏️ Editando animal. Modifica los datos y guarda.', 'ok');
  const panel = document.getElementById('panel-animales');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function guardarAnimal() {
  clearMessage('msgAnimales');
  const editId = document.getElementById('animalEditId')?.value || '';
  const idEditar = animalEditandoId || (editId ? Number(editId) : null);
  const nombre = document.getElementById('animalNombre').value.trim();
  const especie = document.getElementById('animalEspecie').value.trim();
  const habitat = document.getElementById('animalHabitat').value.trim();
  const alimentacion = document.getElementById('animalAlimentacion').value.trim();
  const imagen_url = document.getElementById('animalImagen').value.trim();
  const orden = Number(document.getElementById('animalOrden').value || 0);
  const descripcion = document.getElementById('animalDescripcion').value.trim();
  if (!nombre || !descripcion || !imagen_url) { setMessage('msgAnimales', '❌ Completa nombre, descripción e imagen.', 'error'); return; }
  try {
    const url = idEditar ? `${API_BASE}/api/animales-admin/${idEditar}` : `${API_BASE}/api/animales-admin`;
    const method = idEditar ? 'PUT' : 'POST';
    const res = await apiFetch(url, {
      method,
      body: JSON.stringify({ nombre, especie, descripcion, imagen_url, habitat, alimentacion, orden, activo: 1 })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo guardar el animal');
    setMessage('msgAnimales', idEditar ? '✅ Animal actualizado correctamente.' : '✅ Animal agregado correctamente.', 'ok');
    limpiarFormularioAnimal();
    await cargarAnimalesAdmin();
  } catch (error) {
    setMessage('msgAnimales', '❌ ' + error.message, 'error');
  }
}

async function toggleAnimal(id) {
  try {
    const res = await apiFetch(`${API_BASE}/api/animales-admin/${id}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo cambiar el estado');
    await cargarAnimalesAdmin();
  } catch (error) {
    setMessage('msgAnimales', '❌ ' + error.message, 'error');
  }
}

async function eliminarAnimal(id) {
  const animal = animalesCache.find(a => Number(a.id) === Number(id));
  const nombre = animal ? animal.nombre : 'este animal';
  const confirmado = confirm(`¿Seguro que deseas eliminar "${nombre}"?`);
  if (!confirmado) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/animales-admin/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo eliminar el animal');
    setMessage('msgAnimales', '✅ Animal eliminado correctamente.', 'ok');
    if (Number(id) === Number(animalEditandoId)) limpiarFormularioAnimal();
    await cargarAnimalesAdmin();
  } catch (error) {
    setMessage('msgAnimales', '❌ ' + error.message, 'error');
  }
}

async function verificarSesionPanel() {
  try {
    const res = await fetch(`${API_BASE}/api/panel-me`, { credentials: 'include' });
    if (!res.ok) {
      window.location.href = `${PANEL_LOGIN_URL}?next=${encodeURIComponent(window.location.href)}`;
      return false;
    }
    const data = await res.json();
    if (!data.success) {
      window.location.href = `${PANEL_LOGIN_URL}?next=${encodeURIComponent(window.location.href)}`;
      return false;
    }
    mostrarUsuarioPanel(data.user?.username || 'admin');
    return true;
  } catch (error) {
    window.location.href = `${PANEL_LOGIN_URL}?next=${encodeURIComponent(window.location.href)}`;
    return false;
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
document.querySelectorAll('.menu-btn').forEach(btn => {
  btn.addEventListener('click', () => { cambiarPanel(btn.dataset.panel); });
});

document.getElementById('btnTkHoy').addEventListener('click', () => { document.getElementById('tkFecha').value = todayISO(); });
document.getElementById('btnTkLimpiar').addEventListener('click', limpiarTaquilla);
document.getElementById('btnTkVender').addEventListener('click', venderEnTaquilla);
document.getElementById('btnTkDescargarQR').addEventListener('click', descargarQRTaquilla);
document.getElementById('btnTkImprimir').addEventListener('click', imprimirVentaTaquilla);
document.getElementById('btnTkVerDetalle').addEventListener('click', verDetalleTaquilla);
document.getElementById('btnVentas').addEventListener('click', cargarVentas);
document.getElementById('btnVentasHoy').addEventListener('click', () => { document.getElementById('fechaVentas').value = todayISO(); cargarVentas(); });
document.getElementById('btnExportarVentas').addEventListener('click', exportarVentasCSV);
document.getElementById('btnAccesos').addEventListener('click', cargarAccesos);
document.getElementById('btnAccesosHoy').addEventListener('click', () => { document.getElementById('fechaAccesos').value = todayISO(); cargarAccesos(); });
document.getElementById('btnExportarAccesos').addEventListener('click', exportarAccesosCSV);
document.getElementById('btnBuscarFolio').addEventListener('click', buscarFolio);
document.getElementById('btnLimpiarBusqueda').addEventListener('click', limpiarBusqueda);
document.getElementById('btnCorte')?.addEventListener('click', cargarCorte);
document.getElementById('btnCorteHoy')?.addEventListener('click', () => { document.getElementById('fechaCorte').value = todayISO(); cargarCorte(); });
document.getElementById('btnExportarCorte')?.addEventListener('click', exportarCorteCSV);
document.getElementById('btnImprimirCorte')?.addEventListener('click', imprimirCortePDF);
document.getElementById('btnBI').addEventListener('click', cargarBI);
document.getElementById('btnBIHoy').addEventListener('click', () => { const hoy = todayISO(); document.getElementById('fechaInicioBI').value = hoy; document.getElementById('fechaFinBI').value = hoy; cargarBI(); });
document.getElementById('btnBIMes').addEventListener('click', () => { document.getElementById('fechaInicioBI').value = firstDayOfCurrentMonthISO(); document.getElementById('fechaFinBI').value = todayISO(); cargarBI(); });
document.getElementById('btnBI30').addEventListener('click', () => { const hoy = todayISO(); document.getElementById('fechaInicioBI').value = addDaysISO(hoy, -30); document.getElementById('fechaFinBI').value = hoy; cargarBI(); });
document.getElementById('btnBIDescargarGraficas').addEventListener('click', descargarGraficasBI);
document.getElementById('btnBIImprimir').addEventListener('click', imprimirReporteBI);
document.getElementById('btnExportarBICSV').addEventListener('click', exportarBICSV);
document.getElementById('folioBuscar').addEventListener('keydown', e => { if (e.key === 'Enter') buscarFolio(); });
document.getElementById('btnDescargarQRDetalle').addEventListener('click', descargarQRDetalle);
document.getElementById('btnReimprimirDetalle').addEventListener('click', reimprimirDetalle);
document.getElementById('btnConfirmarPago').addEventListener('click', confirmarPagoActual);
document.getElementById('btnCancelarVenta').addEventListener('click', cancelarVentaActual);
document.getElementById('btnGuardarPromo')?.addEventListener('click', guardarPromocion);
document.getElementById('btnLimpiarPromo')?.addEventListener('click', limpiarFormularioPromo);
document.getElementById('btnRegistrarEntrada').addEventListener('click', registrarEntradaManualActual);
document.getElementById('btnGuardarAnimal')?.addEventListener('click', guardarAnimal);
document.getElementById('btnLimpiarAnimal')?.addEventListener('click', limpiarFormularioAnimal);
document.getElementById('animalImagen')?.addEventListener('input', actualizarPreviewAnimal);

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  const ok = await verificarSesionPanel();
  if (!ok) return;

  const hoy = todayISO();
  document.getElementById('fechaVentas').value = hoy;
  document.getElementById('fechaAccesos').value = hoy;
  if (document.getElementById('fechaCorte')) document.getElementById('fechaCorte').value = hoy;
  document.getElementById('fechaInicioBI').value = addDaysISO(hoy, -30);
  document.getElementById('fechaFinBI').value = hoy;
  document.getElementById('tkFecha').value = hoy;

  await cargarCategoriasTaquilla();
  cargarCategoriasPromos();
  limpiarFormularioPromo();
  await cargarPromociones();
  limpiarFormularioAnimal();
  await cargarAnimalesAdmin();
  await cargarDashboard();
  await cargarVentas();
  await cargarAccesos();
  await cargarCorte();
  await cargarBI();

  setInterval(async () => {
    const sigueOk = await verificarSesionPanel();
    if (!sigueOk) return;
    cargarDashboard();
    if (document.getElementById('panel-ventas').classList.contains('active')) cargarVentas();
    if (document.getElementById('panel-accesos').classList.contains('active')) cargarAccesos();
    if (document.getElementById('panel-corte').classList.contains('active')) cargarCorte();
    if (document.getElementById('panel-bi').classList.contains('active')) cargarBI();
  }, 30000);
});