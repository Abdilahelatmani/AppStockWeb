// ============================================================================
//  db.js — « Base de données » JSON stockée dans le localStorage du navigateur.
//  Aucune dépendance serveur. Toutes les données (palettes, clients, produits,
//  zones, mouvements, utilisateurs, audit) sont conservées en un seul objet JSON.
// ============================================================================

const STORAGE_KEY = 'gestion_stock_db_v1';

// -------- Enumérations (miroir de l'application C#) --------
export const StockType = { ClientStock: 1, PurchaseStock: 2 };
export const PaletteStatus = { InStock: 1, Exited: 2, Blocked: 3, InTransfer: 4, Cancelled: 5 };
export const MovementType = { Entry: 1, Transfer: 2, Exit: 3, Block: 4, Unblock: 5, Adjustment: 6, Modification: 7, Cancellation: 8 };

export const Roles = { Admin: 'ADMIN', Supervisor: 'SUPERVISOR', Operator: 'WAREHOUSE_OPERATOR', Viewer: 'VIEWER' };

// -------- Données initiales (seed), identiques au DbSeeder d'origine --------
function seed() {
  const now = new Date().toISOString();
  return {
    _seq: { client: 2, product: 3, zone: 4, palette: 0, movement: 0, audit: 0 },
    users: [
      { id: 'u1', email: 'admin@gestionstock.local', password: 'Admin@123456', fullName: 'Administrateur', role: Roles.Admin, isActive: true, createdAt: now }
    ],
    clients: [
      { id: 1, code: 'CLI-001', name: 'Client A', phone: '0600000001', contactPerson: 'Responsable A', ice: '', if: '', isActive: true, createdAt: now },
      { id: 2, code: 'CLI-002', name: 'Client B', phone: '0600000002', contactPerson: 'Responsable B', ice: '', if: '', isActive: true, createdAt: now }
    ],
    products: [
      { id: 1, code: 'PRD-001', name: 'Sardine', category: 'Conserve', unit: 'KG', standardCartonWeight: 25, isActive: true, createdAt: now },
      { id: 2, code: 'PRD-002', name: 'Thon', category: 'Conserve', unit: 'KG', standardCartonWeight: 20, isActive: true, createdAt: now },
      { id: 3, code: 'PRD-003', name: 'Maquereau', category: 'Conserve', unit: 'KG', standardCartonWeight: 22, isActive: true, createdAt: now }
    ],
    zones: [
      { id: 1, code: 'ZONE-A', name: 'Zone A', capacity: 100, description: 'Zone de stockage A', isActive: true, createdAt: now },
      { id: 2, code: 'ZONE-B', name: 'Zone B', capacity: 100, description: 'Zone de stockage B', isActive: true, createdAt: now },
      { id: 3, code: 'ZONE-C', name: 'Zone C', capacity: 100, description: 'Zone de stockage C', isActive: true, createdAt: now },
      { id: 4, code: 'QUAI', name: 'Quai de réception', capacity: 20, description: "Zone tampon d'entrée", isActive: true, createdAt: now }
    ],
    palettes: [],
    movements: [],
    audits: []
  };
}

// -------- Chargement / sauvegarde --------
let _db = null;

export function load() {
  if (_db) return _db;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { _db = JSON.parse(raw); }
    catch { _db = seed(); save(); }
  } else {
    _db = seed();
    save();
  }
  return _db;
}

export function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_db));
}

export function db() { return load(); }

export function nextId(kind) {
  const d = load();
  d._seq[kind] = (d._seq[kind] || 0) + 1;
  return d._seq[kind];
}

// -------- Import / export du fichier JSON (sauvegarde/restauration) --------
export function exportJson() {
  return JSON.stringify(load(), null, 2);
}

export function importJson(text) {
  const parsed = JSON.parse(text); // lève une erreur si invalide
  _db = parsed;
  save();
}

export function resetDb() {
  _db = seed();
  save();
}
