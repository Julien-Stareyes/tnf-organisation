# Organisation TNF

Espace de travail des équipes **The New Face**, inspiré de Discord :
organisation → serveurs → salons du serveur + projets (Logitech, Pussi…) → salons du projet.
Chaque projet a son Miro et son Trello. On ne voit que les projets auxquels on est affecté.

Stack : Next.js 15 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, RLS, Realtime).

## Installation

1. **Variables d'environnement** : copier `.env.example` en `.env.local` et remplir l'URL et la clé
   publishable du projet Supabase (Project Settings → API).

2. **Base de données** : appliquer les migrations dans l'ordre, soit via la CLI
   (`npx supabase link` puis `npx supabase db push`), soit en collant chaque fichier dans le SQL Editor :
   - `supabase/migrations/20261027000001_schema.sql` (tables)
   - `supabase/migrations/20261027000002_permissions.sql` (calcul des permissions, triggers)
   - `supabase/migrations/20261027000003_rls.sql` (règles d'accès)

3. **Auth Supabase** (Authentication → Sign In / Providers) :
   - désactiver « Allow new users to sign up » (accès sur invitation uniquement) ;
   - ajouter `http://localhost:3000/auth/callback` dans les Redirect URLs.

4. **Premier compte** : créer ton utilisateur dans Authentication → Users → Add user.
   Le tout premier compte devient automatiquement **owner** de l'organisation.

5. **Données de démo** : lancer `supabase/seed.sql` dans le SQL Editor
   (4 serveurs, rôles Admin/Lead, projets Logitech / Pussi / Louis Vuitton dans UE5).

6. `npm install` puis `npm run dev` → http://localhost:3000

## Architecture

```
supabase/migrations/   schéma, permissions, RLS (source de vérité de la sécurité)
src/lib/permissions.ts bits de permissions (miroir de private.perm())
src/lib/data.ts        lectures côté serveur, filtrées par la RLS
src/app/(auth)/        connexion (mot de passe, lien magique)
src/app/(app)/s/[serverId]/(home)/            salons du serveur
src/app/(app)/s/[serverId]/p/[projectId]/     projet : salons, Miro, Trello
```

### Permissions (modèle Discord)

Calcul dans `private.channel_permissions()` :
owner/admin de l'org → tout · rôles du serveur (`@everyone` + rôles) · ADMINISTRATOR → tout ·
salon de projet : affectation obligatoire, bonus du lead, exceptions du projet ·
exceptions du salon (`@everyone` → rôles → membre) · sans « Voir le salon », aucun droit.
Les invités (`guest`, ex. clients) ne voient jamais les salons du serveur, seulement leurs projets.

## Feuille de route

- [x] Phase 0 — socle : schéma, permissions, RLS, auth, navigation serveur → projet → salon
- [x] Phase 1 — chat temps réel, création serveurs/projets/salons, invitations par mail, rôles
- [x] Phase 2 — exceptions de permissions par salon, salons privés, visibilité clients, éditeur de rôles, journal d'audit
- [ ] Phase 3 — aperçu Trello via API (les liens Miro / Trello sont déjà réglables par projet)
- [ ] Phase 4 — mentions, notifications, recherche, fils, pièces jointes
