
     const API_BASE = 'https://zoologico-trinitaria-production.up.railway.app';

        let categorias = [];
        let promocionesWeb = [];

        function money(valor) {
            return '$' + Number(valor || 0).toFixed(2) + ' MXN';
        }

        function formatearMetodoPago(valor) {
            const mapa = {
                pago_en_linea: 'Pago en línea',
                efectivo: 'Efectivo',
                tarjeta: 'Tarjeta',
                transferencia: 'Transferencia',
                cortesia: 'Cortesía'
            };
            return mapa[valor] || valor || 'N/A';
        }

       const mensajeTimers = {};

function mostrarMensaje(texto, tipo = 'ok') {
    const mensaje = document.getElementById('mensaje');
    if (!mensaje) return;

    clearTimeout(mensajeTimers.mensaje);

    mensaje.className = `mensaje ${tipo}`;
    mensaje.textContent = texto;

    mensajeTimers.mensaje = setTimeout(() => {
        ocultarMensaje();
    }, 4200);
}

function ocultarMensaje() {
    const mensaje = document.getElementById('mensaje');
    if (!mensaje) return;

    mensaje.className = 'mensaje';
    mensaje.textContent = '';
}

function mostrarMensajeConsulta(texto, tipo = 'ok') {
    const mensaje = document.getElementById('mensaje-consulta');
    if (!mensaje) return;

    clearTimeout(mensajeTimers.consulta);

    mensaje.className = `mensaje ${tipo}`;
    mensaje.textContent = texto;

    mensajeTimers.consulta = setTimeout(() => {
        ocultarMensajeConsulta();
    }, 4200);
}

function ocultarMensajeConsulta() {
    const mensaje = document.getElementById('mensaje-consulta');
    if (!mensaje) return;

    mensaje.className = 'mensaje';
    mensaje.textContent = '';
}

        function getCategoriaById(id) {
            return categorias.find(c => Number(c.id) === Number(id)) || null;
        }

        function construirOpcionesCategorias() {
            return categorias.map(cat => `
                <option value="${cat.id}" data-precio="${cat.precio}">
                    ${cat.nombre} - ${money(cat.precio)}
                </option>
            `).join('');
        }
        function descripcionCategoriaPublica(cat) {
    const clave = String(cat.clave || '').toUpperCase();
    const nombre = String(cat.nombre || '').toLowerCase();

    if (clave === 'INF' || nombre.includes('infantil')) {
        return {
            descripcion: 'Niñas y niños de 5 a 12 años',
            rango: '5 a 12 años'
        };
    }

    if (clave === 'ADU' || nombre.includes('adulto') && !nombre.includes('mayor')) {
        return {
            descripcion: 'Personas de 13 a 59 años',
            rango: '13 a 59 años'
        };
    }

    if (clave === 'AMY' || nombre.includes('mayor')) {
        return {
            descripcion: 'Personas de 60 años en adelante',
            rango: '60 años o más'
        };
    }

    if (clave === 'EST' || nombre.includes('estudiante')) {
        return {
            descripcion: 'Aplica presentando credencial de estudiante vigente',
            rango: 'Credencial vigente'
        };
    }

    return {
        descripcion: cat.descripcion || '',
        rango: ''
    };
}

        function renderTarifas() {
    const contenedor = document.getElementById('tarjetas-precios');
    if (!contenedor) return;

    const tarjetaGratis = `
        <div class="precio-card info-free">
            <h3>Menores de 5 años</h3>
            <div class="precio">$0.00 <small>MXN</small></div>
            <p class="precio-desc">Entran gratis y no requieren boleto.</p>
            <span class="precio-rango">0 a 4 años</span>
        </div>
    `;

    const tarjetas = categorias.map(cat => {
        const info = descripcionCategoriaPublica(cat);

        return `
            <div class="precio-card">
                <h3>${cat.nombre}</h3>
                <div class="precio">$${Number(cat.precio).toFixed(2)} <small>MXN</small></div>
                <p class="precio-desc">${info.descripcion}</p>
                ${info.rango ? `<span class="precio-rango">${info.rango}</span>` : ''}
            </div>
        `;
    }).join('');

    contenedor.innerHTML = tarjetaGratis + tarjetas;
}

        function crearBoletoHTML() {
    return `
        <div class="boleto-item">
            <select class="categoria" onchange="calcularTotales()">
                ${construirOpcionesCategorias()}
            </select>

            <input 
                type="number" 
                class="cantidad" 
                value="1" 
                min="1" 
                max="100"
                oninput="calcularTotales()"
                onchange="calcularTotales()"
            >

            <span class="subtotal">$0.00</span>

            <button type="button" class="btn-eliminar" onclick="eliminarBoleto(this)">✕</button>
        </div>
    `;
}

        function agregarBoleto() {
            if (!categorias.length) return;

            const container = document.getElementById('boletos-container');
            const wrapper = document.createElement('div');
            wrapper.innerHTML = crearBoletoHTML();
            container.appendChild(wrapper.firstElementChild);
            calcularTotales();
        }

        function eliminarBoleto(btn) {
            const items = document.querySelectorAll('.boleto-item');
            if (items.length <= 1) {
                mostrarMensaje('Debes tener al menos un renglón de boletos.', 'error');
                return;
            }

            btn.parentElement.remove();
            calcularTotales();
        }
        function nombreDiaPromoPublica(valor) {
    const mapa = {
        1: 'domingo',
        2: 'lunes',
        3: 'martes',
        4: 'miércoles',
        5: 'jueves',
        6: 'viernes',
        7: 'sábado'
    };

    return mapa[Number(valor)] || 'todos los días';
}

async function cargarPromocionesWeb() {
    const fecha = document.getElementById('fecha_visita')?.value || new Date().toISOString().split('T')[0];

    try {
        const response = await fetch(`${API_BASE}/api/promociones-publicas?fecha=${encodeURIComponent(fecha)}`);
        const data = await response.json();

        promocionesWeb = data.success ? (data.promociones || []) : [];
        renderPromoWeb();
        calcularTotales();
    } catch {
        promocionesWeb = [];
        renderPromoWeb();
    }
}

function renderPromoWeb() {
    const box = document.getElementById('promo-web-box');
    if (!box) return;

    if (!promocionesWeb.length) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
    }

    const promo = promocionesWeb[0];

    box.style.display = 'block';
    box.innerHTML = `
        <strong>🎉 Promoción activa: ${promo.nombre}</strong>
        <span>${promo.descripcion || '2x1 disponible solo en reservaciones web.'}</span>
        <small>
            Aplica ${promo.dia_semana ? 'los ' + nombreDiaPromoPublica(promo.dia_semana) : 'todos los días'}.
            ${promo.categoria_nombre ? 'Categoría: ' + promo.categoria_nombre + '.' : 'Aplica a todas las categorías.'}
        </small>
    `;
}

function obtenerPromoActivaParaCategoria(categoriaId) {
    if (!promocionesWeb.length) return null;

    const promo = promocionesWeb[0];

    if (!promo.categoria_id) return promo;

    return Number(promo.categoria_id) === Number(categoriaId) ? promo : null;
}

  function calcularTotales() {
    let subtotalGeneral = 0;
    let descuentoGeneral = 0;

    const promo = promocionesWeb && promocionesWeb.length ? promocionesWeb[0] : null;

    document.querySelectorAll('.boleto-item').forEach(item => {
        const categoriaId = Number(item.querySelector('.categoria').value);
        const inputCantidad = item.querySelector('.cantidad');

        let cantidad = Number(inputCantidad.value);

        if (!Number.isFinite(cantidad) || cantidad < 0) {
            cantidad = 0;
        }

        if (cantidad > 100) {
            cantidad = 100;
            inputCantidad.value = 100;
        }

        const categoria = getCategoriaById(categoriaId);
        const precio = categoria ? Number(categoria.precio) : 0;

        const subtotalLinea = precio * cantidad;

        let descuentoLinea = 0;

        if (promo && promo.tipo === '2x1') {
            const promoCategoria = promo.categoria_id ? Number(promo.categoria_id) : null;
            const aplicaCategoria = !promoCategoria || promoCategoria === categoriaId;

            if (aplicaCategoria) {
                const boletosGratis = Math.floor(cantidad / 2);
                descuentoLinea = boletosGratis * precio;
            }
        }

        const totalLinea = Math.max(0, subtotalLinea - descuentoLinea);

        item.querySelector('.subtotal').textContent = '$' + totalLinea.toFixed(2);

        subtotalGeneral += subtotalLinea;
        descuentoGeneral += descuentoLinea;
    });

    const totalFinal = Math.max(0, subtotalGeneral - descuentoGeneral);

    const totalBox = document.getElementById('total');
    if (totalBox) {
        totalBox.innerHTML = `
            <div>
                <span>Subtotal estimado</span>
                <strong>$${subtotalGeneral.toFixed(2)} MXN</strong>
            </div>
            <div>
                <span>Descuento web</span>
                <strong>-$${descuentoGeneral.toFixed(2)} MXN</strong>
            </div>
            <div class="total-final">
                <span>Total final</span>
                <strong>$${totalFinal.toFixed(2)} MXN</strong>
            </div>
        `;
    }

    return totalFinal;
}

        function obtenerDetallesCompra() {
            const detalles = [];

            document.querySelectorAll('.boleto-item').forEach(item => {
                const categoriaId = Number(item.querySelector('.categoria').value);
                const cantidad = Number(item.querySelector('.cantidad').value) || 0;

                if (cantidad > 0) {
                    detalles.push({
                        categoria_id: categoriaId,
                        cantidad: cantidad
                    });
                }
            });

            return detalles;
        }

        function imprimirSoloQR() {
            window.print();
        }

        function claseEstadoAcceso(estado) {
            const v = String(estado || '').toLowerCase();
            if (v === 'usado') return 'estado-pill estado-ok';
            if (v === 'pendiente') return 'estado-pill estado-warn';
            return 'estado-pill estado-bad';
        }

       function renderResultadoCompra(data) {
    const qrContainer = document.getElementById('qr-code');
    const resumen = document.getElementById('resumen-compra');
    const qrSection = document.getElementById('qr-generado');
    const btnDescargar = document.getElementById('btn-descargar');

    const venta = data.venta || {};
    const subtotalSinDescuento = Number(venta.subtotal_sin_descuento ?? venta.total ?? 0);
    const descuentoTotal = Number(venta.descuento_total ?? 0);
    const totalFinal = Number(venta.total ?? 0);

    qrContainer.innerHTML = `
        <img src="${venta.qr_url}" alt="Código QR del boleto">
    `;

    const detalleHTML = (data.detalles || []).map(d => `
        <li>${d.nombre} x${d.cantidad} — ${money(d.subtotal)}</li>
    `).join('');

    const promoHTML = venta.promocion_aplicada ? `
        <div class="promo-ticket">
            🎉 <strong>Promoción aplicada:</strong> ${venta.promocion_aplicada.nombre}<br>
            <small>${venta.promocion_aplicada.descripcion || 'Promoción web aplicada al total.'}</small>
        </div>
    ` : '';

    resumen.innerHTML = `
        <h2 style="margin:0 0 10px;color:#283618;">🦁 Comprobante de reservación</h2>

        ${promoHTML}

        <p><strong>Folio:</strong> ${venta.folio}</p>
        <p><strong>Correo:</strong> ${venta.email || 'N/A'}</p>
        <p><strong>Fecha de visita:</strong> ${venta.fecha_visita}</p>
        <p><strong>Total de personas:</strong> ${venta.cantidad_personas}</p>

        <hr style="border:none;border-top:1px solid #d4a373;margin:14px 0;">

        <p><strong>Subtotal:</strong> ${money(subtotalSinDescuento)}</p>
        <p><strong>Descuento:</strong> -${money(descuentoTotal)}</p>
        <p style="font-size:1.25rem;color:#bc6c25;">
            <strong>Total final a pagar en taquilla:</strong> ${money(totalFinal)}
        </p>

        <p><strong>Estado del pago:</strong> Pendiente de pago en taquilla</p>
        <p><strong>Correo enviado:</strong> ${venta.correo_enviado ? 'Sí ✅' : 'No ⚠️'}</p>
        <p><strong>Indicaciones:</strong> 📱 Presenta este QR en taquilla para confirmar tu pago.</p>

        <p><strong>Detalle:</strong></p>
        <ul>${detalleHTML || '<li>Sin detalle</li>'}</ul>
    `;

    btnDescargar.href = venta.qr_url;
    btnDescargar.setAttribute('download', `${venta.folio}.png`);

    qrSection.style.display = 'flex';
    qrSection.classList.add('show');
}

        function imprimirConsulta() {
            const resultado = document.getElementById('consulta-resultado');
            if (!resultado.classList.contains('show')) {
                mostrarMensajeConsulta('❌ Primero consulta un boleto.', 'error');
                return;
            }

            const popup = window.open('', '_blank', 'width=900,height=700');
            popup.document.write(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <title>Consulta de boleto</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 24px; color: #222; }
                        .wrap { max-width: 720px; margin: auto; border: 2px solid #d4a373; border-radius: 18px; padding: 24px; }
                        h1 { margin-top: 0; color: #1b4332; }
                        .box { background: #f8f9fa; padding: 14px; border-radius: 12px; margin: 10px 0; }
                        .qr { text-align: center; margin: 20px 0; }
                        .qr img { max-width: 220px; border: 1px solid #ccc; padding: 10px; border-radius: 12px; }
                        ul { margin: 0; padding-left: 20px; }
                    </style>
                </head>
                <body>
                    <div class="wrap">
                        ${document.getElementById('consulta-resultado').innerHTML}
                    </div>
                    <script>
                        window.onload = function() { window.print(); }
                    <\/script>
                </body>
                </html>
            `);
            popup.document.close();
        }

        async function consultarBoleto() {
            ocultarMensajeConsulta();
            document.getElementById('lista-boletos-email').style.display = 'none';

            const folio = document.getElementById('folio_consulta').value.trim();
            const resultado = document.getElementById('consulta-resultado');
            const qr = document.getElementById('consulta-qr');
            const resumen = document.getElementById('consulta-resumen');
            const descargar = document.getElementById('consulta-descargar');

            if (!folio) {
                mostrarMensajeConsulta('❌ Escribe el folio de compra.', 'error');
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/api/ventas/${encodeURIComponent(folio)}`);
                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || 'No se encontró la compra');
                }

                const venta = data.venta;
                const detallesHtml = (data.detalles || []).map(d => `
                    <li>${d.nombre} x${d.cantidad} — ${money(d.subtotal)}</li>
                `).join('');

                qr.innerHTML = `
                    <img src="${API_BASE}/qrs/${encodeURIComponent(venta.folio)}.png" alt="QR del boleto">
                `;

                resumen.innerHTML = `
                    <p><strong>Folio:</strong> ${venta.folio}</p>
                    <p><strong>Cliente:</strong> ${venta.nombre_cliente || 'N/A'}</p>
                    <p><strong>Correo:</strong> ${venta.email || 'N/A'}</p>
                    <p><strong>Teléfono:</strong> ${venta.telefono || 'N/A'}</p>
                    <p><strong>Fecha de visita:</strong> ${venta.fecha_visita ? String(venta.fecha_visita).slice(0,10) : 'N/A'}</p>
                    <p><strong>Total de personas:</strong> ${venta.cantidad_personas ?? 'N/A'}</p>
                    <p><strong>Total pagado:</strong> ${money(venta.total)}</p>
                    <p><strong>Método de pago:</strong> ${formatearMetodoPago(venta.metodo_pago)}</p>
                    <p>
                        <strong>Estado de acceso:</strong>
                        <span class="${claseEstadoAcceso(venta.estado_acceso)}">${venta.estado_acceso || 'N/A'}</span>
                    </p>
                    <p><strong>Detalle:</strong></p>
                    <ul>${detallesHtml || '<li>Sin detalle</li>'}</ul>
                `;

                descargar.href = `${API_BASE}/qrs/${encodeURIComponent(venta.folio)}.png`;
                descargar.setAttribute('download', `${venta.folio}.png`);

                resultado.classList.add('show');
                resultado.scrollIntoView({ behavior: 'smooth' });

                mostrarMensajeConsulta('✅ Boleto encontrado correctamente.', 'ok');
            } catch (error) {
                resultado.classList.remove('show');
                mostrarMensajeConsulta(`❌ ${error.message}`, 'error');
            }
        }

        async function consultarBoletosPorEmail() {
            ocultarMensajeConsulta();

            const email = document.getElementById('email_consulta').value.trim();
            const lista = document.getElementById('lista-boletos-email');
            const resultado = document.getElementById('consulta-resultado');

            if (!email) {
                mostrarMensajeConsulta('❌ Escribe el correo electrónico.', 'error');
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/api/ventas-por-email?email=${encodeURIComponent(email)}`);
                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || 'No se encontraron boletos para ese correo');
                }

                if (!data.ventas || !data.ventas.length) {
                    lista.style.display = 'none';
                    resultado.classList.remove('show');
                    mostrarMensajeConsulta('⚠️ No hay boletos registrados con ese correo.', 'error');
                    return;
                }

                lista.innerHTML = `
                    <h3>📋 Boletos encontrados (${data.total})</h3>
                    ${data.ventas.map(v => `
                        <div class="item-boleto-email">
                            <div>
                                <p><strong>Folio:</strong> ${v.folio}</p>
                                <p><strong>Fecha visita:</strong> ${v.fecha_visita ? String(v.fecha_visita).slice(0,10) : 'N/A'}</p>
                                <p><strong>Total:</strong> ${money(v.total)}</p>
                                <p><strong>Estado:</strong> ${v.estado_acceso || 'N/A'}</p>
                            </div>
                            <div>
                                <button class="btn-ver-boleto" onclick="cargarBoletoDesdeLista('${v.folio}')">
                                    Ver boleto
                                </button>
                            </div>
                        </div>
                    `).join('')}
                `;

                lista.style.display = 'block';
                resultado.classList.remove('show');
                mostrarMensajeConsulta('✅ Boletos encontrados correctamente.', 'ok');
                lista.scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                lista.style.display = 'none';
                resultado.classList.remove('show');
                mostrarMensajeConsulta(`❌ ${error.message}`, 'error');
            }
        }

        function cargarBoletoDesdeLista(folio) {
            document.getElementById('folio_consulta').value = folio;
            consultarBoleto();
        }

        async function cargarCategorias() {
            const response = await fetch(`${API_BASE}/api/categorias`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'No se pudieron cargar las categorías');
            }

            categorias = data.categorias || [];
            renderTarifas();

            const container = document.getElementById('boletos-container');
            container.innerHTML = '';
            agregarBoleto();
        }
        function limpiarFormularioCompra() {
    document.getElementById('nombre_cliente').value = '';
    document.getElementById('email').value = '';
    document.getElementById('telefono').value = '';

    const hoy = new Date().toISOString().split('T')[0];
    const fechaInput = document.getElementById('fecha_visita');
    fechaInput.value = hoy;
    fechaInput.min = hoy;

    const container = document.getElementById('boletos-container');
    container.innerHTML = '';
    agregarBoleto();

    calcularTotales();
    ocultarMensaje();
}

function cerrarComprobanteQR() {
    const qrSection = document.getElementById('qr-generado');
    if (!qrSection) return;

    qrSection.classList.remove('show');
    qrSection.style.display = 'none';
}

function nuevaReservacion() {
    cerrarComprobanteQR();
    limpiarFormularioCompra();

    const form = document.querySelector('.compra-form');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth' });
    }
}

function validarTelefonoMx(telefono) {
    return /^[0-9]{10}$/.test(String(telefono || '').trim());
}

       async function procesarCompra() {
    ocultarMensaje();

    const btnComprar = document.getElementById('btn-comprar');
    const nombre_cliente = document.getElementById('nombre_cliente').value.trim();
    const email = document.getElementById('email').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const fecha_visita = document.getElementById('fecha_visita').value;

    if (!nombre_cliente || !email || !telefono || !fecha_visita) {
        mostrarMensaje('Completa todos los datos del formulario.', 'error');
        return;
    }

    if (!validarTelefonoMx(telefono)) {
        mostrarMensaje('El teléfono debe tener exactamente 10 dígitos.', 'error');
        return;
    }

    const detalles = obtenerDetallesCompra();

    if (!detalles.length) {
        mostrarMensaje('Agrega al menos una categoría con cantidad válida.', 'error');
        return;
    }

    btnComprar.disabled = true;
    btnComprar.textContent = '⏳ Generando reservación...';

    try {
        const response = await fetch(`${API_BASE}/api/venta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre_cliente,
                email,
                telefono,
                fecha_visita,
                detalles,
                metodo_pago: 'efectivo',
                canal_venta: 'web',
                observaciones: 'Reservación web pendiente de pago en taquilla'
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'No se pudo procesar la reservación');
        }

        renderResultadoCompra(data);
        limpiarFormularioCompra();
        mostrarMensaje('✅ Reservación generada correctamente.', 'ok');

    } catch (error) {
        mostrarMensaje(`❌ ${error.message}`, 'error');
    } finally {
        btnComprar.disabled = false;
        btnComprar.textContent = '🎟️ Reservar Boletos y Generar QR';
    }
}

        document.addEventListener('DOMContentLoaded', async function () {
            const hoy = new Date().toISOString().split('T')[0];
            const fechaInput = document.getElementById('fecha_visita');
            fechaInput.min = hoy;
            fechaInput.value = hoy;
            fechaInput.addEventListener('change', cargarPromocionesWeb);
            document.getElementById('telefono').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 10);
});

document.getElementById('fecha_visita').addEventListener('change', async function () {
    await cargarPromocionesWeb();
    calcularTotales();
});
            try {
                await cargarCategorias();
                calcularTotales();
                await cargarPromocionesWeb();
                await cargarPromocionesWeb();
            } catch (error) {
                mostrarMensaje(`❌ ${error.message}`, 'error');
            }

            document.getElementById('folio_consulta').addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    consultarBoleto();
                }
            });

            document.getElementById('email_consulta').addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    consultarBoletosPorEmail();
                }
            });
        });
    