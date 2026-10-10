#!/usr/bin/env python3
"""Generate application icons for Tauri v2 macOS build."""
import os
import subprocess
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_TAURI_DIR = PROJECT_ROOT / "src-tauri"
ICONS_DIR = SRC_TAURI_DIR / "icons"

# SVG with modern purple gradient, headphones / speech soundwave aesthetic
SVG_ICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b" />
      <stop offset="50%" stop-color="#312e81" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#818cf8" />
      <stop offset="50%" stop-color="#a855f7" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Background Rounded Squircle -->
  <rect x="24" y="24" width="464" height="464" rx="104" fill="url(#bgGrad)" filter="url(#shadow)"/>
  <rect x="24" y="24" width="464" height="464" rx="104" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="3"/>

  <!-- Play & Soundwave / Speech Bubble Icon -->
  <g transform="translate(136, 136)">
    <!-- Play Triangle -->
    <path d="M 60 40 L 190 120 L 60 200 Z" fill="url(#glowGrad)"/>
    
    <!-- Sound Waves / Echo Arc -->
    <path d="M 195 70 A 70 70 0 0 1 195 170" fill="none" stroke="#a855f7" stroke-width="18" stroke-linecap="round"/>
    <path d="M 225 45 A 110 110 0 0 1 225 195" fill="none" stroke="#818cf8" stroke-width="14" stroke-linecap="round" opacity="0.8"/>
  </g>
</svg>
"""

def generate_icons():
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    svg_path = ICONS_DIR / "icon.svg"
    svg_path.write_text(SVG_ICON, encoding="utf-8")
    print(f"✅ SVG icon created at {svg_path}")

    # Use npx tauri icon if available
    try:
        res = subprocess.run(["npx", "tauri", "icon", str(svg_path), "-o", str(ICONS_DIR)], cwd=str(PROJECT_ROOT))
        if res.returncode == 0:
            print("✅ All macOS and Tauri icons successfully generated via @tauri-apps/cli!")
            return
    except Exception as e:
        print(f"ℹ️ npx tauri icon fallback: {e}")

    # Fallback: using qlmanage / sips on macOS
    print("🎨 Generating PNG and ICNS using macOS built-in tools...")
    base_png = ICONS_DIR / "icon.png"
    subprocess.run(["qlmanage", "-t", "-s", "512", "-o", str(ICONS_DIR), str(svg_path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ql_png = ICONS_DIR / "icon.svg.png"
    if ql_png.exists():
        ql_png.rename(base_png)

    # Generate various sizes
    sizes = [32, 128, 256, 512]
    iconset_dir = ICONS_DIR / "icon.iconset"
    iconset_dir.mkdir(parents=True, exist_ok=True)

    for sz in sizes:
        out_file = ICONS_DIR / f"{sz}x{sz}.png"
        subprocess.run(["sips", "-z", str(sz), str(sz), str(base_png), "--out", str(out_file)], stdout=subprocess.DEVNULL)
        subprocess.run(["sips", "-z", str(sz), str(sz), str(base_png), "--out", str(iconset_dir / f"icon_{sz}x{sz}.png")], stdout=subprocess.DEVNULL)
        if sz * 2 <= 1024:
            out_2x = ICONS_DIR / f"{sz}x{sz}@2x.png"
            subprocess.run(["sips", "-z", str(sz * 2), str(sz * 2), str(base_png), "--out", str(out_2x)], stdout=subprocess.DEVNULL)
            subprocess.run(["sips", "-z", str(sz * 2), str(sz * 2), str(base_png), "--out", str(iconset_dir / f"icon_{sz}x{sz}@2x.png")], stdout=subprocess.DEVNULL)

    # Generate .icns
    subprocess.run(["iconutil", "-c", "icns", str(iconset_dir), "-o", str(ICONS_DIR / "icon.icns")], stdout=subprocess.DEVNULL)
    shutil.rmtree(iconset_dir, ignore_errors=True)
    print("✅ Icons generated successfully.")

if __name__ == "__main__":
    generate_icons()
