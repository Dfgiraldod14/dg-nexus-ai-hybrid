# DG Nexus AI (Hybrid Edition)

**Developed by DG Alpha Systems.**

> A private financial assistant that **decides, per request, whether your data stays on your device (Gemini Nano) or goes to the cloud (Gemini via Firebase AI Logic)**, and shows you the decision in real time.

Built for **#BuildHybridAI 2026**. Licensed under [Apache 2.0](./LICENSE).

- **Live demo:** `<add your Firebase Hosting URL here>`
- **Demo video (≤ 3 min):** `<add your YouTube URL here>`

---

## Value proposition

Financial data is the most sensitive data a person owns, yet most AI assistants upload it all. DG Nexus AI (Hybrid Edition) splits the work by sensitivity:

| What you do | Where it runs | Why |
|---|---|---|
| Parse a receipt or payment note, classify it, extract amount and concept | **On-device (Gemini Nano)** | Raw merchants and notes never leave the browser. Works offline. |
| Privacy audit of all your records | **On-device only** | It reads everything, so it is pinned to your device. |
| Deep performance analysis, budget simulation, anomaly detection | **Cloud (Gemini Flash)** | Needs a larger model. Receives **anonymized category aggregates only**. |

A **live badge** on every answer (`⚡ On-Device: Gemini Nano` vs `☁ Cloud: Firebase AI Logic`), a **routing panel** and a **cloud egress log** (the exact payload of everything that left the device) make the privacy story verifiable instead of a promise.

## Existing Project & Hackathon Additions

This project starts from a previous concept by **DG Alpha Systems**: *Nexus AI*, a design for a smart wallet and financial dashboard. As the hackathon rules require for projects that build on earlier work, this section states exactly what came from before and what was built for the hackathon.

### What existed before the hackathon
- **Design concept only** of the *Nexus AI* wallet and financial panel: the idea of a wallet view, a card with a privacy toggle, a metrics panel and a payments/analysis terminal.
- No code from that earlier work is reused in this repository.

### What was built from scratch for #BuildHybridAI 2026
All code in this repository was written for the hackathon:
- **Hybrid inference with Firebase AI Logic** (`src/ai/hybrid.ts`, `src/ai/router.ts`): `getAI` + `GoogleAIBackend`, `getGenerativeModel` with `InferenceMode.ONLY_ON_DEVICE` / `PREFER_ON_DEVICE` / `ONLY_IN_CLOUD`, `initializeDeviceModel`, `generateContent`, and runtime detection of `inferenceSource`.
- **Gemini Nano on-device workflows**: receipt/note parsing, classification and the privacy audit.
- **Privacy-based routing**: the card's privacy toggle controls the inference mode (`ONLY_ON_DEVICE` when on).
- **Privacy firewall for the cloud** (`buildCloudPayload` in `src/ai/tasks.ts`): only category-level aggregates leave the device; high-sensitivity records are excluded.
- **Real-time routing UI**: inference badge, routing panel with the requested mode and the side that executed, and a cloud egress log.
- **Firebase App Check** with reCAPTCHA Enterprise and debug-token support (`src/firebase.ts`).
- **Firestore offline-first persistence** and **anonymous Firebase Auth** with per-user security rules (`firestore.rules`).
- The wallet, card, metrics and terminal interface, the service worker for offline loading, the Firebase Hosting configuration and this documentation.

---

## Hybrid inference architecture

```
                         ┌─────────────────────────────────────────┐
  Terminal / UI  ──────► │ src/ai/router.ts  policyFor(task, privacy)│
                         └───────────────┬─────────────────────────┘
                                         │ InferenceMode
                         ┌───────────────▼─────────────────────────┐
                         │ src/ai/hybrid.ts  runHybrid()            │
                         │  getAI(app, GoogleAIBackend)             │
                         │  getGenerativeModel(ai, { mode, ... })   │
                         │  model.generateContent(prompt)           │
                         └──────┬───────────────────────┬──────────┘
        ONLY_ON_DEVICE /        │                       │   ONLY_IN_CLOUD
        PREFER_ON_DEVICE        │                       │
                ┌───────────────▼──────┐        ┌───────▼───────────────────┐
                │ Chrome Prompt API     │        │ Gemini (Flash) through     │
                │ Gemini Nano (local)   │        │ Firebase AI Logic          │
                │ no network, no cost   │        │ protected by App Check     │
                └───────────────────────┘        └────────────────────────────┘
                          │                                  ▲
                          │                  src/ai/tasks.ts buildCloudPayload():
                          └─ raw data stays here             anonymized aggregates only
```

### Where Firebase AI Logic is called at runtime

| Concern | File | API |
|---|---|---|
| Initialize AI Logic | `src/ai/hybrid.ts` | `getAI(app, { backend: new GoogleAIBackend() })` |
| Create hybrid models | `src/ai/hybrid.ts` → `modelFor()` | `getGenerativeModel(ai, { mode, inCloudParams, onDeviceParams })` |
| Download/warm Gemini Nano (needs a click) | `src/ai/hybrid.ts` → `enableOnDevice()` | `model.initializeDeviceModel(onProgress)` |
| Run inference | `src/ai/hybrid.ts` → `runHybrid()` | `model.generateContent(prompt)` |
| Know who answered | `src/ai/hybrid.ts` → `resolveSource()` | `result.response.inferenceSource` (`ON_DEVICE` / `IN_CLOUD`) |
| Mode per task | `src/ai/router.ts` → `policyFor()` | `InferenceMode.*` |
| Real prompts | `src/ai/tasks.ts` | `parseNote`, `privacyAudit`, `deepAnalysis`, `budgetSimulation`, `detectAnomalies` |

### Routing policy

| Task | Mode | Notes |
|---|---|---|
| `/add` (parse + classify) | `ONLY_ON_DEVICE` with privacy mode on, `PREFER_ON_DEVICE` with it off | With `PREFER_ON_DEVICE` the SDK may fall back to the cloud; the UI says so when it happens. |
| `/audit` | `ONLY_ON_DEVICE` | Always local. |
| `/analyze`, `/simulate`, `/anomalies` | `ONLY_IN_CLOUD` | Aggregates only. Fails clearly when offline. |

### App Check

`src/firebase.ts` initializes **Firebase App Check** with `ReCaptchaEnterpriseProvider` and supports **debug tokens**: `FIREBASE_APPCHECK_DEBUG_TOKEN` is set before `initializeAppCheck` in `npm run dev` or whenever `VITE_APPCHECK_DEBUG_TOKEN` is provided. Firebase AI Logic requests carry the App Check token automatically.

### Persistence

Transactions live in Firestore at `users/{uid}/transactions`, with IndexedDB persistence (`persistentLocalCache`) so the app reads and writes while offline and syncs later. Auth is anonymous; rules restrict each user to their own path.

---

## Run it locally

### Prerequisites
- Node.js 20+.
- **Google Chrome 139+ on desktop** for on-device inference. Other browsers still work, using the cloud only (the UI shows Nano as unavailable).
- A Google account to create a Firebase project.

### 1. Create the Firebase project
1. Go to the [Firebase console](https://console.firebase.google.com) → **Add project**. Analytics is optional.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
3. **Build → Firestore Database → Create database** (production mode, any region).
4. **AI Services → AI Logic → Get started**, and choose **Gemini Developer API** (works on the free Spark plan).
5. **Project settings → Your apps → Web (`</>`)**: register an app and copy the config values.
6. **Build → App Check → Apps → your web app → reCAPTCHA Enterprise**: register with a site key from [Google Cloud reCAPTCHA Enterprise](https://console.cloud.google.com/security/recaptcha), then in **APIs** enforce App Check for **Firebase AI Logic** and **Cloud Firestore**.
7. Publish the Firestore rules in this repo (step 4 below).

### 2. Configure `.env`
```bash
cp .env.example .env
```
Fill the `VITE_FIREBASE_*` values from step 5. Set `VITE_APPCHECK_SITE_KEY` to your reCAPTCHA Enterprise key.

### 3. App Check debug token (development and evaluation)
1. Leave `VITE_APPCHECK_DEBUG_TOKEN` empty and run `npm run dev`.
2. Open the app and look in the browser console for `App Check debug token: <uuid>`.
3. In **Firebase console → App Check → Apps → your app → ⋮ → Manage debug tokens → Add**, paste it.
4. Reload. The header chip shows **App Check: debug token**.

For a judging build, you can paste a pre-registered token into `VITE_APPCHECK_DEBUG_TOKEN`. It is embedded in the bundle, so use a dedicated token and delete it from the console after judging. Never commit `.env`.

### 4. Install, deploy rules, run
```bash
npm install
npx firebase-tools login
npx firebase-tools use <your-project-id>
npx firebase-tools deploy --only firestore:rules
npm run dev            # http://localhost:5173
```

### 5. Enable Gemini Nano in Chrome
1. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, set **Enabled**, and restart Chrome.
2. In the app click **Enable on-device AI** (Chrome requires a user gesture). The model download can take several minutes. Check progress at `chrome://on-device-internals`.
3. The header chip changes to **Gemini Nano ready**.

### 6. Deploy a public URL
```bash
npm run deploy         # builds and runs `firebase deploy` (Hosting + Firestore rules)
```
Add the Hosting domain to your reCAPTCHA Enterprise key's allowed domains. Anonymous Auth works on the default `*.web.app` domain.

---

## Try the hybrid behaviour

1. Click **Load demo data**.
2. Privacy mode **on**: `/add Paid $23.40 at Casa Luna for lunch` → badge `⚡ On-Device: Gemini Nano`, **0 bytes** sent.
3. `/analyze` → badge `☁ Cloud: Firebase AI Logic`. Open the **egress log** to see the exact anonymized payload.
4. Turn off Wi-Fi: `/add …` and `/audit` still work on-device; `/analyze` explains that it needs a connection. New records sync when you reconnect.

## Project structure

```
src/
  firebase.ts          App Check (+ debug token), Auth, Firestore offline cache
  ai/hybrid.ts         Firebase AI Logic hybrid core (runtime calls)
  ai/router.ts         Task → InferenceMode policy, Nano availability
  ai/tasks.ts          Prompts, JSON parsing, cloud privacy firewall
  data/transactions.ts Firestore CRUD + demo data
  ui/                  Badge, status chips, app rendering
public/sw.js           Offline app shell
firestore.rules        Per-user access rules
firebase.json          Hosting + Firestore config
```

## Known limits

- On-device inference in Firebase AI Logic is text-oriented single-turn generation with a limited context (about 9k tokens), so the audit looks at the 40 most recent records.
- Gemini Nano output is less predictable than cloud models; `/add` asks for strict JSON and reports a clear error if the output cannot be parsed.
- Demo data and the card number shown in the UI are fictional.

## License

Apache License 2.0. See [LICENSE](./LICENSE).
