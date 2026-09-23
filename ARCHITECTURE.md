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
  AdminPage.jsx           page admin (pas une modale) : tableau des utilisateurs, recherche par email, suppression de compte — remplace tout l'écran, atteinte via le bouton "⚙️ Admin" (visible seulement si `is_admin()` renvoie true)
  FoodPage.jsx            page "Bonnes adresses" : carte (Leaflet/OpenStreetMap) centrée sur le bureau + liste filtrable des recommandations food, atteinte via le bouton "🍽️ Bonnes adresses"
  supabaseClient.js       client Supabase (URL + clé lues depuis les variables d'env, avec valeurs de prod en fallback)
  index.css               reset global minimal (html/body/#root en 100% de hauteur)
supabase/functions/notify/index.ts   Edge Function (voir plus bas)
```

Pas de routeur (une seule "page" affichée à la fois) — `TeamCalendar.jsx` fait un early return vers `<AdminPage/>` ou `<FoodPage/>` selon un state local, plutôt que d'utiliser une vraie librairie de routing. Pas de state manager externe non plus (juste `useState`/`useEffect`).

## Page "Bonnes adresses" (`FoodPage.jsx`)

Recommandations de restaurants/boulangeries/etc. autour du bureau, avec géolocalisation sur une carte.

- **Bureau de référence** : Ministère de la Culture, 3 rue de Valois, 75001 Paris — coordonnées codées en dur dans `FoodPage.jsx` (`OFFICE_LAT`/`OFFICE_LNG` = 48.8635971 / 2.3376992, vérifiées via Nominatim). Si le bureau déménage, c'est la seule chose à changer dans ce fichier.
- **Carte** : `react-leaflet` (v4, compatible React 18 — la v5 exige React 19) + `leaflet`, tuiles OpenStreetMap standard (gratuit, pas de clé API). Les marqueurs par défaut de Leaflet cassent avec Vite (chemins d'icônes relatifs) — évité entièrement en utilisant des `L.divIcon` custom (pastille colorée + emoji) pour tous les marqueurs, y compris celui du bureau.
- **Géocodage / autocomplétion** : recherche en direct via l'API de recherche **Nominatim** (`nominatim.openstreetmap.org/search`, gratuite, sans clé), avec `limit=5` et un debounce de 350ms sur la saisie. Recherche bornée à ~5,5 km autour du bureau (`viewbox` + `bounded=1`) pour éviter les faux positifs sur des adresses courtes/ambiguës.
  - Flux à une seule étape : l'utilisateur tape dans le champ adresse, une liste de suggestions apparaît sous le champ, il clique sur la bonne → le lat/lng est capturé et un message "✓ Adresse repérée, à X min à pied du bureau" s'affiche. Le bouton "Publier" refuse la soumission tant qu'aucune suggestion n'a été sélectionnée (protection contre un texte libre non géolocalisé) ; modifier le texte après sélection invalide la sélection et relance la recherche.
- **Distance** : calculée côté client (formule de Haversine) en mètres, puis convertie et affichée en **minutes de marche** (`WALK_M_PER_MIN = 80`, ≈ 4,8 km/h) — jamais en mètres/km dans l'UI. Pas stockée en base, recalculée à chaque chargement à partir de `lat`/`lng`.
- **Prix** : champ numérique libre en euros (entier), pas de grille €/€€/€€€. Le filtre prix propose des tranches (≤ 15€ / ≤ 25€ / ≤ 40€).
- **Types de lieu** (`FOOD_TYPES` dans `FoodPage.jsx`) : italien / bistro / asiat' / oriental / boulangerie / healthy — pas de catégorie "autre" dans le formulaire ; un fallback visuel (`FALLBACK_TYPE`, pastille "📍 Autre") protège juste l'affichage si une donnée ancienne ou hors-liste apparaît un jour, sans être proposable à la création.
- **Table `food_spots`** : name, type (texte libre, pas de contrainte CHECK — la liste ci-dessus est imposée côté UI uniquement), address, lat, lng, price (integer, €), rating (1-5, `not null check`), comment (optionnel), host/host_id (même pattern que `events` — `host_id` en `on delete set null`). RLS : lecture/écriture réservées à `@culture.gouv.fr`, suppression/modification réservées à l'auteur ou un admin (`is_admin()`).
- Chaque soumission est une recommandation indépendante : si deux personnes recommandent le même restaurant, ça fait deux entrées (pas de regroupement/moyenne des avis) — choix délibéré pour rester simple.

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

### `admins`
| Colonne | Type | Notes |
|---|---|---|
| user_id | uuid | PK, FK → `auth.users` |
| created_at | timestamptz | |

Simple liste d'utilisateurs ayant accès au panneau admin (voir plus bas). Pour ajouter un admin :
```sql
insert into admins (user_id) select id from auth.users where email = '...';
```

### Fonctions `SECURITY DEFINER` liées à l'admin

- `is_admin(uid uuid default auth.uid())` : renvoie `true`/`false`. Utilisée à la fois côté RLS (policy de suppression d'événements) et côté client (`supabase.rpc("is_admin")` pour afficher ou non le bouton "Admin").
- `admin_list_users()` : renvoie `id, email, created_at, last_sign_in_at` depuis `auth.users` — une table normalement inaccessible en lecture pour le rôle `authenticated`. La fonction vérifie `is_admin()` en interne et lève une exception sinon. C'est le seul moyen pour le front d'obtenir des infos sur les autres comptes.
  - ⚠️ `auth.users.email` est de type `varchar(255)`, pas `text` — le cast explicite `u.email::text` est nécessaire dans la fonction, sinon Postgres refuse avec `structure of query does not match function result type`.

- `admin_delete_user(target_id uuid)` : supprime un compte (`delete from auth.users`). Vérifie `is_admin()` et refuse qu'un admin se supprime lui-même. La FK `events.host_id` est en `on delete set null` (pas de cascade) : supprimer un utilisateur détache ses événements au lieu de les supprimer ou de bloquer la suppression.

La suppression d'événements par un admin (pas seulement le sien) passe simplement par la policy RLS ci-dessous, pas par une fonction dédiée.

### RLS (Row Level Security)

Toutes les tables sont restreintes au rôle `authenticated` **et** au domaine email :
```sql
using ((auth.jwt() ->> 'email') ilike '%@culture.gouv.fr')
```

La suppression d'un événement (`delete` sur `events`) a une condition supplémentaire : `host_id = auth.uid() or is_admin()`. Avant ça, n'importe quel compte `@culture.gouv.fr` authentifié pouvait supprimer n'importe quel événement via l'API directement (le bouton "supprimer" n'était caché que côté interface, pas vraiment protégé) — c'est corrigé depuis.

⚠️ **Piège rencontré** : créer une table ne suffit pas pour que `authenticated`/`anon`/`service_role` puissent l'utiliser, même avec des policies RLS correctes — il faut aussi les `GRANT` explicites (`grant select, insert, update, delete on <table> to authenticated`). Ça a cassé la sauvegarde des préférences de notification en prod jusqu'à ce qu'on le remarque. Toute nouvelle table doit inclure ces GRANT dans sa migration.

### Trigger de restriction d'inscription

Un trigger `before insert` sur `auth.users` (fonction `enforce_culture_gouv_email`) rejette toute création de compte dont l'email ne finit pas par `@culture.gouv.fr`. C'est ce qui bloque l'inscription **côté serveur**, indépendamment du formulaire.

## Authentification

- Email + mot de passe, via Supabase Auth.
- Inscription réservée à `@culture.gouv.fr` (trigger ci-dessus + vérification côté formulaire).
- **Confirmation par code, pas par lien cliquable.** Raison : le serveur mail de `culture.gouv.fr` a un scanner de sécurité qui pré-clique automatiquement les liens des emails entrants (même pour des adresses qui n'existent pas), ce qui confirmait des comptes sans qu'aucun humain ne les valide. Le code doit être saisi manuellement dans l'app, ce qu'un scanner automatique ne peut pas faire.
  - ⚠️ Le code envoyé par Supabase pour ce projet fait **8 chiffres**, pas les 6 documentés par défaut dans la doc Supabase (probablement un réglage "Email OTP Length" modifié côté dashboard). Le champ de saisie ne doit donc pas limiter la longueur à 6 (`maxLength` généreux côté `Auth.jsx`) — un bug de ce type a bloqué toutes les confirmations un moment avant d'être repéré.
  - Template email à éditer dans le dashboard Supabase (Authentication → Email Templates → **Confirm signup**) : doit contenir `{{ .Token }}`, ne **doit pas** contenir `{{ .ConfirmationURL }}`.
  - Côté code, la vérification se fait avec `supabase.auth.verifyOtp({ email, token, type: "email" })` — **`type: "email"`, pas `"signup"`**, malgré le nom du template. C'est une subtilité de l'API Supabase à connaître si ça semble ne plus fonctionner après une mise à jour de la librairie.
- Mot de passe oublié : reste sur un lien cliquable classique (le risque du scanner ne s'applique pas ici, car consommer le lien seul ne donne accès à rien sans choisir un nouveau mot de passe dans la foulée, ce qu'un scanner ne fait pas).
- **Exigence de mot de passe** : 12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial (`passwordError()` dans `Auth.jsx`). ⚠️ C'est une vérification **côté client uniquement** — pour une vraie garantie (quelqu'un pourrait appeler l'API Supabase directement en contournant le formulaire), il faut aussi configurer la même exigence côté dashboard Supabase : Authentication → Sign In / Providers → Email → "Password Requirements" (minimum length 12, "Lowercase, uppercase letters, digits and symbols").

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

Les templates HTML (mêmes codes couleur/police que le reste de l'app) sont dans `email-templates/` : `confirm-signup.html` (avec `{{ .Token }}`, **sans** lien cliquable — voir la note sur le scanner de sécurité plus haut) et `reset-password.html` (avec un bouton `{{ .ConfirmationURL }}`). Ils doivent être collés manuellement dans le dashboard Supabase (Authentication → Email Templates) — il n'y a pas d'API pour les pousser automatiquement, donc **ce dossier peut se désynchroniser** de ce qui est réellement configuré si quelqu'un modifie un template directement dans le dashboard sans reporter le changement ici.

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
