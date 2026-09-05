// ============================================================================
//  services.js — Logique métier (miroir de PaletteService/AuditService C#).
//  Toutes les règles de validation et de mouvement sont ici.
//  Script classique (pas de module) — expose sur window.App.
// ============================================================================
(function (App) {
'use strict';
const { db, save, nextId, StockType, PaletteStatus, MovementType, Roles } = App;

// -------- Erreur métier avec message utilisateur (comme AppException) --------
class AppError extends Error {}

// -------- Session / authentification (locale, non sécurisée) --------
const SESSION_KEY = 'gestion_stock_session';

function currentUser() {
  const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function login(email, password, remember) {
  const u = db().users.find(x => x.email.toLowerCase() === (email || '').toLowerCase().trim());
  if (!u || u.password !== password) throw new AppError('E-mail ou mot de passe incorrect.');
  if (!u.isActive) throw new AppError('Ce compte est désactivé.');
  const session = { id: u.id, email: u.email, fullName: u.fullName, role: u.role };
  const store = remember ? localStorage : sessionStorage;
  store.setItem(SESSION_KEY, JSON.stringify(session));
  audit('Login', 'User', u.id, `Connexion de ${u.email}.`);
  return session;
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

function isInRole(...roles) {
  const u = currentUser();
  return !!u && roles.includes(u.role);
}
const isAdmin = () => isInRole(Roles.Admin);
const isSupervisor = () => isInRole(Roles.Supervisor);

// -------- Audit --------
function audit(action, entity, entityId, description) {
  const u = currentUser();
  db().audits.push({
    id: nextId('audit'), action, entity, entityId: entityId != null ? String(entityId) : null,
    description, userId: u?.id, userName: u?.email, timestamp: new Date().toISOString()
  });
  save();
}

// -------- Numérotation des palettes : PAL-{année}-{000000} --------
function generatePaletteNumber(forDate) {
  const year = new Date(forDate).getFullYear();
  const prefix = `PAL-${year}-`;
  const last = db().palettes
    .filter(p => p.paletteNumber.startsWith(prefix))
    .map(p => parseInt(p.paletteNumber.slice(prefix.length), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => b - a)[0] || 0;
  return prefix + String(last + 1).padStart(6, '0');
}

// -------- Recherche --------
function findClient(id) { return db().clients.find(c => c.id === +id); }
function findProduct(id) { return db().products.find(p => p.id === +id); }
function findZone(id) { return db().zones.find(z => z.id === +id); }
function findPalette(id) { return db().palettes.find(p => p.id === +id); }

function findByQr(qr) {
  qr = (qr || '').trim();
  if (!qr) return null;
  return db().palettes.find(p => p.qrCode === qr || p.paletteNumber === qr) || null;
}

// -------- Entrée en stock --------
function createEntry(dto) {
  const product = findProduct(dto.productId);
  if (!product) throw new AppError('Produit introuvable.');
  if (!product.isActive) throw new AppError('Le produit sélectionné est inactif.');

  const zone = findZone(dto.zoneId);
  if (!zone) throw new AppError('Zone de stockage introuvable.');
  if (!zone.isActive) throw new AppError('La zone de stockage sélectionnée est inactive.');

  if (!(dto.numberOfCartons > 0)) throw new AppError('Le nombre de cartons doit être supérieur à zéro.');
  if (!(dto.totalWeight > 0)) throw new AppError('Le poids total doit être supérieur à zéro.');

  if (dto.stockType === StockType.ClientStock && !dto.clientId)
    throw new AppError('Le client est obligatoire pour un stock client.');

  if (dto.clientId) {
    const c = findClient(dto.clientId);
    if (!c) throw new AppError('Client introuvable.');
    if (!c.isActive) throw new AppError('Le client sélectionné est inactif.');
  }

  const u = currentUser();
  const now = new Date().toISOString();
  const number = generatePaletteNumber(dto.entryDate || now);
  const palette = {
    id: nextId('palette'),
    paletteNumber: number, qrCode: number,
    stockType: dto.stockType, status: PaletteStatus.InStock,
    productId: dto.productId, clientId: dto.clientId || null,
    numberOfCartons: dto.numberOfCartons, unitWeight: dto.unitWeight || null,
    totalWeight: dto.totalWeight,
    remainingCartons: dto.numberOfCartons, remainingWeight: dto.totalWeight,
    currentZoneId: dto.zoneId,
    entryDate: dto.entryDate || now, exitDate: null, exitClientId: null,
    notes: dto.notes || null,
    isLabelPrinted: false, lastPrintedAt: null, printCount: 0,
    createdBy: u?.id, createdAt: now, updatedBy: null, updatedAt: null
  };
  db().palettes.push(palette);
  addMovement(palette.id, MovementType.Entry, { newZoneId: dto.zoneId, newClientId: dto.clientId, numberOfCartons: dto.numberOfCartons, weight: dto.totalWeight, comment: 'Entrée en stock' });
  audit('PaletteCreated', 'Palette', palette.id, `Palette ${number} créée (${dto.numberOfCartons} cartons, ${dto.totalWeight} kg).`);
  save();
  return palette;
}

// -------- Sortie de stock --------
function exitPalette(dto) {
  const p = findPalette(dto.paletteId);
  if (!p) throw new AppError('Palette introuvable.');
  if (p.status === PaletteStatus.Exited) throw new AppError("Cette palette est déjà sortie de l'entrepôt.");
  if (p.status === PaletteStatus.Blocked) throw new AppError('Cette palette est bloquée et ne peut pas sortir.');
  if (p.status === PaletteStatus.Cancelled) throw new AppError('Cette palette est annulée.');
  if (p.status !== PaletteStatus.InStock) throw new AppError("Cette palette n'est pas disponible pour une sortie.");

  let exitClientId;
  if (p.stockType === StockType.ClientStock) {
    exitClientId = p.clientId;
    if (!exitClientId) throw new AppError('Client d\'origine manquant pour ce stock client.');
  } else {
    if (!dto.exitClientId) throw new AppError('Veuillez sélectionner le client destinataire pour cette sortie.');
    const c = findClient(dto.exitClientId);
    if (!c) throw new AppError('Client destinataire introuvable.');
    if (!c.isActive) throw new AppError('Le client destinataire est inactif.');
    exitClientId = +dto.exitClientId;
  }

  const previousClientId = p.clientId;
  const now = new Date().toISOString();
  p.status = PaletteStatus.Exited; p.exitDate = now; p.exitClientId = exitClientId;
  p.remainingCartons = 0; p.remainingWeight = 0;
  p.updatedBy = currentUser()?.id; p.updatedAt = now;
  addMovement(p.id, MovementType.Exit, { previousZoneId: p.currentZoneId, previousClientId, newClientId: exitClientId, numberOfCartons: p.numberOfCartons, weight: p.totalWeight, comment: dto.comment || 'Sortie complète' });
  audit('PaletteExited', 'Palette', p.id, `Palette ${p.paletteNumber} sortie (client ${exitClientId}).`);
  save();
  return p;
}

// -------- Transfert de zone --------
function transferPalette(dto) {
  const p = findPalette(dto.paletteId);
  if (!p) throw new AppError('Palette introuvable.');
  if (p.status === PaletteStatus.Exited) throw new AppError("Cette palette est déjà sortie de l'entrepôt.");
  if (p.status === PaletteStatus.Blocked) throw new AppError('Cette palette est bloquée.');
  if (p.status === PaletteStatus.Cancelled) throw new AppError('Cette palette est annulée.');
  if (+dto.newZoneId === p.currentZoneId) throw new AppError('La palette se trouve déjà dans cette zone.');

  const zone = findZone(dto.newZoneId);
  if (!zone) throw new AppError('Zone de destination introuvable.');
  if (!zone.isActive) throw new AppError('La zone de destination est inactive.');

  const previousZoneId = p.currentZoneId;
  const now = new Date().toISOString();
  p.currentZoneId = +dto.newZoneId; p.status = PaletteStatus.InStock;
  p.updatedBy = currentUser()?.id; p.updatedAt = now;
  addMovement(p.id, MovementType.Transfer, { previousZoneId, newZoneId: +dto.newZoneId, comment: dto.comment || 'Transfert de zone' });
  audit('PaletteTransferred', 'Palette', p.id, `Palette ${p.paletteNumber} transférée (zone ${previousZoneId} -> ${dto.newZoneId}).`);
  save();
  return p;
}

// -------- Blocage / déblocage --------
function setBlocked(paletteId, block, comment) {
  const p = findPalette(paletteId);
  if (!p) throw new AppError('Palette introuvable.');
  if (p.status === PaletteStatus.Exited) throw new AppError("Cette palette est déjà sortie de l'entrepôt.");
  if (p.status === PaletteStatus.Cancelled) throw new AppError('Cette palette est annulée.');
  if (block) {
    if (p.status === PaletteStatus.Blocked) throw new AppError('Cette palette est déjà bloquée.');
    p.status = PaletteStatus.Blocked;
  } else {
    if (p.status !== PaletteStatus.Blocked) throw new AppError("Cette palette n'est pas bloquée.");
    p.status = PaletteStatus.InStock;
  }
  const now = new Date().toISOString();
  p.updatedBy = currentUser()?.id; p.updatedAt = now;
  addMovement(p.id, block ? MovementType.Block : MovementType.Unblock, { previousZoneId: p.currentZoneId, newZoneId: p.currentZoneId, comment: comment || (block ? 'Palette bloquée' : 'Palette débloquée') });
  audit(block ? 'PaletteBlocked' : 'PaletteUnblocked', 'Palette', p.id, `Palette ${p.paletteNumber} ${block ? 'bloquée' : 'débloquée'}.`);
  save();
  return p;
}

// -------- Étiquette imprimée --------
function markLabelPrinted(paletteId) {
  const p = findPalette(paletteId);
  if (!p) return;
  p.isLabelPrinted = true; p.lastPrintedAt = new Date().toISOString(); p.printCount = (p.printCount || 0) + 1;
  save();
}

function addMovement(paletteId, type, extra) {
  const u = currentUser();
  db().movements.push(Object.assign({
    id: nextId('movement'), paletteId, movementType: type, movementDate: new Date().toISOString(),
    previousZoneId: null, newZoneId: null, previousClientId: null, newClientId: null,
    numberOfCartons: null, weight: null, userId: u?.id, userName: u?.email, comment: null
  }, extra));
}

function movementsFor(paletteId) {
  return db().movements.filter(m => m.paletteId === +paletteId).sort((a, b) => new Date(a.movementDate) - new Date(b.movementDate));
}

// -------- Exposition sur window.App (regroupé sous App.svc + AppError) --------
App.AppError = AppError;
App.svc = {
  currentUser, login, logout, isInRole, isAdmin, isSupervisor, audit,
  generatePaletteNumber, findClient, findProduct, findZone, findPalette, findByQr,
  createEntry, exitPalette, transferPalette, setBlocked, markLabelPrinted, movementsFor
};

})(window.App);
