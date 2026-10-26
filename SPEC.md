# SPEC: Tower-Defense-Roguelite mit wachsendem Pfad (Arbeitstitel „Wegwerk“)

## Ziel
Ein Spiel, das wirklich gut aussieht und Spaß macht. Timo hat schon mehrere KI-gebaute Spiele (Godot, Unity, Unreal, Handy) abgebrochen, weil **Optik und Gameplay** enttäuschten. Daran wird dieses Projekt gemessen.
Gespielt wird vor allem auf dem iPhone 15, PC und Tablet sollen auch gehen. Timo entwickelt vom Handy aus: kein Editor, nichts, wofür er an den Rechner muss.

## Gewählter Ansatz
- **Spielprinzip:** wie *Isle of Arrows* (Steam, „Sehr positiv“): Vor jeder Welle zieht man Kacheln und legt sie an, so wächst der Pfad auf einer Hex-Insel. Türme kommen neben den Weg, Gelände bringt Synergien, nach Wellen gibt es Relikte zur Auswahl, alle 10 Wellen einen Boss, danach Meta-Fortschritt. Bewährte Kernschleife übernehmen, eigene Ideen erst darauf aufsetzen.
- **Optik:** einheitlicher Stil durch CC0-Asset-Packs von KayKit statt selbst gebauter Modelle
  - Gelände/Gebäude: https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 (200+ Hex-Kacheln, glTF, eine Atlas-Textur)
  - Gegner: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0
  - Dazu gutes Licht, Schatten, Post-Processing und Juice (Partikel, Hit-Stop, Screen-Shake, Beute fliegt zum Spieler)
- **Technik:** Vite + TypeScript + Three.js, als PWA im Browser. Simulation deterministisch und getrennt vom Rendering (Vitest). Auto-Deploy über GitHub Actions auf GitHub Pages, jede Änderung ist nach ca. 1 Minute am Handy spielbar.
- **Vorgehen:** erst ein kleiner spielbarer Beweis, Timo prüft ihn am Handy und entscheidet. Danach in kleinen Schritten mit Feedback nach jeder Runde.

### Verworfen
- 2D-Neon-TD mit festen Karten: zu langweilig
- Native iOS-App (Swift/Unity): kein Mac vorhanden, Iteration über Cloud-Mac und Sideloading zu langsam, Claude kann nichts selbst testen
- Godot/Unity/Unreal: Vorteile liegen im Editor, den keiner bedient. Web-Exporte sind 30–50 MB groß und laufen auf iOS Safari schlechter
- Eigene prozedurale Low-Poly-Modelle: genau die Optik, die bisher enttäuscht hat

## Nicht-Ziele (vorerst)
- App Store, Monetarisierung, Multiplayer
- AR, Haptik (geht im Browser auf iOS nicht)
- Eigene High-Poly-Modelle

## Abnahmekriterium für den ersten Beweis
Ein Link, der auf dem iPhone 15 in Safari flüssig läuft (Ziel 60 FPS) und Folgendes kann:
- Hex-Insel aus KayKit-Kacheln
- 3 Kacheln zur Wahl, eine an den Pfad anlegen
- 2 Turmtypen bauen
- Skelettwellen laufen den gewachsenen Pfad entlang, Basis verliert Leben
- Schöne Treffer- und Todeseffekte

Timo sagt nach ein paar Minuten am Handy: „sieht gut aus und macht Lust auf mehr“. Sonst wird nachgebessert oder abgebrochen.
