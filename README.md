[Click Here For the Products](https://drive.google.com/drive/folders/1FyG6att_S-56kiXte--ADyf_XT2_6v28?usp=drive_link)

# hackathonPractice
Practice for Hackathon 2026

## BatonGuard demo

**AI watches the traffic, warns before impact.**

Live site: https://chun16.github.io/hackathonPractice/

An interactive browser simulation of BatonGuard for traffic controllers at a work zone. The left panel has two views:

- **CCTV camera** (default): the feed from the camera on the VMS trailer's mast, facing oncoming traffic. Turn the AI overlay off to see the raw feed.
- **AI scene view:** the site rebuilt from CCTV and radar: two same-direction lanes, the outer lane closed with cones, workers in the closed lane, and the VMS trailer showing the STOP / SLOW board.

Every vehicle gets a 5 second predicted path and a level: NORMAL, CAUTION or EVACUATE.

### What you can do on the page

- **Scenario menu:** the showcase (one car merges out of the closed lane and stays NORMAL; another stays in the closed lane and goes CAUTION, auto-STOP, then EVACUATE), plus 9 test scenarios.
- **Controller remote:** press STOP or SLOW at any time.
- **Worker wristband:** cancel a CAUTION alert (counted as a false alarm). EVACUATE cannot be cancelled.
- **View toggle:** switch between the CCTV camera and the AI scene view at any time.
- **Playback:** play, pause, restart, 0.5x to 2x speed, AI overlay on or off, and a time slider.

All vehicle data is simulated and every threshold is a demo value.

### Files

| Path | What it is |
| --- | --- |
| `index.html` | The website. A single self-contained file built from `src/`. |
| `src/engine.js` | Decision engine (logic spec v1.1) and traffic simulator. |
| `src/scenarios.js` | The showcase and the 9 test scenarios. |
| `src/ui.js` | Scene drawing, panels and controls. |
| `src/page.html` | Page layout and styles. |
| `build.py` | Rebuilds `index.html` from `src/`. |

### Editing

1. Change files in `src/`.
2. Run `python3 build.py` to rebuild `index.html`.
3. Commit both `src/` and `index.html`. GitHub Pages serves `index.html` from the `main` branch.
