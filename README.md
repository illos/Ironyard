# Ironyard

A web-based companion app for the [Draw Steel TTRPG](https://www.mcdmproductions.com/), built for play at the table — phone, iPad, and desktop.

## What it does

Three pillars:

1. **Player tools** — character creator covering all core ancestries, classes, careers, inciting incidents, and complications. Interactive character sheet that drives play.
2. **Director tools** — monster database, encounter builder, combat tracker. Initiative, HP, conditions, resources, monster ability invocation, target selection.
3. **Lobby** — director and players share one live session. Players auto-join the combat tracker. Damage and effects sync across all clients in realtime. Shared dice tray and chat.

## Status

In planning. See [`docs/phases.md`](docs/phases.md) for the build plan.

## Stack at a glance

- **Frontend:** React + Vite + TypeScript + Tailwind, deployed to Cloudflare Pages
- **API:** Hono on Cloudflare Workers
- **Realtime:** Durable Objects per game session, WebSocket transport
- **Database:** D1 for dynamic data (users, characters, sessions, encounters)
- **Static reference data:** SteelCompendium SDK ingested at build time, bundled as JSON
- **Auth:** magic-link email

## Why "Ironyard"

Working name. Easy to change later — nothing in the code is namespaced to it.

## Data + license

Static rules and bestiary data come from the [SteelCompendium](https://github.com/SteelCompendium) project, published under the [DRAW STEEL Creator License](https://www.mcdmproductions.com/draw-steel-creator-license). DRAW STEEL © 2024 MCDM Productions, LLC. This app is an independent product and is not affiliated with MCDM Productions, LLC.

## Repo layout

```
Ironyard/
├── apps/
│   ├── web/              React app (Cloudflare Pages)
│   └── api/              Hono Worker + Durable Objects
├── packages/
│   ├── shared/           Types and Zod schemas shared between web and api
│   ├── rules/            Stateless rules engine (reducer + intents)
│   └── data/             SteelCompendium ingest + normalized JSON
└── docs/                 Architecture and protocol docs
```

(Scaffolded in Phase 0 — see `docs/phases.md`.)
