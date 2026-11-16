# Organisation TNF

Espace de travail des équipes **The New Face**, inspiré de Discord :
organisation → serveurs → salons du serveur + projets (Logitech, Pussi…) → salons du projet.
Chaque projet a son chat, son kanban (Tâches), son tableau blanc (Tableau) et sa revue des rendus (Revues).
On ne voit que les projets auxquels on est affecté.

Stack : Next.js 15 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, RLS, Realtime, Storage).

## Installation

1. **Variables d'environnement** : copier `.env.example` en `.env.local` et remplir l'URL et la clé
   publishable du projet Supabase (Project Settings → API).

2. **Base de données** : appliquer les migrations de `supabase/migrations/` dans l'ordre des noms
   (001 → 011), soit via la CLI (`npx supabase link` puis `npx supabase db push`),
   soit en collant chaque fichier dans le SQL Editor.

3. **Auth Supabase** (Authentication → Sign In / Providers) :
   - désactiver « Allow new users to sign up » (accès sur invitation uniquement) ;
   - ajouter `http://localhost:3000/auth/callback` dans les Redirect URLs.

4. **Premier compte** : créer ton utilisateur dans Authentication → Users → Add user.
   Le tout premier compte devient automatiquement **owner** de l'organisation.

5. **Données de démo** : lancer `supabase/seed.sql` dans le SQL Editor
   (4 serveurs, rôles Admin/Lead, projets Logitech / Pussi / Louis Vuitton dans UE5).

6. `npm install` puis `npm run dev` → http://localhost:3000

## Mise en ligne (Vercel)

1. Sur https://vercel.com/new, importer le dépôt GitHub `tnf-organisation` (framework détecté : Next.js).
2. Dans **Environment Variables**, ajouter (Production + Preview) :

   | Variable | Valeur |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé publishable (`sb_publishable_…`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | clé secrète (`sb_secret_…`) — jamais ailleurs que côté serveur |
   | `NEXT_PUBLIC_SITE_URL` | URL publique du site, ex. `https://organisation.thenewface.io` |
   | `RESEND_API_KEY`, `RESEND_FROM` | facultatif : envoi automatique des invitations |

3. **Deploy**. Ensuite chaque `git push` sur `main` redéploie automatiquement.
4. **Supabase → Authentication → URL Configuration** :
   - *Site URL* : l'URL publique du site ;
   - *Redirect URLs* : ajouter `https://<url-publique>/auth/callback` (garder celle de localhost pour le dev).
5. **Domaine** (facultatif) : Vercel → Settings → Domains → ajouter `organisation.thenewface.io`,
   puis créer chez le registrar du domaine l'enregistrement DNS indiqué par Vercel (CNAME).
   Mettre à jour `NEXT_PUBLIC_SITE_URL` et les URLs Supabase avec ce domaine, puis redéployer.
6. **E-mails Supabase** (lien magique) : le serveur d'envoi intégré de Supabase est très limité.
   Pour un usage en équipe, configurer un SMTP (ex. Resend) dans Authentication → Emails → SMTP Settings.
   Les invitations par lien copié et la connexion par mot de passe fonctionnent sans cela.

## Architecture

```
supabase/migrations/   schéma, permissions, RLS (source de vérité de la sécurité)
src/lib/permissions.ts bits de permissions (miroir de private.perm())
src/lib/data.ts        lectures côté serveur, filtrées par la RLS
src/app/(auth)/        connexion (mot de passe, lien magique)
src/app/(app)/s/[serverId]/(home)/            salons du serveur
src/app/(app)/s/[serverId]/p/[projectId]/board        kanban (Tâches)
src/app/(app)/s/[serverId]/p/[projectId]/whiteboard   tableau blanc Excalidraw
src/app/(app)/s/[serverId]/p/[projectId]/reviews      revue des rendus
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
- [x] Phase 3 — outils maison par projet : kanban « Tâches » (remplace Trello) et tableau blanc
  collaboratif « Tableau » basé sur Excalidraw (open source, MIT — remplace Miro)
- [x] Phase 4 — mentions @ (et @everyone), notifications temps réel, pièces jointes (images, vidéos,
  fichiers jusqu'à 50 Mo), recherche plein texte (Ctrl+K)
- [x] Revues — rendus vidéo/image versionnés, lecteur image par image, commentaires horodatés,
  annotations dessinées, statut (en revue / corrections / approuvé), ouvert aux clients
- [x] Confort du chat — salons non lus (gras, pastilles, mentions), réactions emoji, fils de discussion

### Taille des rendus

Le plan gratuit de Supabase limite chaque fichier à 50 Mo. En plan Pro, relever la limite dans
Storage → Settings, puis indiquer la nouvelle valeur dans `.env.local` :
`NEXT_PUBLIC_MAX_REVIEW_UPLOAD_MB=500`. Pour la vidéo, le MP4 (H.264) est lu par tous les navigateurs.
