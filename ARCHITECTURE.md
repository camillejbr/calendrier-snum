# Documentation technique — L'agenda du SNUM

Calendrier d'équipe partagé (verres, activités, sport, repas), avec inscription ouverte à toute adresse **sauf** `@culture.gouv.fr`, derrière un mot de passe d'accès commun, et notifications par email. Ce document décrit l'architecture pour permettre une reprise en main par un·e développeur·se.

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
| Usage | Site en ligne | Tests locaux (**abandonné pour l'instant**, voir ci-dessous) |
| Edge Function `notify` | ✅ déployée | ❌ non déployée |
| SMTP configuré (emails d'auth) | ✅ | ❌ (limite par défaut Supabase très basse) |
| Règles d'inscription (mot de passe d'accès + blocage `@culture.gouv.fr`) et `is_member()` | ⏳ script prêt (`supabase/migrations/20261006_open_signup_with_access_code.sql`), à appliquer | ❌ non migré (projet en pause, ancien schéma) |

⚠️ **Statut actuel du staging** : le projet est en pause et ne peut pas être réactivé tant que le compte Supabase est limité à 2 projets gratuits actifs (occupés par la prod et par un autre projet, `planning-dev`). Il a en plus l'ancien schéma (règles `@culture.gouv.fr`, ni mot de passe d'accès ni `is_member()`) : pour le réutiliser, il faudrait le réactiver puis y appliquer `supabase/migrations/20261006_open_signup_with_access_code.sql`. En attendant, `.env.local` pointe sur la **prod** : tout test en local modifie les vraies données.

Le staging servait uniquement à prévisualiser des changements d'interface/schéma sans toucher aux vraies données d'équipe — il n'a pas toute l'infra d'envoi d'email.

## Frontend — structure

```
src/
  main.jsx               point d'entrée, monte <App/>
  App.jsx                gère la session Supabase : visiteur non connecté → <AccessGate/> (mot de passe d'accès) puis <Auth/> ; connecté → <TeamCalendar/>
  AccessGate.jsx          première page : mot de passe commun, vérifié côté base (voir « Règles d'inscription »)
  Auth.jsx                écrans connexion / inscription (avec nom affiché) / code de confirmation / mot de passe oublié ; exporte aussi les styles partagés et <PasswordInput/> (œil afficher/masquer)
  TeamCalendar.jsx        calendrier (liste / semaine / mois), CRUD événements, bouton notifications
  NotificationSettings.jsx  modale des préférences email
  Footer.jsx              pied de page discret (mentions légales / confidentialité / accessibilité), sur toutes les vues
  LegalPages.jsx          les 3 pages légales (chargées à la demande) ; contenu rédigé à la main, à relire si le fonctionnement change
  Onboarding.jsx          tutoriel pas à pas de première connexion (modale accessible, rouvrable via « Tutoriel »)
  AdminPage.jsx           page admin (pas une modale) : tableau des utilisateurs, recherche par email, suppression de compte — remplace tout l'écran, atteinte via le bouton "⚙️ Admin" (visible seulement si `is_admin()` renvoie true)
  FoodPage.jsx            page "Bonnes adresses" : carte (Leaflet, fond IGN) centrée sur le bureau + liste filtrable des recommandations food, atteinte via le bouton "🍽️ Bonnes adresses"
  supabaseClient.js       client Supabase (URL + clé lues depuis les variables d'env, avec valeurs de prod en fallback)
  index.css               reset global minimal (html/body/#root en 100% de hauteur)
supabase/functions/notify/index.ts   Edge Function (voir plus bas)
supabase/migrations/                 scripts SQL à exécuter à la main dans l'éditeur SQL Supabase (pas d'outil de migration automatique) — voir le statut du staging plus haut
```

Pas de librairie de routing (une seule "page" affichée à la fois) — `TeamCalendar.jsx` fait un early return vers `<AdminPage/>` ou `<FoodPage/>` selon un state local (`showAdminPanel`/`showFoodPage`). Pas de state manager externe non plus (juste `useState`/`useEffect`).

Ces deux states sont malgré tout reflétés dans l'URL via le **hash** (`#/admin`, `#/bonnes-adresses`, rien pour le calendrier) — pas de vraie route côté chemin (`/bonnes-adresses`) car GitHub Pages 404 sur un chemin inconnu chargé directement sans configuration supplémentaire (le hash, lui, n'est jamais envoyé au serveur, donc un lien copié-collé ou rechargé fonctionne toujours). Au montage, l'état initial est dérivé de `window.location.hash` ; un listener `hashchange` resynchronise l'état sur navigation précédent/suivant du navigateur ; les fonctions `openAdminPanel`/`openFoodPage`/`backToCalendar` dans `TeamCalendar.jsx` font les deux en même temps (changent le hash *et* le state).

**Découpage du bundle (éco-conception)** : `AdminPage.jsx` et surtout `FoodPage.jsx` (qui embarque Leaflet, ~170 Ko) sont importés via `React.lazy()` dans `TeamCalendar.jsx` plutôt qu'en import statique, avec un `<Suspense fallback={...}>` autour de chaque early return. Résultat : le bundle initial du calendrier (ce que télécharge tout le monde, même sans jamais aller sur "Bonnes adresses") est passé de ~586 Ko à ~406 Ko minifié (114 Ko gzippé) ; le code de la carte ne se télécharge que pour qui clique effectivement sur "Bonnes adresses". La minification elle-même (JS et CSS) est déjà faite par défaut par `vite build`, rien à configurer en plus.

## Page "Bonnes adresses" (`FoodPage.jsx`)

Recommandations de restaurants/boulangeries/etc. autour du bureau, avec géolocalisation sur une carte.

- **Bureaux de référence** : deux, codés en dur dans `FoodPage.jsx` (constante `OFFICES`, coordonnées vérifiées via Nominatim) — **Valois/BE** (3 rue de Valois, 75001, 48.8635971 / 2.3376992, choix par défaut) et **La Chapelle** (47 rue de la Chapelle, 75018, 48.8939019 / 2.3590676). Un sélecteur sous le titre (`aria-pressed`) change le bureau actif (state `officeKey`, **non mémorisé** : on revient sur Valois/BE à chaque arrivée sur la page). Tout ce qui dépend du bureau suit : centre de la carte (`MapRecenter` — le `center` de `MapContainer` n'est lu qu'au montage), marqueur du bureau, temps de marche (haversine de repli + itinéraire IGN), aperçu du formulaire, et zone de recherche d'adresse Nominatim (±0,05° autour du bureau actif, qui couvre aussi l'autre bureau, distants d'environ 3,7 km). Le cache des itinéraires est clé sur **bureau + lieu** (`"<bureau>:<spotId>"`), donc basculer d'un bureau à l'autre ne recalcule que ce qui manque. Pour ajouter ou déplacer un bureau, modifier `OFFICES`.
  - La liste de gauche reste limitée à ce qui est visible sur la carte : après un changement de bureau, les lieux situés hors du cadre recentré sont masqués de la liste (le compteur indique « X visibles sur la carte (sur N au total) »).
- **Carte** : `react-leaflet` (v4, compatible React 18 — la v5 exige React 19) + `leaflet`, tuiles **IGN "Plan IGN v2"** via la Géoplateforme (`data.geopf.fr/wmts`, gratuit, pas de clé API — l'ancien Géoportail IGN nécessitait une clé, la nouvelle Géoplateforme non). Choisi après deux essais : les tuiles CARTO Positron (rendu plus épuré) exigent désormais une clé API sur `basemaps.cartocdn.com`, abandonnées ; OpenStreetMap standard adouci avec un filtre CSS fonctionnait mais restait moins distinctif que le rendu cartographique IGN. Le filtre CSS léger sur `.leaflet-tile-pane` (`grayscale`/`sepia`/`contrast`/`brightness`) est conservé par-dessus les tuiles IGN pour renforcer l'accord avec la palette crème de l'appli. Les marqueurs par défaut de Leaflet cassent avec Vite (chemins d'icônes relatifs) — évité entièrement en utilisant des `L.divIcon` custom (pastille colorée + emoji) pour tous les marqueurs, y compris celui du bureau.
- **Géocodage / autocomplétion** : recherche en direct via l'API de recherche **Nominatim** (`nominatim.openstreetmap.org/search`, gratuite, sans clé), avec `limit=5` et un debounce de 350ms sur la saisie. Recherche bornée à ~5,5 km autour du bureau (`viewbox` + `bounded=1`) pour éviter les faux positifs sur des adresses courtes/ambiguës.
  - Flux à une seule étape : l'utilisateur tape dans le champ adresse, une liste de suggestions apparaît sous le champ, il clique sur la bonne → le lat/lng est capturé et un message "✓ Adresse repérée, à X min à pied du bureau" s'affiche. Le bouton "Publier" refuse la soumission tant qu'aucune suggestion n'a été sélectionnée (protection contre un texte libre non géolocalisé) ; modifier le texte après sélection invalide la sélection et relance la recherche.
- **Distance / temps de trajet** : la **distance** vient d'un vrai itinéraire piéton (rues réelles, pas à vol d'oiseau) via l'**API navigation de la Géoplateforme IGN** (`data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=pedestrian`, gratuite, sans clé — même fournisseur que les tuiles de la carte). La **durée**, elle, n'utilise pas le `duration` renvoyé par cette API : il suppose une vitesse de marche à peine ~3,6 km/h (vérifié en comparant aux temps Google Maps réels : IGN annonçait 10 et 7 min là où Google dit 8 et 6). La durée affichée est donc toujours recalculée nous-mêmes à partir de la distance IGN avec `WALK_M_PER_MIN = 75` (≈ 4,5 km/h, calé sur ces deux repères Google Maps) — `metersToWalkMinutes`/`formatWalkTime` ne prennent qu'un argument, la distance. Toujours affiché en **minutes de marche**, jamais en mètres/km.
  - **Cache par bureau et par lieu** (state `routeCache` dans `FoodPage.jsx`, `{ ["<bureau>:<spotId>"]: { lat, lng, distanceM } }`) : un `useEffect` gardé sur `[spots, officeKey]` ne refetch que les lieux absents du cache ou dont le `lat`/`lng` en cache ne correspond plus à celui du lieu — donc se réactualise tout seul dès que quelqu'un modifie l'adresse d'un lieu (`loadData()` après la sauvegarde recharge `spots` avec le nouveau `lat`/`lng`, qui ne matche plus l'entrée en cache).
  - **Repli sur l'estimation à vol d'oiseau** (formule de Haversine) tant que la distance réelle n'est pas encore arrivée (chargement initial, ou si l'API IGN échoue/est indisponible pour un point donné) — l'affichage bascule automatiquement sur la vraie valeur dès qu'elle arrive.
  - Même mécanique pour l'**aperçu en direct** dans le formulaire d'ajout/modification ("✓ Adresse repérée, à X min à pied du bureau") : un `useEffect` séparé sur `geoResult` fetch la distance pour l'adresse en cours de sélection, avant même la sauvegarde.
  - Rien n'est stocké en base (ni le cache, ni la distance) — tout est recalculé/refetché côté client à partir de `lat`/`lng`.
- **Prix** : champ numérique libre en euros (entier), pas de grille €/€€/€€€. Le filtre prix propose des tranches (≤ 15€ / ≤ 25€ / ≤ 40€).
- **Types de lieu** (`FOOD_TYPES` dans `FoodPage.jsx`) : italien / bistro / asiat' / oriental / boulangerie / healthy — pas de catégorie "autre" dans le formulaire ; un fallback visuel (`FALLBACK_TYPE`, pastille "📍 Autre") protège juste l'affichage si une donnée ancienne ou hors-liste apparaît un jour, sans être proposable à la création.
- **Deux tables, un lieu peut recevoir plusieurs avis** : `food_spots` (le lieu — name, type texte libre sans contrainte CHECK, address, lat, lng, host/host_id = qui a ajouté le lieu) et `food_reviews` (un avis — spot_id en FK `on delete cascade`, price integer €, rating 1-5 `not null check`, comment optionnel, host/host_id = qui a écrit l'avis). Supprimer un lieu supprime tous ses avis. RLS sur les deux tables : lecture/écriture réservées aux membres (`is_member()`, voir plus bas) ; modification/suppression du lieu réservées à celui qui l'a ajouté ou un admin ; modification/suppression d'un avis réservées à son auteur ou un admin (`is_admin()`) — chacun ne peut donc modifier/supprimer que son propre avis, jamais celui d'un collègue.
- Prix et note affichés au niveau du lieu (carte, liste, filtres) sont des **moyennes** calculées côté client à partir de tous ses avis (`spotsWithReviews` dans `FoodPage.jsx`), recalculées à chaque chargement — rien n'est stocké en base.
- Le formulaire "+ Ajouter un lieu" crée le lieu et un premier avis en une fois. Sur un lieu déjà existant, "+ Mon avis" ouvre un formulaire allégé (prix/note/commentaire seulement) lié au `spot_id`. Ce bouton disparaît si l'utilisateur a déjà un avis sur ce lieu — il modifie alors directement sa ligne existante (✎) plutôt que d'en recréer une.
- **Avis repliés par défaut** : pour ne pas polluer la liste quand un lieu accumule des avis, ceux-ci ne s'affichent que si le lieu est déplié (state `expandedSpots`, un `Set` d'ids de lieux, dans `FoodPage.jsx`). Le lien "Voir les X avis ▾" / "Masquer les avis ▴" bascule l'état par lieu ; ouvrir le formulaire d'ajout/édition d'avis (`openReviewForm`) déplie automatiquement le lieu concerné pour que l'utilisateur voie le contexte (avis existants) en même temps que son propre formulaire.
- **Détection de doublon à la création** : le nom tapé dans "+ Ajouter un lieu" est comparé (insensible à la casse et aux accents, `normalizeName` dans `FoodPage.jsx`) aux lieux déjà existants. Un match affiche une bannière sous le champ nom avec un raccourci direct vers "+ Mon avis" sur le lieu trouvé. Si l'utilisateur soumet quand même, le premier clic sur "Publier" bloque avec un message d'avertissement au lieu de créer la ligne ; un deuxième clic (state `confirmDuplicate`, retombe à `false` dès que le nom retapé change) confirme la création volontaire d'un doublon — utile si deux lieux différents portent réellement le même nom.
- **Structure de titres (RGAA)** : un seul `h1` ("Bonnes adresses") par page, puis des `h2` pour chaque grande zone — "Ajouter un lieu"/"Modifier le lieu" (déjà visible), et trois `h2` masqués visuellement mais lus par les lecteurs d'écran (`srOnlyStyle` dans `FoodPage.jsx`, technique `clip`/`position: absolute`) : "Filtrer les lieux", "Liste des lieux", "Carte des lieux". Le nom de chaque lieu dans la liste est un `h3` (nested sous "Liste des lieux") plutôt qu'un `<span>` stylé, pour permettre la navigation par titres d'un lecteur d'écran entre les lieux. Les trois `<select>` de filtre (prix/distance/tri) ont chacun un `<label>` masqué associé (`htmlFor`), qu'ils n'avaient pas avant.

### Pied de page et pages légales

`Footer.jsx` (rendu par `App.jsx` sous toutes les vues, y compris la page d'entrée) renvoie vers trois pages **publiques** (accessibles sans connexion), routées par hash dans `App.jsx` (`#/mentions-legales`, `#/confidentialite`, `#/accessibilite` — `LEGAL_ROUTES`), indépendamment de la session. Le bouton « Retour à l'agenda » renvoie à la racine (pas à la page précédente). `LegalPages.jsx` est chargé à la demande (`React.lazy`) pour ne pas alourdir le bundle initial. Les pages hautes laissent la place au pied de page via la variable CSS `--footer-h` (`index.css`) : elles utilisent `minHeight: calc(100dvh - var(--footer-h))` au lieu de `100dvh`.

⚠️ **Le contenu des pages décrit le fonctionnement réel et doit être relu quand il change** : sous-traitants (GitHub, Supabase, Brevo, Gmail, IGN, Nominatim, Google Fonts), données collectées, absence de cookies, durées de conservation, et surtout la liste « Ce qui a été fait / Limites connues » de la déclaration d'accessibilité (par ex. si la fenêtre Notifications gère enfin le focus, retirer la limite correspondante). Identité de l'éditrice et contact : constantes `EDITOR` / `CONTACT` en tête de `LegalPages.jsx`.

Points connus de la politique de confidentialité : (1) les polices Inter/Fraunces sont chargées depuis **Google Fonts** (`@import` dans plusieurs composants), ce qui envoie l'adresse IP des visiteurs à Google — mentionné dans la page ; les héberger localement supprimerait ce transfert ; (2) aucune durée de conservation automatique : pas de purge des comptes inactifs ; (3) supprimer un compte (`admin_delete_user`) ne supprime pas les noms déjà écrits en texte dans `events`/`food_reviews` : suppression/anonymisation manuelle sur demande (c'est ce que dit la page).

La déclaration d'accessibilité indique « **non évalué** » : aucun audit RGAA n'a été fait. Un gris secondaire (`#8A8676`, 3,3:1) a été remplacé par `#716D62` (≥ 4,6:1 sur tous les fonds de l'appli) pour respecter le contraste minimal de 4,5:1.

### Tutoriel de première connexion

`Onboarding.jsx` : fenêtre modale pas à pas (7 étapes : bienvenue, vues, créer un événement, rejoindre, bonnes adresses, notifications, récapitulatif avec le nom affiché), affichée par `TeamCalendar.jsx` tant que `user.user_metadata.onboarding_done` n'est pas vrai. À la fermeture (« C'est parti », « Passer le tutoriel » ou `Échap`), `finishTutorial()` enregistre ce drapeau avec `supabase.auth.updateUser({ data: { onboarding_done: true } })` — stocké sur le compte (pas dans le navigateur), donc il ne revient pas sur un autre appareil. Le lien « Tutoriel » à côté de « Se déconnecter » le rouvre à volonté (sans réécrire le drapeau).

Accessibilité (RGAA) : `role="dialog"` + `aria-modal`, titre d'étape relié par `aria-labelledby` et focalisé à chaque changement d'étape, annonce « Étape X sur 7 » (`aria-live`), focus piégé dans la fenêtre (Tab / Maj+Tab), `Échap` pour fermer, focus rendu à l'élément d'origine. Un clic à côté de la fenêtre ne la ferme volontairement pas (éviter de marquer le tutoriel comme vu par erreur).

⚠️ Les textes du tutoriel citent les libellés exacts de l'interface (« + Nouvel événement », « Je viens », « Je me désiste », « Complet », « Bonnes adresses », « Notifications », « Tutoriel ») : à relire si l'un d'eux change.

Clés utilisées dans `user_metadata` : `display_name` (nom affiché), `onboarding_done` (tutoriel vu). `access_code` n'y reste jamais : le trigger d'inscription le retire.

### Nom affiché

Le nom affiché (organisateur, participants, auteur d'un lieu ou d'un avis) est **saisi à l'inscription** : champ « Prénom et initiale du nom » (`Auth.jsx`, ex. `Camille J`), normalisé en **"Camille J."** par `normalizeDisplayName` (refus d'un nom complet ou d'un prénom seul) puis stocké dans les métadonnées du compte (`user_metadata.display_name`, passé via `options.data` de `supabase.auth.signUp`). Côté front, `profileName` = `user.user_metadata.display_name`, avec repli sur `displayNameFromEmail` (`prenom.nom@domaine` → "Prénom N.", ou le début de l'email en majuscule si pas de point) pour les comptes sans `display_name`. La fonction `notify` fait le même choix (`hostData.user.user_metadata?.display_name` d'abord) pour ne pas notifier l'organisateur de sa propre inscription.

⚠️ Limites connues : (1) le nom est un simple libellé côté client, rien n'empêche techniquement un utilisateur de mettre un autre nom via l'API ; (2) les inscriptions aux événements (`attendees`) et l'auteur (`host`) sont stockés **sous forme de texte**, pas d'identifiant : deux personnes avec exactement le même nom affiché ("Camille J.") seraient confondues (l'une désinscrit l'autre). Pas de contrôle d'unicité du nom pour l'instant.

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

Toutes les tables sont restreintes au rôle `authenticated` **et** à `public.is_member()` : tout compte connecté dont l'email n'est **pas** en `@culture.gouv.fr` (ni sous-domaine).
```sql
using (public.is_member())
```
`is_member()` est l'unique endroit qui définit « qui a accès aux données » : toutes les policies l'appellent (policies renommées `members read/insert/update …`). Pour changer cette règle, il suffit de redéfinir cette fonction, pas de réécrire 13 policies. Historique : avant, la règle était câblée en dur dans chaque policy (`ilike '%@culture.gouv.fr'`, accès *réservé* à ce domaine) ; elle a été inversée en même temps que l'ouverture de l'inscription. Conséquence : les comptes `@culture.gouv.fr` déjà créés peuvent toujours se connecter mais ne voient plus aucune donnée.

La suppression d'un événement (`delete` sur `events`) a une condition supplémentaire : `host_id = auth.uid() or is_admin()`. Avant ça, n'importe quel compte authentifié pouvait supprimer n'importe quel événement via l'API directement (le bouton "supprimer" n'était caché que côté interface, pas vraiment protégé) — c'est corrigé depuis.

⚠️ **Piège rencontré** : créer une table ne suffit pas pour que `authenticated`/`anon`/`service_role` puissent l'utiliser, même avec des policies RLS correctes — il faut aussi les `GRANT` explicites (`grant select, insert, update, delete on <table> to authenticated`). Ça a cassé la sauvegarde des préférences de notification en prod jusqu'à ce qu'on le remarque. Toute nouvelle table doit inclure ces GRANT dans sa migration.

### Règles d'inscription (trigger) et mot de passe d'accès commun

Un trigger `before insert` sur `auth.users` (`private.enforce_signup_rules`, schéma `private` non exposé par l'API) applique deux règles **côté serveur**, indépendamment du formulaire :
1. rejette tout email en `@culture.gouv.fr` (et sous-domaines) ;
2. exige le mot de passe d'accès commun dans les métadonnées d'inscription (`options.data.access_code` côté `supabase.auth.signUp`), puis le retire des métadonnées avant stockage.

Le mot de passe d'accès est stocké **uniquement sous forme de hash bcrypt** dans `public.app_access` (une seule ligne ; table sans aucun droit pour `anon`/`authenticated`, accessible via des fonctions `SECURITY DEFINER`) :
- `set_access_code(text)` : définit/change le mot de passe (5 caractères minimum — choix assumé pour la facilité de partage ; plus c'est court, plus c'est facile à deviner, d'où l'intérêt d'un mot de passe plus long si le contenu devient sensible). Réservée au propriétaire de la base : se lance depuis l'éditeur SQL Supabase (`select public.set_access_code('…')`), donc le mot de passe n'apparaît ni dans le code ni dans l'historique du dépôt. Tant qu'aucun mot de passe n'est défini, **personne ne peut s'inscrire** (échec fermé).
- `check_access_code(code text) → boolean` : appelée par la page d'entrée (`AccessGate.jsx`), accessible aux visiteurs non connectés.
- Limitation des essais : au-delà de 20 échecs en 10 minutes (tous visiteurs confondus, table `access_code_failures`), les vérifications répondent « faux » jusqu'à la fin de la fenêtre. Limite connue : un échec dans le trigger d'inscription annule la transaction, donc n'est pas compté ; le chemin d'inscription reste protégé par la limitation de débit de Supabase Auth, pas par ce compteur.
- ⚠️ GoTrue ne remonte pas le message d'erreur du trigger au client (toujours `Database error saving new user`) : `Auth.jsx` ne peut donc pas distinguer « adresse refusée » de « mauvais mot de passe d'accès » à partir de la réponse ; elle revérifie le code via `check_access_code` pour décider s'il faut renvoyer l'utilisateur à la page d'entrée.

## Authentification

- Email + mot de passe, via Supabase Auth.
- **Page d'entrée avec mot de passe commun** (`AccessGate.jsx`, affichée par `App.jsx` aux visiteurs non connectés avant la page de connexion/inscription). Le mot de passe validé est gardé le temps de l'onglet (`sessionStorage`, clé `snum-access-code`) pour être joint à l'inscription ; un utilisateur déjà connecté (session Supabase valide) ne repasse pas par cette page. Le lien de réinitialisation de mot de passe (`#…type=recovery`) saute aussi la page d'entrée.
- Inscription ouverte à toute adresse sauf `@culture.gouv.fr` : refus côté formulaire (`BLOCKED_DOMAIN` dans `Auth.jsx`, pour le message clair) **et** côté base (trigger ci-dessus, la vraie barrière).
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
