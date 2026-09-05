# Gestion de Stock — version Web (HTML / CSS / JS)

Réécriture **100 % navigateur** de l'application de gestion de stock par palettes.
Aucun serveur, aucune base SQL : les données sont un **JSON stocké dans le navigateur**
(`localStorage`), avec import/export vers un fichier `database.json`.

## Lancer l'application

⚠️ **Ne pas ouvrir `index.html` par double-clic** : les navigateurs bloquent les
modules JavaScript sur le protocole `file://` (la page resterait blanche).
Il faut un petit serveur local (2 secondes à mettre en place) :

**Option 1 — le plus simple (Windows) :** double-cliquez sur **`start.bat`**.
Il démarre un serveur (Python ou Node.js) et ouvre le navigateur automatiquement.

**Option 2 — VS Code :** installez l'extension *Live Server*, clic droit sur
`index.html` → *Open with Live Server*.

**Option 3 — ligne de commande :**
```bash
python -m http.server 8123
#   puis ouvrir http://localhost:8123
```

## Connexion (démo)

- **E-mail :** `admin@gestionstock.local`
- **Mot de passe :** `Admin@123456`

## Fonctionnalités

- **Tableau de bord** : KPI + graphique des palettes par zone.
- **Opérations** : Scanner (caméra/manuel), Entrée de stock (poids auto),
  Étiquettes QR imprimables, Sortie de stock, Transfert de zone.
- **Stock & Rapports** : Stock actuel (filtre, blocage/déblocage), Détails &
  historique de palette, Rapports entrées/sorties (imprimables).
- **Configuration** (Admin/Superviseur) : Clients, Produits, Zones.
- **Administration** (Admin) : Utilisateurs & rôles, Journal d'audit,
  Données JSON (export / import / réinitialisation).

## Où sont mes données ?

Dans le navigateur, sur **cette machine et ce navigateur uniquement**. Pour
sauvegarder ou transférer vers un autre poste : menu **Données (JSON)** →
*Exporter database.json*, puis *Importer un fichier* sur l'autre poste.

## Règles métier conservées (identiques à la version C#)

- Stock **client** : client obligatoire à l'entrée, repris automatiquement à la sortie.
- Stock **propre (achat)** : client facultatif à l'entrée, **obligatoire à la sortie**.
- Numérotation `PAL-{année}-{000000}`. Le QR ne contient que ce numéro.
- Une palette sortie/bloquée/annulée ne peut pas sortir de nouveau.

## Sécurité

La connexion est **locale et non sécurisée** (mot de passe en clair dans le JSON) :
c'est une démo côté navigateur, pas une vraie authentification. Ne pas utiliser
pour des données sensibles réelles sans un vrai serveur.

## Hébergement

Comme c'est du statique, ce dossier **peut** être publié gratuitement sur
**GitHub Pages**, Netlify, Vercel, etc. (contrairement à la version C# qui
nécessitait un serveur). Chaque visiteur aura sa propre base locale.
