# Documentation technique — L'agenda du SNUM

Calendrier d'équipe partagé (verres, activités, sport, repas), avec comptes réservés aux adresses `@culture.gouv.fr` et notifications par email. Ce document décrit l'architecture pour permettre une reprise en main par un·e développeur·se.

> **Maintenance** : ce fichier doit être mis à jour dans le même commit que tout changement d'architecture (nouvelle table, nouvelle intégration externe, nouveau flux d'auth, etc.). Il n'y a pas d'automatisation qui le fait à ta place — si tu ajoutes une fonctionnalité qui change ce document, pense à le modifier toi-même.

## Vue d'ensemble

```
┌─────────────┐   push sur main    ┌──────────────────┐
│  Repo GitHub │ ─────────────────▶ │  GitHub Actions   │
│ (ce dépôt)   │                    │  build + deploy   │
└─────────────┘                    └─────────┬─────────┘
                                              ▼
                                    ┌──────────────────┐
                                    │  GitHub Pages     │
                                    │  (site statique)  │
                                    └─────────┬─────────┘
                                              │ appels API
                                              ▼
                                    ┌──────────────────┐
                                    │  Supabase (prod)  │
                                    │  Auth + Postgres  │
                                    │  + Edge Function  │
                                    │  + pg_cron         │
                                    └─────────┬─────────┘
                                              │ HTTP
                                              ▼
                                    ┌──────────────────┐
                                    │  Brevo (emails)   │
                                    └──────────────────┘
```

- **Frontend** : React 18 + Vite, aucun framework CSS (styles en ligne), déployé comme site statique sur GitHub Pages.
- **Backend** : entièrement sur Supabase — pas de serveur applicatif dédié. Base Postgres, authentification, et une Edge Function (Deno) pour l'envoi d'emails transactionnels.
- **Emails** : deux canaux distincts (voir plus bas) — SMTP Gmail pour les emails d'authentification (Supabase Auth natif), API Brevo pour les notifications applicatives (Edge Function).

## Dépôt et déploiement

- Repo : [github.com/camillejbr/calendrier-snum](https://github.com/camillejbr/calendrier-snum)
- Site en ligne : https://camillejbr.github.io/calendrier-snum/
- **Tout push sur `main` déclenche un déploiement automatique** via `.github/workflows/deploy.yml` (build Vite → `dist/` → GitHub Pages, source configurée sur "GitHub Actions" dans Settings → Pages).
- Pas de CI de tests — il n'y en a pas dans ce projet actuellement.

### Lancer en local

```bash
npm install
npm run dev
```

Par défaut pointe vers le projet Supabase de **production**. Pour tester contre le projet de **staging** (recommandé avant de pousser des changements risqués), copier `.env.local.example` en `.env.local` et renseigner la clé du projet staging.

## Projets Supabase

Deux projets distincts, même organisation :

| | Production | Staging |
|---|---|---|
| Ref | `trwisfwbkalhvnoeltym` | `kukeajqfkrnbgqaiezrj` |
| Usage | Site en ligne | Tests locaux uniquement |
| Edge Function `notify` | ✅ déployée | ❌ non déployée |
| SMTP configuré (emails d'auth) | ✅ | ❌ (limite par défaut Supabase très basse) |
| Trigger restriction `@culture.gouv.fr` | ✅ | ❌ |

Le staging sert uniquement à prévisualiser des changements d'interface/schéma sans toucher aux vraies données d'équipe — il n'a pas toute l'infra d'envoi d'email.

## Frontend — structure

```
src/
  main.jsx               point d'entrée, monte <App/>
  App.jsx                gère la session Supabase, route vers <Auth/> ou <TeamCalendar/>
  Auth.jsx                écrans connexion / inscription / code de confirmation / mot de passe oublié
  TeamCalendar.jsx        calendrier (liste / semaine / mois), CRUD événements, bouton notifications
  NotificationSettings.jsx  modale des préférences email
  supabaseClient.js       client Supabase (URL + clé lues depuis les variables d'env, avec valeurs de prod en fallback)
  index.css               reset global minimal (html/body/#root en 100% de hauteur)
supabase/functions/notify/index.ts   Edge Function (voir plus bas)
```

Pas de routeur (une seule "page"), pas de state manager externe (juste `useState`/`useEffect`).

### Nom affiché

Le nom affiché (organisateur, participants) est dérivé automatiquement de l'email, pas saisi par l'utilisateur : `prenom.nom@culture.gouv.fr` → **"Prénom N."** (fonction `displayNameFromEmail` dans `TeamCalendar.jsx`, dupliquée en TypeScript dans l'Edge Function). Un éventuel 3ᵉ segment (`prenom.nom.ext@...`, pour désambiguïser des homonymes) est ignoré.

## Base de données (schéma `public`)

### `events`
| Colonne | Type | Notes |
|---|---|---|
| id | uuid | PK, `gen_random_uuid()` |
| title, type, date, time, location, description | | `type` ∈ `verre / activite / sport / repas` |
| max_attendees, price | | optionnels |
| host | text | nom affiché au moment de la création (snapshot, pas une relation live) |
| host_id | uuid | FK → `auth.users`, `default auth.uid()` — **peut être `null`** pour les événements créés avant l'ajout de cette colonne |
| attendees | text[] | liste de noms affichés (pas d'IDs utilisateurs) |
| created_at | timestamptz | |

### `notification_preferences`
| Colonne | Type | Notes |
|---|---|---|
| user_id | uuid | PK, FK → `auth.users` |
| weekly_digest, on_publish, on_join | boolean | tous `default false` (opt-in) |
| updated_at | timestamptz | |

### `known_names`
Table héritée d'une version antérieure de l'app (saisie manuelle du prénom). **N'est plus utilisée par le code actuel** — candidate à la suppression.

### RLS (Row Level Security)

Toutes les tables sont restreintes au rôle `authenticated` **et** au domaine email :
```sql
using ((auth.jwt() ->> 'email') ilike '%@culture.gouv.fr')
```

⚠️ **Piège rencontré** : créer une table ne suffit pas pour que `authenticated`/`anon`/`service_role` puissent l'utiliser, même avec des policies RLS correctes — il faut aussi les `GRANT` explicites (`grant select, insert, update, delete on <table> to authenticated`). Ça a cassé la sauvegarde des préférences de notification en prod jusqu'à ce qu'on le remarque. Toute nouvelle table doit inclure ces GRANT dans sa migration.

### Trigger de restriction d'inscription

Un trigger `before insert` sur `auth.users` (fonction `enforce_culture_gouv_email`) rejette toute création de compte dont l'email ne finit pas par `@culture.gouv.fr`. C'est ce qui bloque l'inscription **côté serveur**, indépendamment du formulaire.

## Authentification

- Email + mot de passe, via Supabase Auth.
- Inscription réservée à `@culture.gouv.fr` (trigger ci-dessus + vérification côté formulaire).
- **Confirmation par code à 6 chiffres, pas par lien cliquable.** Raison : le serveur mail de `culture.gouv.fr` a un scanner de sécurité qui pré-clique automatiquement les liens des emails entrants (même pour des adresses qui n'existent pas), ce qui confirmait des comptes sans qu'aucun humain ne les valide. Le code doit être saisi manuellement dans l'app, ce qu'un scanner automatique ne peut pas faire.
  - Template email à éditer dans le dashboard Supabase (Authentication → Email Templates → **Confirm signup**) : doit contenir `{{ .Token }}`, ne **doit pas** contenir `{{ .ConfirmationURL }}`.
  - Côté code, la vérification se fait avec `supabase.auth.verifyOtp({ email, token, type: "email" })` — **`type: "email"`, pas `"signup"`**, malgré le nom du template. C'est une subtilité de l'API Supabase à connaître si ça semble ne plus fonctionner après une mise à jour de la librairie.
- Mot de passe oublié : reste sur un lien cliquable classique (le risque du scanner ne s'applique pas ici, car consommer le lien seul ne donne accès à rien sans choisir un nouveau mot de passe dans la foulée, ce qu'un scanner ne fait pas).

## Edge Function `notify`

Une seule fonction (`supabase/functions/notify/index.ts`) gère les 3 types de notifications via un champ `kind` dans le payload :

| `kind` | Déclencheur | Comportement |
|---|---|---|
| `published` | Trigger Postgres `after insert on events` | Email à tous les utilisateurs ayant `on_publish=true`, sauf le créateur |
| `joined` | Trigger Postgres `after update on events` (quand `attendees` grandit) | Email au créateur (`host_id`) s'il a `on_join=true`, sauf s'il s'agit de lui-même qui se (dés)inscrit |
| `digest-check` | `pg_cron`, toutes les heures | Ne fait quelque chose que si on est **lundi 10h heure de Paris** (calculé via `Intl.DateTimeFormat`, insensible au changement d'heure été/hiver) — sinon no-op silencieux |

**Envoi d'email** : via l'API HTTP de **Brevo** (`api.brevo.com/v3/smtp/email`), pas en SMTP direct. Le SMTP brut (testé avec Gmail) ne fonctionne pas de façon fiable dans le sandbox des Edge Functions Supabase (erreur bas niveau `InvalidData: received corrupt message`) — la doc Supabase recommande elle-même une API HTTP pour ce cas.

**Secrets requis** (Dashboard Supabase → Edge Functions → Secrets, projet prod) :
- `BREVO_API_KEY`
- `GMAIL_USER` (= `camillejbr@gmail.com`, sert d'adresse expéditrice — vérifiée comme "single sender" sur Brevo, pas de domaine authentifié)

⚠️ Sans domaine authentifié (DKIM/SPF), les emails envoyés affichent une mention technique du type `via 12118487.brevosend.com` dans certains clients mail (Gmail notamment). C'est cosmétique, sans impact sur la délivrabilité. Pour un rendu plus "propre", il faudrait un nom de domaine dédié configuré chez Brevo.

**Déclenchement des triggers** : les triggers Postgres appellent la fonction via `net.http_post` (extension `pg_net`), avec la clé **anon** (JWT legacy) en `Authorization: Bearer` — la fonction est déployée avec `verify_jwt: true`. La clé anon est publique, ce n'est pas un secret.

## Emails d'authentification (distinct de la partie ci-dessus)

Les emails de Supabase Auth (confirmation d'inscription, réinitialisation de mot de passe) passent par un **SMTP custom configuré directement dans Supabase** (Authentication → Settings → SMTP), et non par l'Edge Function / Brevo. Ce SMTP utilise Gmail (`camillejbr@gmail.com` + mot de passe d'application). Deux systèmes d'envoi d'email coexistent donc dans ce projet, pour deux besoins différents.

## Limites connues / dette technique

- `known_names` : table non utilisée, à supprimer si confirmé inutile.
- Événements créés avant l'ajout de `host_id` (dont un event de test "test 1") : `host_id` est `null`, aucune notification "joined" possible pour eux.
- Pas de tests automatisés.
- Pas de domaine propre pour l'email (affecte l'affichage de l'expéditeur, voir plus haut).
- Le staging n'a pas l'Edge Function / triggers / cron — pour tester les notifications il faut le faire directement en prod (choix assumé pour ce projet, voir historique de conversation).
- Free tier Brevo : 300 emails/jour.
- Les commits git sont actuellement attribués à une identité générique de machine (`camillejouaber@MacBook-Pro-de-Camille.local`) plutôt qu'un vrai nom/email — cosmétique, réglable via `git config`.

## Accès / identifiants à transmettre à un développeur

- Accès au dépôt GitHub (`camillejbr/calendrier-snum`)
- Accès au dashboard Supabase (projets prod + staging), organisation `embwtrqauvggehyhesfc`
- Accès au compte Brevo (pour la clé API / gestion de l'expéditeur)
- Le mot de passe d'application Gmail utilisé pour le SMTP d'auth n'est pas documenté ici (à régénérer si besoin, voir Authentication → Settings → SMTP dans Supabase)
