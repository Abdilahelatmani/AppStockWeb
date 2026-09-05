// ============================================================================
//  app.js — Coquille de l'application : layout, routeur par hash (#/route),
//  authentification. Rend l'écran de connexion ou l'admin selon la session.
// ============================================================================

import { currentUser, logout, isAdmin, isSupervisor } from './services.js';
import { esc } from './ui.js';
import * as pages from './pages.js';

// -------- Définition des routes --------
// render(container, params) ; roles = rôles autorisés (vide = tous connectés).
const routes = {
  'dashboard':    { render: pages.dashboard,   title: 'Tableau de bord' },
  'scan':         { render: pages.scan,        title: 'Scanner' },
  'entry':        { render: pages.stockEntry,  title: 'Entrée de stock' },
  'labels':       { render: pages.labels,      title: 'Étiquettes QR' },
  'exit':         { render: pages.stockExit,   title: 'Sortie de stock' },
  'transfer':     { render: pages.transfer,    title: 'Transfert' },
  'stock':        { render: pages.stock,       title: 'Stock actuel' },
  'reports-in':   { render: (c) => pages.reports(c, 'in'),  title: 'Rapport entrées' },
  'reports-out':  { render: (c) => pages.reports(c, 'out'), title: 'Rapport sorties' },
  'history':      { render: pages.history,     title: 'Historique palette' },
  'palette':      { render: pages.paletteDetails, title: 'Détails palette' },
  'label':        { render: pages.labelPrint,  title: 'Étiquette' },
  'clients':      { render: pages.clients,     title: 'Clients',  roles: ['ADMIN', 'SUPERVISOR'] },
  'products':     { render: pages.products,    title: 'Produits', roles: ['ADMIN', 'SUPERVISOR'] },
  'zones':        { render: pages.zones,       title: 'Zones',    roles: ['ADMIN', 'SUPERVISOR'] },
  'users':        { render: pages.users,       title: 'Utilisateurs', roles: ['ADMIN'] },
  'audit':        { render: pages.audit,       title: "Journal d'audit", roles: ['ADMIN'] },
  'settings':     { render: pages.settings,    title: 'Données (JSON)' }
};

// -------- Menu (miroir de _Layout.cshtml) --------
const menu = [
  { label: 'Navigation' },
  { route: 'dashboard', icon: 'bi-speedometer2', text: 'Tableau de bord' },
  { label: 'Opérations' },
  { route: 'scan', icon: 'bi-qr-code-scan', text: 'Scanner' },
  { route: 'entry', icon: 'bi-box-arrow-in-down', text: 'Entrée de stock' },
  { route: 'labels', icon: 'bi-printer', text: 'Étiquettes QR' },
  { route: 'exit', icon: 'bi-box-arrow-up', text: 'Sortie de stock' },
  { route: 'transfer', icon: 'bi-arrow-left-right', text: 'Transfert' },
  { label: 'Stock & Rapports' },
  { route: 'stock', icon: 'bi-list-ul', text: 'Stock actuel' },
  { route: 'reports-in', icon: 'bi-graph-up', text: 'Rapport entrées' },
  { route: 'reports-out', icon: 'bi-graph-down', text: 'Rapport sorties' },
  { route: 'history', icon: 'bi-clock-history', text: 'Historique palette' },
  { label: 'Configuration', roles: ['ADMIN', 'SUPERVISOR'] },
  { route: 'clients', icon: 'bi-people', text: 'Clients', roles: ['ADMIN', 'SUPERVISOR'] },
  { route: 'products', icon: 'bi-tag', text: 'Produits', roles: ['ADMIN', 'SUPERVISOR'] },
  { route: 'zones', icon: 'bi-grid-3x3-gap', text: 'Zones', roles: ['ADMIN', 'SUPERVISOR'] },
  { route: 'users', icon: 'bi-person-badge', text: 'Utilisateurs', roles: ['ADMIN'] },
  { route: 'audit', icon: 'bi-shield-check', text: "Journal d'audit", roles: ['ADMIN'] },
  { route: 'settings', icon: 'bi-database', text: 'Données (JSON)', roles: ['ADMIN'] }
];

const roleLabel = { ADMIN: 'Administrateur', SUPERVISOR: 'Superviseur', WAREHOUSE_OPERATOR: 'Opérateur', VIEWER: 'Utilisateur' };

function canSee(item) {
  if (!item.roles) return true;
  const u = currentUser();
  return u && item.roles.includes(u.role);
}

// -------- Parsing de la route : #/route/param --------
function parseHash() {
  const h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  return { name: name || 'dashboard', params: rest };
}

// -------- Rendu principal --------
function render() {
  const app = document.getElementById('app');
  const user = currentUser();

  if (!user) { pages.login(app, render); return; }

  const { name, params } = parseHash();
  const route = routes[name] || routes['dashboard'];

  if (route.roles && !route.roles.includes(user.role)) {
    app.querySelector('#page-content')?.replaceChildren();
    renderShell(app, user, name);
    document.getElementById('page-content').innerHTML =
      `<div class="alert alert-danger">Accès refusé : vous n'avez pas les droits pour cette page.</div>`;
    return;
  }

  renderShell(app, user, name);
  const container = document.getElementById('page-content');
  try {
    route.render(container, params);
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">Erreur : ${esc(e.message)}</div>`;
  }
}

function renderShell(app, user, activeRoute) {
  const initials = (user.fullName || user.email || '?').charAt(0).toUpperCase();
  const menuHtml = menu.map(item => {
    if (item.label) return canSee(item) ? `<div class="menu-label">${esc(item.label)}</div>` : '';
    if (!canSee(item)) return '';
    const active = item.route === activeRoute ? 'active' : '';
    return `<a class="nav-link ${active}" href="#/${item.route}"><i class="bi ${item.icon}"></i><span>${esc(item.text)}</span></a>`;
  }).join('');

  app.innerHTML = `
    <div class="startbar">
      <div class="brand"><a class="logo" href="#/dashboard"><i class="bi bi-box-seam"></i><span>Gestion Stock</span></a></div>
      <div class="startbar-menu">${menuHtml}</div>
    </div>
    <div class="startbar-overlay" id="overlay"></div>
    <div class="topbar">
      <div class="d-flex align-items-center gap-2">
        <button class="btn-icon d-lg-none" id="menu-toggle"><i class="bi bi-list"></i></button>
        <a class="btn btn-sm btn-soft-primary" href="#/entry"><i class="bi bi-plus-lg me-1"></i>Nouvelle entrée</a>
      </div>
      <div class="d-flex align-items-center gap-3">
        <form class="app-search d-none d-md-block" id="topsearch">
          <input class="form-control form-control-sm" type="search" placeholder="Rechercher palette (PAL-...)">
        </form>
        <div class="dropdown">
          <a class="text-decoration-none dropdown-toggle" href="#" data-bs-toggle="dropdown">
            <span class="avatar">${esc(initials)}</span>
          </a>
          <div class="dropdown-menu dropdown-menu-end">
            <div class="px-3 py-2 border-bottom"><div class="fw-semibold">${esc(user.fullName || user.email)}</div>
              <small class="text-muted">${esc(roleLabel[user.role] || 'Utilisateur')}</small></div>
            <a class="dropdown-item text-danger" href="#" id="logout"><i class="bi bi-power me-1"></i>Déconnexion</a>
          </div>
        </div>
      </div>
    </div>
    <div class="page-wrapper"><div class="page-content" id="page-content"></div></div>`;

  // Événements de la coquille
  document.getElementById('logout').addEventListener('click', (e) => { e.preventDefault(); logout(); location.hash = '#/dashboard'; render(); });
  document.getElementById('menu-toggle')?.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  document.getElementById('overlay')?.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
  document.querySelectorAll('.startbar .nav-link').forEach(a => a.addEventListener('click', () => document.body.classList.remove('sidebar-open')));
  document.getElementById('topsearch')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.querySelector('input').value.trim();
    location.hash = q ? `#/stock/${encodeURIComponent(q)}` : '#/stock';
  });
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

// Exposé pour les gestionnaires inline des pages.
window.appRender = render;
