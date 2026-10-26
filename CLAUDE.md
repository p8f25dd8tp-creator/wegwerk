# Neon Defense – Tower-Defense-Spiel fürs iPhone

Ziel: hochwertiges, spaßiges Tower-Defense-Spiel, das auf einem iPhone 15 als Web-App (PWA) im Vollbild läuft.
Kein Mac vorhanden, daher keine native iOS-App: Auslieferung über GitHub Pages, auf dem iPhone per Safari → „Zum Home-Bildschirm“.

## Stack
- Vite + TypeScript, Canvas 2D, keine Game-Engine
- Sound per WebAudio synthetisiert (keine Audio-Assets)
- Tests: Vitest für Spiellogik; Playwright (MCP) für Sichtprüfung im iPhone-Viewport (393×852)

## Konventionen
- Kommentare, Commits, Doku auf Deutsch; Bezeichner englisch
- Hochformat, Touch-first, Safe Areas (Notch/Dynamic Island) beachten
- Spiellogik (Simulation) getrennt vom Rendering, damit testbar
