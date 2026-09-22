# 💥 Flashbang Camera FX

A real-time webcam flashbang application that tracks hand gestures, plays the authentic CS:GO voice call, and detonates an authentic tactical flashbang effect (blinding whiteout, retinal after-image, screen shake, and tinnitus ear ringing). 

Built to be used as a **Virtual Camera** inside **Discord, Zoom, and Google Meet** via OBS Studio.

---

## ✨ Features

- **✌️ Gesture Recognition (MediaPipe Tasks Vision)**:
  - **✌️ Peace Sign (Victory)**: Default instant trigger.
  - **✊💨 Tactical Throw**: Closed fist moving swiftly and opening into palm.
  - **👌 Pin Pull**: Pinch and pull gesture.
  - **🖐️ Open Palm Stop**: High-five / stop gesture.
- **🗣️ CS:GO Audio & Procedural Sound Engine**:
  - *"Throwing flashbang!"* radio voice line.
  - Tactical fuse delay: 1.5s between the voice line and the detonation right as the grenade pin pops (or instant blast).
  - Sub-bass body thump (140Hz downward sweep to 32Hz).
  - Authentic 3.95 kHz binaural tinnitus ear ringing with exponential decay.
- **🎨 Realistic Tactical Visuals**:
  - Blinding pure whiteout shockwave.
  - Retinal burn after-image: Captures a freeze-frame of your webcam at detonation time and solarizes/burns it into vision as eyesight recovers.
  - Trauma directional camera shake.
  - Peripheral vision blur and radial recovery.
- **🎥 Streamer & OBS Ready**:
  - **OBS Clean Mode (`C`)**: Hides all UI buttons and HUD elements for clean window capture.
  - **Camera Mirroring (`Mirror`)**: Flips webcam for natural mirror feedback.
  - **Hand Skeleton Display (`Skeleton`)**: Shows live tracked joints and detection status.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Server
```bash
npm run dev
```

Open `http://localhost:5173/` in your browser.

---

## 🎮 Controls & Shortcuts

| Key / Action | Description |
| :--- | :--- |
| **✌️ Peace Sign** | Gesture trigger in camera |
| **`Space` or `G`** | Detonate flashbang manually |
| **`C`** | Toggle OBS Clean Mode (hide UI) |
| **`F`** | Toggle Fullscreen |
| **`⚙️ Settings`** | Adjust duration, volume, fuse timing, or camera source |

---

## 🎥 Using with Discord, Zoom & Google Meet

1. Open **OBS Studio** on your computer.
2. Under **Sources**, click **`+`** and choose **Window Capture** (select this browser tab).
3. In the browser tab, press **`C`** to enter **OBS Clean Mode** (hides all UI overlays).
4. In OBS, click **"Start Virtual Camera"** (bottom-right dock).
5. In **Discord** or **Zoom**:
   - Go to **Settings ➡️ Video / Camera**.
   - Select **"OBS Virtual Camera"** as your webcam.
6. Make a **✌️ peace sign** in your video call to flashbang your friends!
