# Wegwerk – Tower-Defense-Roguelite mit wachsendem Pfad

Ziel, Ansatz und Abnahmekriterium stehen in `SPEC.md`. Maßstab sind Optik und Gameplay.

## Stack
- Vite + TypeScript (strict) + Three.js, läuft als PWA im Browser (iPhone 15 zuerst, PC/Tablet auch)
- 3D-Assets: KayKit-Packs (CC0, glTF), keine selbstgebauten Klötzchen-Modelle
- Sound per WebAudio
- Tests: Vitest für die Simulation; Playwright-MCP für Sichtprüfung im iPhone-Viewport (393×852, Touch) und am Desktop
- Deployment: GitHub Actions → GitHub Pages

## Konventionen
- Kommentare, Commits, Doku auf Deutsch; Bezeichner englisch
- Simulation (`src/sim/`) deterministisch und getrennt vom Rendering (`src/render/`) und UI (`src/ui/`)
- Touch-first, Safe Areas (Dynamic Island, Home-Indikator) beachten
- Timo testet am Handy: nach jeder Änderung einen spielbaren Link liefern und konkretes Feedback einholen

## Befehle
- `npm run dev` – Entwicklungsserver; URL-Parameter: `?fps` (FPS-Anzeige), `?seed=N`, `?fast` (3-fache Geschwindigkeit), `?debug` (`window.app` für Playwright)
- `npm test` – Vitest für `src/sim/`
- `npm run build` – Typecheck und Produktionsbuild
- `bash scripts/build-assets.sh <hex-repo> <skelett-repo>` – baut `public/assets/*.glb` neu aus den KayKit-Quellrepos (Ergebnis ist eingecheckt)

## Stolperfallen
- Die Meshopt-Kompression legt Verschiebung und Skalierung in die glTF-Knoten. Modelle nie direkt umpositionieren oder skalieren, sondern über die Hülle aus `Assets.model()`; Unterknoten (Turmkopf, Katapultarm) relativ zu `userData.base` bewegen.
- Straßenkacheln: A gerade (Kanten 3/0), B weite Kurve (3/1), C enge Kurve (3/2). Richtungen 0=O, 1=NO … gegen den Uhrzeigersinn, Drehung um Y um k·60° verschiebt Kante d nach d+k.
