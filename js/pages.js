// ============================================================================
//  pages.js — Rendu de toutes les pages (miroir des vues/contrôleurs C#).
// ============================================================================

import { db, save, nextId, StockType, PaletteStatus, MovementType, Roles } from './db.js';
import * as svc from './services.js';
import { AppError } from './services.js';
import {
  esc, fmtDate, fmtNum, statusBadge, statusLabel, stockTypeLabel, movementLabel,
  toast, pageHeader, confirmAction
} from './ui.js';

// ---------------------------------------------------------------------------
//  CONNEXION
// ---------------------------------------------------------------------------
export function login(app, onDone) {
  app.innerHTML = `
    <main class="auth-wrapper">
      <div class="auth-card">
        <div class="card">
          <div class="card-body p-4">
            <div class="text-center mb-4">
              <i class="bi bi-box-seam text-primary" style="font-size:2.5rem"></i>
              <h4 class="mt-2 mb-0">Gestion de Stock</h4>
              <small class="text-muted">Connectez-vous pour continuer</small>
            </div>
            <form id="login-form">
              <div class="mb-3">
                <label class="form-label">E-mail</label>
                <input type="email" class="form-control" id="email" value="admin@gestionstock.local" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Mot de passe</label>
                <input type="password" class="form-control" id="password" value="Admin@123456" required>
              </div>
              <div class="form-check mb-3">
                <input type="checkbox" class="form-check-input" id="remember">
                <label class="form-check-label" for="remember">Se souvenir de moi</label>
              </div>
              <div class="alert alert-danger d-none" id="login-error"></div>
              <button type="submit" class="btn btn-primary w-100">Se connecter</button>
            </form>
          </div>
        </div>
        <p class="text-center text-white-50 mt-3 mb-0"><small>Démo : admin@gestionstock.local / Admin@123456</small></p>
      </div>
    </main>`;
  app.querySelector('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      svc.login(app.querySelector('#email').value, app.querySelector('#password').value, app.querySelector('#remember').checked);
      location.hash = '#/dashboard';
      onDone();
    } catch (err) {
      const box = app.querySelector('#login-error');
      box.textContent = err.message; box.classList.remove('d-none');
    }
  });
}

// ---------------------------------------------------------------------------
//  TABLEAU DE BORD
// ---------------------------------------------------------------------------
export function dashboard(c) {
  const d = db();
  const inStock = d.palettes.filter(p => p.status === PaletteStatus.InStock);
  const blocked = d.palettes.filter(p => p.status === PaletteStatus.Blocked);
  const exited = d.palettes.filter(p => p.status === PaletteStatus.Exited);
  const totalWeight = inStock.reduce((s, p) => s + (p.remainingWeight || 0), 0);

  const kpi = (icon, color, value, label) => `
    <div class="col-sm-6 col-xl-3">
      <div class="card kpi-card"><div class="card-body d-flex align-items-center gap-3">
        <div class="kpi-icon bg-${color}-subtle text-${color}"><i class="bi ${icon}"></i></div>
        <div><h3>${value}</h3><small class="text-muted">${label}</small></div>
      </div></div>
    </div>`;

  // Palettes par zone (pour le graphique)
  const byZone = {};
  inStock.forEach(p => { const z = svc.findZone(p.currentZoneId); const k = z ? z.name : '—'; byZone[k] = (byZone[k] || 0) + 1; });

  c.innerHTML = pageHeader('Tableau de bord', "Vue d'ensemble de l'entrepôt") + `
    <div class="row g-3 mb-4">
      ${kpi('bi-boxes', 'primary', inStock.length, 'Palettes en stock')}
      ${kpi('bi-lock', 'danger', blocked.length, 'Palettes bloquées')}
      ${kpi('bi-box-arrow-up', 'secondary', exited.length, 'Palettes sorties')}
      ${kpi('bi-speedometer', 'success', fmtNum(totalWeight) + ' kg', 'Poids en stock')}
    </div>
    <div class="row g-3">
      <div class="col-lg-7"><div class="card"><div class="card-body">
        <h6 class="mb-3">Palettes en stock par zone</h6><canvas id="chart-zone" height="120"></canvas>
      </div></div></div>
      <div class="col-lg-5"><div class="card"><div class="card-body">
        <h6 class="mb-3">Dernières palettes</h6>
        <div class="table-responsive"><table class="table table-sm mb-0">
          <thead><tr><th>N°</th><th>Produit</th><th>État</th></tr></thead>
          <tbody>${d.palettes.slice(-6).reverse().map(p => {
            const pr = svc.findProduct(p.productId);
            return `<tr><td><a href="#/palette/${p.id}">${esc(p.paletteNumber)}</a></td><td>${esc(pr?.name || '—')}</td><td>${statusBadge(p.status)}</td></tr>`;
          }).join('') || '<tr><td colspan="3" class="text-muted">Aucune palette</td></tr>'}</tbody>
        </table></div>
      </div></div></div>
    </div>`;

  if (window.Chart) {
    new Chart(c.querySelector('#chart-zone'), {
      type: 'bar',
      data: { labels: Object.keys(byZone), datasets: [{ label: 'Palettes', data: Object.values(byZone), backgroundColor: '#6c5ce7' }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }
}

// ---------------------------------------------------------------------------
//  ENTRÉE DE STOCK
// ---------------------------------------------------------------------------
export function stockEntry(c) {
  const d = db();
  const clients = d.clients.filter(x => x.isActive);
  const products = d.products.filter(x => x.isActive);
  const zones = d.zones.filter(x => x.isActive);
  const opt = (arr, label) => arr.map(x => `<option value="${x.id}">${esc(x.code + ' — ' + (x[label] || x.name))}</option>`).join('');

  c.innerHTML = pageHeader('Entrée de stock', 'Créer une nouvelle palette') + `
    <div class="card"><div class="card-body">
      <form id="entry-form" class="row g-3">
        <div class="col-md-4">
          <label class="form-label">Type de stock *</label>
          <select class="form-select" id="stockType">
            <option value="1">Stock client</option><option value="2">Stock propre (achat)</option>
          </select>
        </div>
        <div class="col-md-4"><label class="form-label">Client <span id="cl-req">*</span></label>
          <select class="form-select" id="clientId"><option value="">— Aucun —</option>${opt(clients, 'name')}</select></div>
        <div class="col-md-4"><label class="form-label">Produit *</label>
          <select class="form-select" id="productId" required><option value="">— Choisir —</option>${opt(products, 'name')}</select></div>
        <div class="col-md-4"><label class="form-label">Zone *</label>
          <select class="form-select" id="zoneId" required><option value="">— Choisir —</option>${opt(zones, 'name')}</select></div>
        <div class="col-md-4"><label class="form-label">Nombre de cartons *</label>
          <input type="number" class="form-control" id="cartons" min="1" required></div>
        <div class="col-md-4"><label class="form-label">Poids unitaire / carton (kg)</label>
          <input type="number" step="0.001" class="form-control" id="unitWeight"></div>
        <div class="col-md-4"><label class="form-label">Poids total (kg) *</label>
          <input type="number" step="0.001" class="form-control" id="totalWeight" required></div>
        <div class="col-md-4"><label class="form-label">Date d'entrée</label>
          <input type="datetime-local" class="form-control" id="entryDate"></div>
        <div class="col-12"><label class="form-label">Notes</label><textarea class="form-control" id="notes" rows="2"></textarea></div>
        <div class="col-12"><button class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>Enregistrer l'entrée</button></div>
      </form>
    </div></div>`;

  // Poids total = cartons × poids unitaire (calcul auto)
  const cartons = c.querySelector('#cartons'), unit = c.querySelector('#unitWeight'), total = c.querySelector('#totalWeight');
  const recompute = () => { const n = +cartons.value, u = +unit.value; if (n > 0 && u > 0) total.value = (n * u).toFixed(3); };
  cartons.addEventListener('input', recompute); unit.addEventListener('input', recompute);

  // Client obligatoire seulement pour le stock client
  const st = c.querySelector('#stockType'), clReq = c.querySelector('#cl-req');
  st.addEventListener('change', () => { clReq.style.visibility = st.value === '1' ? 'visible' : 'hidden'; });

  c.querySelector('#entry-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const p = svc.createEntry({
        stockType: +st.value,
        clientId: c.querySelector('#clientId').value ? +c.querySelector('#clientId').value : null,
        productId: +c.querySelector('#productId').value,
        zoneId: +c.querySelector('#zoneId').value,
        numberOfCartons: +cartons.value,
        unitWeight: unit.value ? +unit.value : null,
        totalWeight: +total.value,
        entryDate: c.querySelector('#entryDate').value || new Date().toISOString(),
        notes: c.querySelector('#notes').value
      });
      toast(`Palette ${p.paletteNumber} créée.`);
      location.hash = `#/palette/${p.id}`;
    } catch (err) { toast(err.message, 'danger'); }
  });
}

// ---------------------------------------------------------------------------
//  STOCK ACTUEL
// ---------------------------------------------------------------------------
export function stock(c, params) {
  const q = params && params[0] ? decodeURIComponent(params[0]).toLowerCase() : '';
  const d = db();
  let list = d.palettes.slice().reverse();
  if (q) list = list.filter(p => p.paletteNumber.toLowerCase().includes(q));

  c.innerHTML = pageHeader('Stock actuel', `${list.length} palette(s)`) + `
    <div class="card"><div class="card-body">
      <input class="form-control mb-3" id="filter" placeholder="Filtrer par numéro..." value="${esc(q)}">
      <div class="table-responsive"><table class="table table-hover">
        <thead><tr><th>N°</th><th>Produit</th><th>Client</th><th>Zone</th><th>Cartons</th><th>Poids</th><th>État</th><th></th></tr></thead>
        <tbody id="rows">${rowsHtml(list)}</tbody>
      </table></div>
    </div></div>`;

  c.querySelector('#filter').addEventListener('input', (e) => {
    const v = e.target.value.toLowerCase();
    c.querySelector('#rows').innerHTML = rowsHtml(d.palettes.slice().reverse().filter(p => p.paletteNumber.toLowerCase().includes(v)));
    bindStockActions(c);
  });
  bindStockActions(c);

  function rowsHtml(arr) {
    if (!arr.length) return '<tr><td colspan="8" class="text-muted text-center">Aucune palette</td></tr>';
    return arr.map(p => {
      const pr = svc.findProduct(p.productId), cl = svc.findClient(p.clientId), z = svc.findZone(p.currentZoneId);
      const blockBtn = p.status === PaletteStatus.InStock
        ? `<button class="btn btn-sm btn-outline-danger" data-block="${p.id}"><i class="bi bi-lock"></i></button>`
        : p.status === PaletteStatus.Blocked
        ? `<button class="btn btn-sm btn-outline-success" data-unblock="${p.id}"><i class="bi bi-unlock"></i></button>` : '';
      return `<tr>
        <td><a href="#/palette/${p.id}">${esc(p.paletteNumber)}</a></td>
        <td>${esc(pr?.name || '—')}</td><td>${esc(cl?.name || '—')}</td><td>${esc(z?.name || '—')}</td>
        <td>${fmtNum(p.remainingCartons)}</td><td>${fmtNum(p.remainingWeight)} kg</td>
        <td>${statusBadge(p.status)}</td>
        <td class="text-end"><div class="btn-group">
          <a class="btn btn-sm btn-outline-secondary" href="#/label/${p.id}"><i class="bi bi-printer"></i></a>
          ${blockBtn}
        </div></td></tr>`;
    }).join('');
  }
}

function bindStockActions(c) {
  c.querySelectorAll('[data-block]').forEach(b => b.addEventListener('click', () => {
    const comment = prompt('Motif du blocage (optionnel) :') ?? undefined;
    try { svc.setBlocked(+b.dataset.block, true, comment); toast('Palette bloquée.'); window.appRender(); }
    catch (e) { toast(e.message, 'danger'); }
  }));
  c.querySelectorAll('[data-unblock]').forEach(b => b.addEventListener('click', () => {
    try { svc.setBlocked(+b.dataset.unblock, false); toast('Palette débloquée.'); window.appRender(); }
    catch (e) { toast(e.message, 'danger'); }
  }));
}

// ---------------------------------------------------------------------------
//  DÉTAILS PALETTE
// ---------------------------------------------------------------------------
export function paletteDetails(c, params) {
  const p = svc.findPalette(params[0]);
  if (!p) { c.innerHTML = '<div class="alert alert-warning">Palette introuvable.</div>'; return; }
  const pr = svc.findProduct(p.productId), cl = svc.findClient(p.clientId),
        exitCl = svc.findClient(p.exitClientId), z = svc.findZone(p.currentZoneId);
  const info = (l, v) => `<div class="col-md-4 mb-3"><small class="text-muted d-block">${l}</small><span>${v}</span></div>`;

  c.innerHTML = pageHeader('Palette ' + p.paletteNumber, stockTypeLabel[p.stockType],
    `<a class="btn btn-sm btn-outline-secondary" href="#/label/${p.id}"><i class="bi bi-printer me-1"></i>Étiquette</a>
     <a class="btn btn-sm btn-outline-secondary" href="#/history/${p.id}"><i class="bi bi-clock-history me-1"></i>Historique</a>`) + `
    <div class="card mb-3"><div class="card-body"><div class="row">
      ${info('État', statusBadge(p.status))}
      ${info('Produit', esc(pr?.name || '—'))}
      ${info('Client', esc(cl?.name || '—'))}
      ${info('Zone actuelle', esc(z?.name || '—'))}
      ${info('Cartons', fmtNum(p.numberOfCartons))}
      ${info('Poids total', fmtNum(p.totalWeight) + ' kg')}
      ${info("Date d'entrée", fmtDate(p.entryDate))}
      ${info('Date de sortie', p.exitDate ? fmtDate(p.exitDate) : '—')}
      ${info('Client de sortie', esc(exitCl?.name || '—'))}
      ${info('Notes', esc(p.notes || '—'))}
    </div></div></div>`;
}

// ---------------------------------------------------------------------------
//  HISTORIQUE PALETTE
// ---------------------------------------------------------------------------
export function history(c, params) {
  const d = db();
  if (!params[0]) {
    c.innerHTML = pageHeader('Historique palette', 'Choisir une palette') + `
      <div class="card"><div class="card-body"><div class="table-responsive"><table class="table table-hover">
        <thead><tr><th>N°</th><th>Produit</th><th>État</th></tr></thead><tbody>
        ${d.palettes.slice().reverse().map(p => { const pr = svc.findProduct(p.productId);
          return `<tr><td><a href="#/history/${p.id}">${esc(p.paletteNumber)}</a></td><td>${esc(pr?.name||'—')}</td><td>${statusBadge(p.status)}</td></tr>`;
        }).join('') || '<tr><td colspan="3" class="text-muted">Aucune palette</td></tr>'}</tbody></table></div></div></div>`;
    return;
  }
  const p = svc.findPalette(params[0]);
  if (!p) { c.innerHTML = '<div class="alert alert-warning">Palette introuvable.</div>'; return; }
  const mv = svc.movementsFor(p.id);
  c.innerHTML = pageHeader('Historique — ' + p.paletteNumber, `${mv.length} mouvement(s)`,
    `<a class="btn btn-sm btn-outline-secondary" href="#/palette/${p.id}">Détails</a>`) + `
    <div class="card"><div class="card-body"><div class="table-responsive"><table class="table">
      <thead><tr><th>Date</th><th>Type</th><th>Zone</th><th>Cartons</th><th>Poids</th><th>Par</th><th>Commentaire</th></tr></thead>
      <tbody>${mv.map(m => {
        const pz = svc.findZone(m.previousZoneId), nz = svc.findZone(m.newZoneId);
        const zoneTxt = m.movementType === MovementType.Transfer ? `${esc(pz?.name||'—')} → ${esc(nz?.name||'—')}` : esc(nz?.name || pz?.name || '—');
        return `<tr><td>${fmtDate(m.movementDate)}</td><td>${esc(movementLabel[m.movementType])}</td><td>${zoneTxt}</td>
          <td>${m.numberOfCartons != null ? fmtNum(m.numberOfCartons) : '—'}</td><td>${m.weight != null ? fmtNum(m.weight)+' kg' : '—'}</td>
          <td>${esc(m.userName || '—')}</td><td>${esc(m.comment || '—')}</td></tr>`;
      }).join('') || '<tr><td colspan="7" class="text-muted">Aucun mouvement</td></tr>'}</tbody>
    </table></div></div></div>`;
}

// ---------------------------------------------------------------------------
//  SORTIE DE STOCK
// ---------------------------------------------------------------------------
export function stockExit(c) {
  c.innerHTML = pageHeader('Sortie de stock', 'Rechercher une palette par numéro / QR') + `
    <div class="card"><div class="card-body">
      <div class="input-group mb-3">
        <input class="form-control" id="lookup" placeholder="Numéro de palette (PAL-...)">
        <button class="btn btn-primary" id="find">Rechercher</button>
      </div>
      <div id="result"></div>
    </div></div>`;
  const doLookup = () => {
    const p = svc.findByQr(c.querySelector('#lookup').value);
    const res = c.querySelector('#result');
    if (!p) { res.innerHTML = '<div class="alert alert-warning">Palette introuvable.</div>'; return; }
    const pr = svc.findProduct(p.productId), cl = svc.findClient(p.clientId);
    const needClient = p.stockType === StockType.PurchaseStock;
    const clients = db().clients.filter(x => x.isActive);
    res.innerHTML = `
      <div class="border rounded p-3">
        <div class="d-flex justify-content-between"><h5>${esc(p.paletteNumber)}</h5>${statusBadge(p.status)}</div>
        <p class="mb-1">Produit : ${esc(pr?.name||'—')} — Client : ${esc(cl?.name||'—')}</p>
        <p class="mb-3 text-muted">${stockTypeLabel[p.stockType]}</p>
        <form id="exit-form" class="row g-2">
          ${needClient ? `<div class="col-md-6"><label class="form-label">Client destinataire *</label>
            <select class="form-select" id="exitClient" required><option value="">— Choisir —</option>
            ${clients.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>` : ''}
          <div class="col-md-6"><label class="form-label">Commentaire</label><input class="form-control" id="comment"></div>
          <div class="col-12"><button class="btn btn-danger"><i class="bi bi-box-arrow-up me-1"></i>Confirmer la sortie</button></div>
        </form>
      </div>`;
    res.querySelector('#exit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        svc.exitPalette({ paletteId: p.id, exitClientId: needClient ? +res.querySelector('#exitClient').value : null, comment: res.querySelector('#comment').value });
        toast('Sortie enregistrée.'); location.hash = `#/palette/${p.id}`;
      } catch (err) { toast(err.message, 'danger'); }
    });
  };
  c.querySelector('#find').addEventListener('click', doLookup);
  c.querySelector('#lookup').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLookup(); });
}

// ---------------------------------------------------------------------------
//  TRANSFERT
// ---------------------------------------------------------------------------
export function transfer(c) {
  c.innerHTML = pageHeader('Transfert de zone', 'Déplacer une palette') + `
    <div class="card"><div class="card-body">
      <div class="input-group mb-3">
        <input class="form-control" id="lookup" placeholder="Numéro de palette (PAL-...)">
        <button class="btn btn-primary" id="find">Rechercher</button>
      </div><div id="result"></div>
    </div></div>`;
  const doLookup = () => {
    const p = svc.findByQr(c.querySelector('#lookup').value);
    const res = c.querySelector('#result');
    if (!p) { res.innerHTML = '<div class="alert alert-warning">Palette introuvable.</div>'; return; }
    const z = svc.findZone(p.currentZoneId);
    const zones = db().zones.filter(x => x.isActive && x.id !== p.currentZoneId);
    res.innerHTML = `<div class="border rounded p-3">
      <div class="d-flex justify-content-between"><h5>${esc(p.paletteNumber)}</h5>${statusBadge(p.status)}</div>
      <p class="text-muted">Zone actuelle : ${esc(z?.name||'—')}</p>
      <form id="tr-form" class="row g-2">
        <div class="col-md-6"><label class="form-label">Nouvelle zone *</label>
          <select class="form-select" id="newZone" required><option value="">— Choisir —</option>
          ${zones.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
        <div class="col-md-6"><label class="form-label">Commentaire</label><input class="form-control" id="comment"></div>
        <div class="col-12"><button class="btn btn-primary"><i class="bi bi-arrow-left-right me-1"></i>Transférer</button></div>
      </form></div>`;
    res.querySelector('#tr-form').addEventListener('submit', (e) => {
      e.preventDefault();
      try { svc.transferPalette({ paletteId: p.id, newZoneId: +res.querySelector('#newZone').value, comment: res.querySelector('#comment').value });
        toast('Transfert effectué.'); location.hash = `#/palette/${p.id}`;
      } catch (err) { toast(err.message, 'danger'); }
    });
  };
  c.querySelector('#find').addEventListener('click', doLookup);
  c.querySelector('#lookup').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLookup(); });
}

// ---------------------------------------------------------------------------
//  SCANNER (caméra + saisie manuelle)
// ---------------------------------------------------------------------------
export function scan(c) {
  c.innerHTML = pageHeader('Scanner', 'Caméra ou saisie manuelle') + `
    <div class="row g-3">
      <div class="col-md-6"><div class="card"><div class="card-body">
        <div id="reader" style="width:100%"></div>
        <button class="btn btn-outline-primary w-100 mt-2" id="start-cam"><i class="bi bi-camera me-1"></i>Démarrer la caméra</button>
      </div></div></div>
      <div class="col-md-6"><div class="card"><div class="card-body">
        <label class="form-label">Saisie manuelle / lecteur USB</label>
        <div class="input-group mb-3"><input class="form-control" id="manual" placeholder="PAL-..."><button class="btn btn-primary" id="go">Chercher</button></div>
        <div id="result"></div>
      </div></div></div>
    </div>`;

  const show = (code) => {
    const p = svc.findByQr(code); const res = c.querySelector('#result');
    if (!p) { res.innerHTML = `<div class="alert alert-warning">Aucune palette pour « ${esc(code)} ».</div>`; return; }
    const pr = svc.findProduct(p.productId), z = svc.findZone(p.currentZoneId);
    res.innerHTML = `<div class="border rounded p-3">
      <div class="d-flex justify-content-between"><h5>${esc(p.paletteNumber)}</h5>${statusBadge(p.status)}</div>
      <p class="mb-1">Produit : ${esc(pr?.name||'—')}</p><p class="mb-2">Zone : ${esc(z?.name||'—')}</p>
      <a class="btn btn-sm btn-primary" href="#/palette/${p.id}">Ouvrir</a></div>`;
  };
  c.querySelector('#go').addEventListener('click', () => show(c.querySelector('#manual').value));
  c.querySelector('#manual').addEventListener('keydown', (e) => { if (e.key === 'Enter') show(e.target.value); });

  c.querySelector('#start-cam').addEventListener('click', function () {
    if (!window.Html5Qrcode) { toast('Bibliothèque de scan indisponible (hors ligne ?).', 'warning'); return; }
    const reader = new Html5Qrcode('reader');
    reader.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 },
      (decoded) => { reader.stop(); show(decoded); },
      () => {}).catch(() => toast("Impossible d'accéder à la caméra.", 'danger'));
    this.disabled = true; this.textContent = 'Caméra active...';
  });
}

// ---------------------------------------------------------------------------
//  ÉTIQUETTES QR (liste + impression)
// ---------------------------------------------------------------------------
export function labels(c) {
  const d = db();
  c.innerHTML = pageHeader('Étiquettes QR', 'Imprimer les étiquettes des palettes') + `
    <div class="card"><div class="card-body"><div class="table-responsive"><table class="table table-hover">
      <thead><tr><th>N°</th><th>Produit</th><th>Imprimée</th><th></th></tr></thead><tbody>
      ${d.palettes.slice().reverse().map(p => { const pr = svc.findProduct(p.productId);
        return `<tr><td>${esc(p.paletteNumber)}</td><td>${esc(pr?.name||'—')}</td>
        <td>${p.isLabelPrinted ? `<span class="badge bg-success">Oui (${p.printCount})</span>` : '<span class="badge bg-secondary">Non</span>'}</td>
        <td class="text-end"><a class="btn btn-sm btn-primary" href="#/label/${p.id}"><i class="bi bi-printer me-1"></i>Étiquette</a></td></tr>`;
      }).join('') || '<tr><td colspan="4" class="text-muted">Aucune palette</td></tr>'}</tbody></table></div></div></div>`;
}

export function labelPrint(c, params) {
  const p = svc.findPalette(params[0]);
  if (!p) { c.innerHTML = '<div class="alert alert-warning">Palette introuvable.</div>'; return; }
  const pr = svc.findProduct(p.productId);
  c.innerHTML = `
    <div class="no-print mb-3 d-flex gap-2">
      <a class="btn btn-outline-secondary" href="#/labels"><i class="bi bi-arrow-left me-1"></i>Retour</a>
      <button class="btn btn-primary" id="print"><i class="bi bi-printer me-1"></i>Imprimer</button>
    </div>
    <div class="qr-label">
      <canvas id="qr"></canvas>
      <div class="num">${esc(p.paletteNumber)}</div>
      <div>${esc(pr?.name || '')}</div>
      <div>${fmtNum(p.numberOfCartons)} cartons — ${fmtNum(p.totalWeight)} kg</div>
    </div>`;
  if (window.QRCode) QRCode.toCanvas(c.querySelector('#qr'), p.qrCode, { width: 180 }, () => {});
  c.querySelector('#print').addEventListener('click', () => { svc.markLabelPrinted(p.id); window.print(); });
}

// ---------------------------------------------------------------------------
//  RAPPORTS (entrées / sorties)
// ---------------------------------------------------------------------------
export function reports(c, kind) {
  const d = db();
  const isIn = kind === 'in';
  const list = d.palettes.filter(p => isIn ? true : p.status === PaletteStatus.Exited)
    .slice().sort((a, b) => new Date(isIn ? b.entryDate : b.exitDate) - new Date(isIn ? a.entryDate : a.exitDate));
  c.innerHTML = pageHeader(isIn ? 'Rapport des entrées' : 'Rapport des sorties', `${list.length} ligne(s)`,
    `<button class="btn btn-sm btn-outline-secondary" onclick="window.print()"><i class="bi bi-printer me-1"></i>Imprimer</button>`) + `
    <div class="card"><div class="card-body"><div class="table-responsive"><table class="table">
      <thead><tr><th>N°</th><th>Produit</th><th>Client</th><th>Cartons</th><th>Poids</th><th>${isIn?"Date d'entrée":'Date de sortie'}</th></tr></thead>
      <tbody>${list.map(p => { const pr = svc.findProduct(p.productId), cl = svc.findClient(isIn ? p.clientId : p.exitClientId);
        return `<tr><td>${esc(p.paletteNumber)}</td><td>${esc(pr?.name||'—')}</td><td>${esc(cl?.name||'—')}</td>
        <td>${fmtNum(p.numberOfCartons)}</td><td>${fmtNum(p.totalWeight)} kg</td><td>${fmtDate(isIn?p.entryDate:p.exitDate)}</td></tr>`;
      }).join('') || `<tr><td colspan="6" class="text-muted">Aucune donnée</td></tr>`}</tbody>
    </table></div></div></div>`;
}

// ---------------------------------------------------------------------------
//  CRUD générique : Clients / Produits / Zones
// ---------------------------------------------------------------------------
function crudPage(c, cfg) {
  const d = db();
  const rows = d[cfg.key];
  c.innerHTML = pageHeader(cfg.title, `${rows.length} enregistrement(s)`,
    `<button class="btn btn-sm btn-primary" id="add"><i class="bi bi-plus-lg me-1"></i>Ajouter</button>`) + `
    <div class="card"><div class="card-body"><div class="table-responsive"><table class="table table-hover">
      <thead><tr>${cfg.columns.map(col => `<th>${esc(col.label)}</th>`).join('')}<th>État</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        ${cfg.columns.map(col => `<td>${esc(col.get ? col.get(r) : r[col.field] ?? '—')}</td>`).join('')}
        <td>${r.isActive ? '<span class="badge bg-success">Actif</span>' : '<span class="badge bg-secondary">Inactif</span>'}</td>
        <td class="text-end"><div class="btn-group">
          <button class="btn btn-sm btn-outline-secondary" data-edit="${r.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-${r.isActive?'warning':'success'}" data-toggle="${r.id}"><i class="bi bi-${r.isActive?'slash-circle':'check-circle'}"></i></button>
        </div></td></tr>`).join('') || `<tr><td colspan="${cfg.columns.length+2}" class="text-muted text-center">Aucun enregistrement</td></tr>`}
      </tbody></table></div></div></div>`;

  const openForm = (rec) => {
    const isEdit = !!rec;
    const body = cfg.fields.map(f => {
      const val = rec ? (rec[f.field] ?? '') : (f.default ?? '');
      if (f.type === 'textarea') return `<div class="mb-3"><label class="form-label">${esc(f.label)}</label><textarea class="form-control" name="${f.field}" rows="2">${esc(val)}</textarea></div>`;
      return `<div class="mb-3"><label class="form-label">${esc(f.label)}${f.required?' *':''}</label>
        <input class="form-control" name="${f.field}" type="${f.type||'text'}" value="${esc(val)}" ${f.required?'required':''} ${f.step?`step="${f.step}"`:''}></div>`;
    }).join('');
    showModal(`${isEdit ? 'Modifier' : 'Ajouter'} — ${cfg.title}`, `<form id="crud-form">${body}</form>`, () => {
      const form = document.getElementById('crud-form');
      if (!form.reportValidity()) return false;
      const data = {}; cfg.fields.forEach(f => {
        let v = form.elements[f.field].value.trim();
        if (f.type === 'number') v = v === '' ? null : +v;
        data[f.field] = v;
      });
      try {
        // Unicité du code
        const dup = rows.find(x => x.code.toLowerCase() === (data.code||'').toLowerCase() && (!rec || x.id !== rec.id));
        if (dup) throw new AppError('Ce code existe déjà.');
        if (isEdit) { Object.assign(rec, data); svc.audit(cfg.entity+'Updated', cfg.entity, rec.id, `${cfg.title} ${rec.code} modifié.`); }
        else {
          const nr = Object.assign({ id: nextId(cfg.seq), isActive: true, createdAt: new Date().toISOString() }, data);
          rows.push(nr); svc.audit(cfg.entity+'Created', cfg.entity, nr.id, `${cfg.title} ${nr.code} créé.`);
        }
        save(); toast('Enregistré.'); window.appRender();
        return true;
      } catch (e) { toast(e.message, 'danger'); return false; }
    });
  };

  c.querySelector('#add').addEventListener('click', () => openForm(null));
  c.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openForm(rows.find(r => r.id === +b.dataset.edit))));
  c.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const r = rows.find(x => x.id === +b.dataset.toggle); r.isActive = !r.isActive;
    svc.audit(cfg.entity+'Toggled', cfg.entity, r.id, `${cfg.title} ${r.code} ${r.isActive?'activé':'désactivé'}.`);
    save(); toast('Mis à jour.'); window.appRender();
  }));
}

export function clients(c) {
  crudPage(c, {
    title: 'Clients', key: 'clients', seq: 'client', entity: 'Client',
    columns: [{ label: 'Code', field: 'code' }, { label: 'Nom', field: 'name' }, { label: 'Téléphone', field: 'phone' }, { label: 'Contact', field: 'contactPerson' }],
    fields: [{ label: 'Code', field: 'code', required: true }, { label: 'Nom', field: 'name', required: true },
      { label: 'Téléphone', field: 'phone' }, { label: 'Personne de contact', field: 'contactPerson' },
      { label: 'ICE', field: 'ice' }, { label: 'IF', field: 'if' }]
  });
}
export function products(c) {
  crudPage(c, {
    title: 'Produits', key: 'products', seq: 'product', entity: 'Product',
    columns: [{ label: 'Code', field: 'code' }, { label: 'Nom', field: 'name' }, { label: 'Catégorie', field: 'category' }, { label: 'Unité', field: 'unit' }, { label: 'Poids carton', get: r => fmtNum(r.standardCartonWeight) + ' kg' }],
    fields: [{ label: 'Code', field: 'code', required: true }, { label: 'Nom', field: 'name', required: true },
      { label: 'Catégorie', field: 'category' }, { label: 'Unité', field: 'unit', default: 'KG' },
      { label: 'Poids standard / carton (kg)', field: 'standardCartonWeight', type: 'number', step: '0.001' }]
  });
}
export function zones(c) {
  crudPage(c, {
    title: 'Zones', key: 'zones', seq: 'zone', entity: 'Zone',
    columns: [{ label: 'Code', field: 'code' }, { label: 'Nom', field: 'name' }, { label: 'Capacité', field: 'capacity' }, { label: 'Description', field: 'description' }],
    fields: [{ label: 'Code', field: 'code', required: true }, { label: 'Nom', field: 'name', required: true },
      { label: 'Capacité', field: 'capacity', type: 'number' }, { label: 'Description', field: 'description', type: 'textarea' }]
  });
}

// ---------------------------------------------------------------------------
//  UTILISATEURS
// ---------------------------------------------------------------------------
export function users(c) {
  const d = db();
  const roleOpts = Object.entries({ ADMIN: 'Administrateur', SUPERVISOR: 'Superviseur', WAREHOUSE_OPERATOR: 'Opérateur', VIEWER: 'Lecteur' });
  c.innerHTML = pageHeader('Utilisateurs', `${d.users.length} utilisateur(s)`,
    `<button class="btn btn-sm btn-primary" id="add"><i class="bi bi-plus-lg me-1"></i>Ajouter</button>`) + `
    <div class="card"><div class="card-body"><div class="table-responsive"><table class="table table-hover">
      <thead><tr><th>E-mail</th><th>Nom</th><th>Rôle</th><th>État</th><th></th></tr></thead>
      <tbody>${d.users.map(u => `<tr><td>${esc(u.email)}</td><td>${esc(u.fullName||'—')}</td>
        <td>${esc(Object.fromEntries(roleOpts)[u.role] || u.role)}</td>
        <td>${u.isActive?'<span class="badge bg-success">Actif</span>':'<span class="badge bg-secondary">Inactif</span>'}</td>
        <td class="text-end"><div class="btn-group">
          <button class="btn btn-sm btn-outline-secondary" data-edit="${u.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-${u.isActive?'warning':'success'}" data-toggle="${u.id}"><i class="bi bi-${u.isActive?'slash-circle':'check-circle'}"></i></button>
        </div></td></tr>`).join('')}</tbody></table></div></div></div>`;

  const openForm = (rec) => {
    const isEdit = !!rec;
    showModal(`${isEdit?'Modifier':'Ajouter'} — Utilisateur`, `<form id="u-form">
      <div class="mb-3"><label class="form-label">E-mail *</label><input class="form-control" name="email" type="email" value="${esc(rec?.email||'')}" required></div>
      <div class="mb-3"><label class="form-label">Nom complet</label><input class="form-control" name="fullName" value="${esc(rec?.fullName||'')}"></div>
      <div class="mb-3"><label class="form-label">Mot de passe ${isEdit?'(laisser vide pour ne pas changer)':'*'}</label><input class="form-control" name="password" type="text" ${isEdit?'':'required'}></div>
      <div class="mb-3"><label class="form-label">Rôle *</label><select class="form-select" name="role">
        ${roleOpts.map(([v,l])=>`<option value="${v}" ${rec?.role===v?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
    </form>`, () => {
      const f = document.getElementById('u-form');
      if (!f.reportValidity()) return false;
      const email = f.email.value.trim();
      const dup = d.users.find(x => x.email.toLowerCase() === email.toLowerCase() && (!rec || x.id !== rec.id));
      if (dup) { toast('Cet e-mail existe déjà.', 'danger'); return false; }
      if (isEdit) {
        rec.email = email; rec.fullName = f.fullName.value.trim(); rec.role = f.role.value;
        if (f.password.value) rec.password = f.password.value;
        svc.audit('UserUpdated', 'User', rec.id, `Utilisateur ${email} modifié.`);
      } else {
        const nu = { id: 'u' + nextId('audit') + Date.now().toString(36), email, fullName: f.fullName.value.trim(), password: f.password.value, role: f.role.value, isActive: true, createdAt: new Date().toISOString() };
        d.users.push(nu); svc.audit('UserCreated', 'User', nu.id, `Utilisateur ${email} créé.`);
      }
      save(); toast('Enregistré.'); window.appRender(); return true;
    });
  };
  c.querySelector('#add').addEventListener('click', () => openForm(null));
  c.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openForm(d.users.find(u => u.id === b.dataset.edit))));
  c.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const u = d.users.find(x => x.id === b.dataset.toggle);
    if (u.id === svc.currentUser().id) { toast('Vous ne pouvez pas désactiver votre propre compte.', 'warning'); return; }
    u.isActive = !u.isActive; save(); toast('Mis à jour.'); window.appRender();
  }));
}

// ---------------------------------------------------------------------------
//  JOURNAL D'AUDIT
// ---------------------------------------------------------------------------
export function audit(c) {
  const d = db();
  const list = d.audits.slice().reverse();
  c.innerHTML = pageHeader("Journal d'audit", `${list.length} entrée(s)`) + `
    <div class="card"><div class="card-body"><div class="table-responsive"><table class="table table-sm">
      <thead><tr><th>Date</th><th>Action</th><th>Entité</th><th>Utilisateur</th><th>Description</th></tr></thead>
      <tbody>${list.slice(0, 300).map(a => `<tr><td>${fmtDate(a.timestamp)}</td><td><span class="badge bg-light text-dark">${esc(a.action)}</span></td>
        <td>${esc(a.entity||'—')}</td><td>${esc(a.userName||'—')}</td><td>${esc(a.description||'—')}</td></tr>`).join('')
        || '<tr><td colspan="5" class="text-muted text-center">Aucune entrée</td></tr>'}</tbody>
    </table></div></div></div>`;
}

// ---------------------------------------------------------------------------
//  DONNÉES (import / export / réinitialisation du JSON)
// ---------------------------------------------------------------------------
export function settings(c) {
  c.innerHTML = pageHeader('Données (JSON)', 'Sauvegarde et restauration de la base locale') + `
    <div class="card"><div class="card-body">
      <p class="text-muted">Les données sont stockées dans le navigateur (localStorage). Vous pouvez les exporter dans un fichier JSON, les réimporter, ou tout réinitialiser.</p>
      <div class="d-flex flex-wrap gap-2 mb-3">
        <button class="btn btn-primary" id="export"><i class="bi bi-download me-1"></i>Exporter database.json</button>
        <label class="btn btn-outline-primary mb-0"><i class="bi bi-upload me-1"></i>Importer un fichier<input type="file" id="import" accept="application/json" hidden></label>
        <button class="btn btn-outline-danger" id="reset"><i class="bi bi-arrow-counterclockwise me-1"></i>Réinitialiser</button>
      </div>
      <textarea class="form-control font-monospace" rows="14" id="json" readonly></textarea>
    </div></div>`;
  const ta = c.querySelector('#json');
  const refresh = () => { import('./db.js').then(m => ta.value = m.exportJson()); };
  refresh();
  c.querySelector('#export').addEventListener('click', () => import('./db.js').then(m => {
    const blob = new Blob([m.exportJson()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'database.json'; a.click();
  }));
  c.querySelector('#import').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { import('./db.js').then(m => { m.importJson(r.result); toast('Import réussi.'); window.appRender(); }); }
      catch { toast('Fichier JSON invalide.', 'danger'); } };
    r.readAsText(file);
  });
  c.querySelector('#reset').addEventListener('click', () => {
    if (!confirmAction('Réinitialiser toutes les données ? Cette action est irréversible.')) return;
    import('./db.js').then(m => { m.resetDb(); toast('Données réinitialisées.'); location.hash = '#/dashboard'; window.appRender(); });
  });
}

// ---------------------------------------------------------------------------
//  Modale Bootstrap réutilisable
// ---------------------------------------------------------------------------
function showModal(title, bodyHtml, onSave) {
  let host = document.getElementById('modal-host');
  if (host) host.remove();
  host = document.createElement('div');
  host.id = 'modal-host';
  host.innerHTML = `<div class="modal fade" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">${esc(title)}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">${bodyHtml}</div>
    <div class="modal-footer"><button class="btn btn-light" data-bs-dismiss="modal">Annuler</button>
      <button class="btn btn-primary" id="modal-save">Enregistrer</button></div>
  </div></div></div>`;
  document.body.appendChild(host);
  const modalEl = host.querySelector('.modal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  host.querySelector('#modal-save').addEventListener('click', () => { if (onSave() !== false) modal.hide(); });
  modalEl.addEventListener('hidden.bs.modal', () => host.remove());
}
