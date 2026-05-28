const API_BASE = 'https://zoologico-trinitaria-production.up.railway.app';

function escapeHTML(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function mostrarMensaje(texto, tipo = 'error') {
  const box = document.getElementById('msgAnimalesPublicos');
  if (!box) return;

  box.className = `mensaje-publico show ${tipo}`;
  box.textContent = texto;

  setTimeout(() => {
    box.className = 'mensaje-publico';
    box.textContent = '';
  }, 4500);
}

function renderAnimales(animales = []) {
  const contenedor = document.getElementById('listaAnimalesPublicos');
  if (!contenedor) return;

  if (!animales.length) {
    contenedor.innerHTML = `
      <div class="empty-card">
        Por ahora no hay animales registrados para mostrar.
      </div>
    `;
    return;
  }

  contenedor.innerHTML = animales.map(a => `
    <article class="animal-card-public">
      <div class="animal-img-wrap">
        <img src="${escapeHTML(a.imagen_url)}" alt="${escapeHTML(a.nombre)}">
      </div>

      <div class="animal-content">
        <h3>${escapeHTML(a.nombre)}</h3>

        ${a.especie ? `
          <div class="animal-especie">${escapeHTML(a.especie)}</div>
        ` : ''}

        <p class="animal-desc">
          ${escapeHTML(a.descripcion)}
        </p>

        <div class="animal-tags">
          ${a.habitat ? `<span>🌿 ${escapeHTML(a.habitat)}</span>` : ''}
          ${a.alimentacion ? `<span>🍽️ ${escapeHTML(a.alimentacion)}</span>` : ''}
        </div>
      </div>
    </article>
  `).join('');
}

async function cargarAnimalesPublicos() {
  const contenedor = document.getElementById('listaAnimalesPublicos');

  if (contenedor) {
    contenedor.innerHTML = '<div class="loading-card">Cargando animales...</div>';
  }

  try {
    const res = await fetch(`${API_BASE}/api/animales-publicos`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || 'No se pudieron cargar los animales');
    }

    renderAnimales(data.animales || []);
  } catch (error) {
    renderAnimales([]);
    mostrarMensaje('❌ ' + error.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', cargarAnimalesPublicos);