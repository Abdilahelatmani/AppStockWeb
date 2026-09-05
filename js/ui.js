// ============================================================================
//  ui.js — Aides d'interface partagées (toasts, badges, formats, échappement).
//  Script classique (pas de module) — expose sur window.App.
// ============================================================================
(function (App) {
'use strict';
const { PaletteStatus, StockType, MovementType } = App;

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

// -------- Libellés --------
const statusLabel = {
  [PaletteStatus.InStock]: 'En stock',
  [PaletteStatus.Exited]: 'Sortie',
  [PaletteStatus.Blocked]: 'Bloquée',
  [PaletteStatus.InTransfer]: 'En transfert',
  [PaletteStatus.Cancelled]: 'Annulée'
};
const statusClass = {
  [PaletteStatus.InStock]: 'bg-success',
  [PaletteStatus.Exited]: 'bg-secondary',
  [PaletteStatus.Blocked]: 'bg-danger',
  [PaletteStatus.InTransfer]: 'bg-warning text-dark',
  [PaletteStatus.Cancelled]: 'bg-dark'
};
function statusBadge(status) {
  return `<span class="badge ${statusClass[status] || 'bg-secondary'}">${esc(statusLabel[status] || '?')}</span>`;
}

const stockTypeLabel = {
  [StockType.ClientStock]: 'Stock client',
  [StockType.PurchaseStock]: 'Stock propre (achat)'
};

const movementLabel = {
  [MovementType.Entry]: 'Entrée', [MovementType.Transfer]: 'Transfert', [MovementType.Exit]: 'Sortie',
  [MovementType.Block]: 'Blocage', [MovementType.Unblock]: 'Déblocage', [MovementType.Adjustment]: 'Ajustement',
  [MovementType.Modification]: 'Modification', [MovementType.Cancellation]: 'Annulation'
};

// -------- Toasts --------
function toast(message, type = 'success') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-container position-fixed top-0 end-0 p-3';
    host.style.zIndex = '1090';
    document.body.appendChild(host);
  }
  const colors = { success: 'text-bg-success', danger: 'text-bg-danger', warning: 'text-bg-warning', info: 'text-bg-info' };
  const el = document.createElement('div');
  el.className = `toast align-items-center ${colors[type] || colors.info} border-0 show`;
  el.role = 'alert';
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(message)}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 5000);
  el.querySelector('.btn-close').addEventListener('click', () => el.remove());
}

// -------- En-tête de page --------
function pageHeader(title, subtitle, actionsHtml = '') {
  return `<div class="d-flex flex-wrap justify-content-between align-items-center mb-3">
    <div><h4 class="mb-0">${esc(title)}</h4>${subtitle ? `<small class="text-muted">${esc(subtitle)}</small>` : ''}</div>
    <div class="d-flex gap-2">${actionsHtml}</div></div>`;
}

// -------- Confirmation simple --------
function confirmAction(message) {
  return window.confirm(message);
}

// -------- Exposition --------
App.esc = esc; App.fmtDate = fmtDate; App.fmtNum = fmtNum;
App.statusLabel = statusLabel; App.statusClass = statusClass; App.statusBadge = statusBadge;
App.stockTypeLabel = stockTypeLabel; App.movementLabel = movementLabel;
App.toast = toast; App.pageHeader = pageHeader; App.confirmAction = confirmAction;

})(window.App);
