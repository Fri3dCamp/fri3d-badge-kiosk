# Fri3d Kiosk Flasher

This is a program to easily repair your board that you bought or received at [Fri3d camp](https://fri3d.be).

Currently Supported:

- Badge 2026
- Badge 2024
- Badge 2022
- Blaster
- Flamingo
- Communicator 2026
- Communicator 2024
- DJ Addon 2026

## Development

This is an electron app that uses Vite with React Typescript as a frontend.

## To use

Download the latest version for your platform here: https://github.com/DrSkunk/fri3d-badge-kiosk/releases/latest

### macOS

Download the DMG matching your Mac:

- `arm64` for Apple Silicon (M1, M2, M3, M4, etc.)
- `x64` for Intel Macs

The macOS app is unsigned, so Gatekeeper may block it on first launch.

To open it with Finder:

1. Copy **Fri3d Badge Fixer** to the Applications folder.
2. Control-click or right-click the app and select **Open**.
3. Select **Open** again in the warning dialog.

Alternatively, remove the quarantine attribute in Terminal and launch the app:

```sh
xattr -dr com.apple.quarantine "/Applications/Fri3d Badge Fixer.app"
open "/Applications/Fri3d Badge Fixer.app"
```

Open the app and click the cogwheel in the top right corner, then click **Download flashers & firmware**. This downloads the flashing tools and the latest published firmware from [BadgeHub](https://badgehub.eu/) into the `flashers` and `firmware` directories next to the binary.

### Manual setup

If you prefer to set things up manually (for example on a machine without internet access), create the `flashers` and `firmware` directories next to your downloaded binary.

Add your platform's respective versions of the flashing tools to the `flashers` directory. Or make them available in your path.

Current flashers are:

- [avrdude](https://github.com/avrdudes/avrdude): `avrdude.exe` for Windows, `avrdude` for others
- [esptool](https://github.com/espressif/esptool): `esptool.exe` for Windows, `esptool` or `esptool.py` for others
- [wchisp](https://github.com/ch32-rs/wchisp): `wchisp.exe` for Windows, `wchisp` for others

Follow the [Boards manifest](./public/boards/index.json) to see which firmwares you have to put in the `firmware` directory.

Currently this is:

- `badge_2026.bin`
- `badge_2024.bin`
- `badge_2022.bin`
- `blaster.hex`
- `flamingo.hex`
- `communicator_2026.bin`
- `communicator_2024.bin`
- `dj_2026.bin`

Firmware downloads use BadgeHub project and file references from the boards manifest. Downloads are checked against BadgeHub's size and SHA-256 metadata before replacing local firmware.

## Adding a new board

1. Add an entry to [public/boards/index.json](./public/boards/index.json) with a unique `key`, a `chipType` (`ESP`, `AVR` or `WCHISP`), the local `firmware` filename and a BadgeHub `download` source containing its project slug and file name.
2. Create `public/boards/<key>/` with `icon.webp`, `instructions.en.md` and `instructions.nl.md`.
3. If the board uses a new chip, add a flasher to the `flashers` map in [electron/flasher.cjs](./electron/flasher.cjs) and a download source in [electron/downloader.cjs](./electron/downloader.cjs).
