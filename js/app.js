// Los datos están en js/datos.js

const searchBtn = document.getElementById('searchBtn');
const resetBtn = document.getElementById('resetBtn');
const filterType = document.getElementById('filterType');
const filterSector = document.getElementById('filterSector');
const filterRegion = document.getElementById('filterRegion');
const filterAmount = document.getElementById('filterAmount');
const resultsDiv = document.getElementById('results');

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0
  }).format(amount);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function renderResults(filteredGrants) {
  if (filteredGrants.length === 0) {
    resultsDiv.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <p>No se encontraron subvenciones con estos criterios. Intenta ajustar los filtros.</p>
      </div>
    `;
    return;
  }

  resultsDiv.innerHTML = `
    <div style="margin-bottom: 16px; font-size: 13px; color: rgba(255, 255, 255, 0.6);">
      Se encontraron <strong style="color: #b4976e;">${filteredGrants.length}</strong> subvención${filteredGrants.length !== 1 ? 'es' : ''}
    </div>
    ${filteredGrants.map(grant => `
      <div class="result-item">
        <div class="result-title">${grant.title}</div>
        <div class="result-desc">${grant.description}</div>
        <div class="result-meta">
          <span>💰 ${formatCurrency(grant.amount)}</span>
          <span>📅 Cierra: ${formatDate(grant.deadline)}</span>
        </div>
      </div>
    `).join('')}
  `;
}

function search() {
  const type = filterType.value;
  const sector = filterSector.value;
  const region = filterRegion.value;
  const amount = parseInt(filterAmount.value) || 0;

  resultsDiv.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Buscando subvenciones...</p>
    </div>
  `;

  // Simular búsqueda con pequeño delay
  setTimeout(() => {
    const filtered = grants.filter(grant => {
      return (
        (!type || grant.type === type) &&
        (!sector || grant.sector === sector) &&
        (!region || grant.region === region) &&
        grant.amount >= amount
      );
    });

    renderResults(filtered);
  }, 600);
}

function reset() {
  filterType.value = '';
  filterSector.value = '';
  filterRegion.value = '';
  filterAmount.value = '';
  resultsDiv.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <p>Usa los filtros y haz clic en "Buscar subvenciones" para empezar</p>
    </div>
  `;
}

searchBtn.addEventListener('click', search);
resetBtn.addEventListener('click', reset);

// Buscar al presionar Enter en los inputs
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') search();
});
