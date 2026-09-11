# L'agenda du SNUM

Calendrier d'équipe (verres, activités, sport, repas) partagé via Supabase, avec connexion réservée aux adresses `@culture.gouv.fr`.

## Lancer en local

```bash
npm install
npm run dev
```

Par défaut, le serveur local pointe vers la base de **production**. Pour tester contre la base de **staging** (recommandé avant de pousser sur `main`), copie `.env.local.example` en `.env.local` et renseigne la clé publique du projet staging (Supabase dashboard → staging project → Settings → API).

## Build de production

```bash
npm run build
```

## Déploiement

Chaque push sur `main` déclenche automatiquement un build + déploiement sur GitHub Pages via `.github/workflows/deploy.yml`.

## Architecture

- **Frontend** : React + Vite, hébergé sur GitHub Pages
- **Backend** : Supabase (auth email/password + base Postgres partagée pour les événements)
- Deux projets Supabase : un pour la prod, un pour le staging (même schéma, données séparées)
