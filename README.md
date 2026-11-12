# Camel Quest

A 3D endless desert runner built with [Three.js](https://threejs.org/). Outrun the desert, eat shawarma, and run through the portal to the [Interactive Resume](https://koulmesahil.github.io/InteractiveResumeGame/).

## Play

Images load through WebGL, so open it through a local web server rather than double-clicking `index.html`:

```bash
cd camelquest-main
python3 -m http.server 8000
# then open http://localhost:8000
```

On GitHub Pages it works as-is.

## Controls

| | Desktop | Phone |
|---|---|---|
| Change lane | ← → or A D | Swipe left / right |
| Jump | ↑, W or Space | Swipe up |
| Slide | ↓ or S | Swipe down |
| Pause | P or Esc | Pause button |
| Restart | R | Run again |
| Mute | M | Sound button |

## How it works

- Collect **10 shawarmas** (set `SHAWARMA_GOAL`) and the portal opens ahead of you.
- Cacti and rocks cost health. Jump logs and rocks, slide under the stone arches, switch lanes around cacti.
- The sky moves through Morning → Golden Hour → Dusk as you run.
- Run into the portal and the game sends you to the Interactive Resume.

## Files

- `game.js` — the whole game (scene, camel model + gallop animation, obstacles, portal, input, audio)
- `index.html`, `style.css` — HUD, menus, phone layout
- `libraries/three.min.js` — Three.js r149 (kept local, no CDN)
- `assets/images/` — `background.png` (Dubai skyline on the horizon) and `portal.png`
- `_original_p5_version/` — the previous p5.js game, kept as a backup

## Tweaking

Everything is at the top of `game.js` in `CFG`: portal destination, shawarma goal, speeds, jump height, lane width, how long each time of day lasts.
