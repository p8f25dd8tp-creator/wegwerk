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
