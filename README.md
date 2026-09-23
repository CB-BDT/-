# TradeLingo for WhatsApp (Free & Open-Source Translation Toolkit)

**Language / 语言**: English | [简体中文](./README.zh-CN.md)

A WhatsApp Web browser extension (Chrome / Edge, Manifest V3): **two-way translation**, **contact profile management**, **quick replies & scheduled messages**, AI chat summarization, AI-suggested replies, location sharing and scheduled sending — all data stays on your machine.

> Unofficial project, not affiliated with WhatsApp / Meta in any way. Please read the disclaimer at the bottom before use.

## Features

**Translation**
- Incoming messages are auto-translated; the translation appears as a badge under each bubble (viewport-based lazy loading — smooth even with very long chat histories)
- **Per-message engine switching**: Google (free) / Lingva (free) / DeepL / custom AI model
- Outbound translation toolbar: type your language, send in the customer's language. Supports "replace & send" and "Enter to send the translation"
- Speaker gender support (feminine/masculine word forms) for more accurate person forms in Spanish and similar languages
- Automatic failover to backup engines; key-configuration errors fail fast with a clear message instead of silently falling back

**Contacts & Messages**
- Detects country / default language from phone number and auto-matches inbound target language (manually overridable, remembered per conversation)
- Contact profile card with notes (name, role, interests, birthday, notes) shown as a fully-expanded persistent bar under the chat header
- Detects the counterpart's device type (iOS / Android / Web / unknown)
- Location messages previewed on a map
- Quick-reply panel (resizable, width remembered)
- Scheduled messages (randomized anti-detection delay, duplicate-send protection, offline catch-up sending)

**AI**
- AI conversation summary: reads the customer's **entire chat history** (as much as the local API allows; long chats are truncated to the recent part with a note), streamed output, saveable to the contact notes
- AI suggested replies: reads the last 50 messages + your **purpose prompt** (auto-saved), generates **A/B/C** candidate replies — click one to fill the chat input box. Candidate language is configurable (defaults to "translate incoming messages into", i.e. the language you read); automatically translated into the customer's language on send

**UI**
- Interface language: **Simplified Chinese / English** (default Simplified Chinese) — covers the bottom toolbar, quick-reply panel, contact profile card, schedule modal, settings page and every toast/message
- Changes apply instantly and are remembered — no browser restart or reinstall needed

## Getting Started

### 1. Build

```bash
npm install
npm run build
```

Output directory: `build/chrome-mv3-prod`

### 2. Install into the browser

1. Open `chrome://extensions` (Edge: `edge://extensions`)
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `build/chrome-mv3-prod` directory
4. Open (and refresh) https://web.whatsapp.com

### 3. About API keys (important)

This repository **contains no keys** — use your own accounts:

| Engine | Key needed? | Notes |
| --- | --- | --- |
| Google Translate (free) | No | Default engine, works out of the box |
| Lingva (free) | No | Community public instance, moderate reliability |
| DeepL | **Yes** | Enter your own key in the extension's Settings page (free-tier keys end with `:fx`) |
| Custom AI model | **Yes** | Any OpenAI-compatible endpoint: fill in "API URL + model name + API key" and import in one click |

All keys are stored only in your browser's local storage and are never uploaded to any server.

### 4. Interface language

At the top of the Settings page, choose **Simplified Chinese** (default) or **English**. All injected UI and messages switch immediately and are saved locally. Older installs keep Chinese as default after upgrade — the UI won't change unexpectedly.

## Development

```bash
npm run dev      # Plasmo dev mode (hot reload)
npm run build    # production build
npx tsc --noEmit # type check
npm run package  # package as zip
```

Stack: Plasmo + TypeScript + React, MV3 dual-world communication (isolated-world content script ↔ MAIN-world wa-js relay).

### Project layout

```
src/
  contents/whatsapp.ts   Content-script main entry (message sync, badges, toolbar mounting)
  bg/                    Background: routing, translation chain & failover, cache, task queue
  core/                  Config, settings, storage, CRM, quick replies, scheduler, device detection, i18n, etc.
  engines/               Translation engine implementations (google / lingva / deepl / custom)
  ui/                    UI components (badges, toolbar, settings page, profile card, quick-reply panel)
  adapters/              WhatsApp DOM / wa-js adapter layer
scripts/relay.js         MAIN-world bridge script (copied into the build output)
```

### Build-time defaults

To preset defaults for your private build (default engine, pre-filled key, Lingva instance URL), edit one place: `src/core/config.ts`. Optional environment variables are documented in `.env.example`.

## Privacy

- The extension has **no server** — it collects and uploads no chat data whatsoever
- Translation requests go directly from your browser to the engine you chose (Google / Lingva / DeepL / your own endpoint)
- Contact profiles, quick replies, scheduled tasks and translation caches are all stored locally in your browser
- The built-in self-check overlay (`Ctrl+Shift+D` / `Cmd+Shift+D`) renders debug info locally only (for issue screenshots) and never goes online

See [privacy.md](./privacy.md) for the full privacy policy.

## Visual identity

Injected UI uses a dedicated **CB BDT** look (cold titanium blue `#3a5769` + metallic copper orange `#a85d2f` + embossed steel texture), completely different from WhatsApp's native green, so you can tell at a glance what's the extension and what's WhatsApp. Injected surfaces carry CB BDT branding (quick-reply panel header/collapse button, bottom toolbar, settings page header).

## Disclaimer

1. **Purpose**: This project is for personal technical research, learning and exchange only. The author makes no warranty, express or implied, as to its accuracy, completeness or fitness for a particular purpose.
2. **Compliance**: Please use this project in compliance with your local laws and regulations. It is strictly prohibited to use this project or its derivatives for any illegal purpose, including but not limited to network attacks, data theft or unauthorized intrusion.
3. **Liability**: Any direct or indirect consequence, legal liability or loss arising from the use of this project shall be borne solely by the user. The original author assumes no joint liability of any kind.
4. **Non-infringement**: All content in this project is personal technical practice sharing, and involves no commercial secrets or third-party infringement.

In addition: this is an unofficial third-party tool, not affiliated with, authorized or endorsed by WhatsApp or Meta. Please comply with WhatsApp's Terms of Service and do not use it for spam or bulk harassment. Automation carries account risk; you bear that risk yourself.

## License

[MIT](./LICENSE)
