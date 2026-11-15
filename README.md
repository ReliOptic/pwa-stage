# iPhone PWA Simulator (`pwa-stage`)

An open-source macOS floating iPhone & iPhone Duo PWA simulator built with Electron, React, TypeScript, and Three.js — designed for Apple designers, web engineers, and iOS developers.

## Features

- **Real-Time 3D iPhone Duo Hinge Simulation**: Skinned 98-node glTF hardware model with Three.js WebGL rendering, 4-point projective homography (`matrix3d`), 6 postures (`0°` Closed, `70°` Standing, `100°` Book, `108°` Tabletop, `180°` Open, `180°` Portrait), and frame-by-frame `1°` angle scrubbing.
- **Floating Desktop Workflow**: Always-on-Top toggle (`⌘T`), drag-to-move, aspect-locked corner resizing, and macOS menu bar tray support.
- **Touch & Swipe Emulation**: Toggle between **Press-to-Swipe** (`눌러서 스와이프`) and **Direct Swipe** (`바로 스와이프`) via Chrome DevTools Protocol touch emulation.
- **iOS Shell Modes**: Switch between iOS Safari, Chrome, and full-bleed PWA Standalone with accurate Dynamic Island / cutout and safe-area overlays.

## Development

```bash
npm install
npm run typecheck
npm test
npm run dev:electron
```

## Build macOS App

```bash
npm run dist:app   # builds dist_dmg/mac-arm64/iPhone PWA Simulator.app
npm run dist:dmg   # builds macOS .dmg installer
```

## Handoff & Roadmap

See [`HANDOFF.md`](HANDOFF.md) for current architecture details and next pixel-accuracy milestones.
