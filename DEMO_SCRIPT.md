# Demo video script (target: 2:30, English)

Record at 1080p in Chrome 139+ with Gemini Nano already downloaded. Have the app open on the public URL, privacy mode on, demo data loaded, DevTools closed. Keep the network toggle (or Wi-Fi) within reach.

---

### 0:00 – 0:15 · Hook (face the wallet screen)
**Voiceover:** "Your financial data is the most sensitive thing you own, yet most AI assistants upload all of it. DG Nexus AI, Hybrid Edition, decides for every request: does this stay on your device, or does it need the cloud?"

*On screen:* wallet, card, metrics. Hover the header chips.

### 0:15 – 0:35 · What's under the hood
**Voiceover:** "It's built on Firebase AI Logic's hybrid inference. Gemini Nano runs locally in Chrome. Gemini Flash runs in the cloud. Firebase App Check protects every call, and Firestore keeps the data offline-first."

*On screen:* point at the chips: Gemini Nano ready, App Check, Firestore synced.

### 0:35 – 1:05 · Private task on-device
**Voiceover:** "Privacy mode is on, so receipts are pinned to the device. Let me add a payment note."

*Action:* run `/add Paid $23.40 at Casa Luna for lunch`.

**Voiceover:** "The badge says On-Device, Gemini Nano. Amount, merchant and category were extracted locally, and the routing panel shows zero bytes sent to the cloud. The requested mode is ONLY_ON_DEVICE."

*On screen:* badge, routing panel (Requested mode, Bytes sent: 0), new row in Recent activity.

### 1:05 – 1:20 · Privacy audit
*Action:* run `/audit`.

**Voiceover:** "The privacy audit reads every raw record, so it's always on-device. It also reports how many sensitive records exist and how many bytes have left this device."

### 1:20 – 1:55 · Deep analysis in the cloud
**Voiceover:** "For heavy reasoning, we use the cloud. Watch what actually gets sent."

*Action:* run `/analyze`, then open the first entry of the **Cloud egress log**.

**Voiceover:** "The badge now says Cloud, Firebase AI Logic, mode ONLY_IN_CLOUD. And here's the exact payload: only category totals. No merchants, no notes, and sensitive health records are excluded."

*Action:* run `/anomalies`.

**Voiceover:** "Same firewall: it flags the unusually large electronics purchase without knowing where it happened."

### 1:55 – 2:20 · Offline proof
**Voiceover:** "Now the real test. I'm going offline."

*Action:* turn off Wi-Fi (chip turns Offline). Run `/add Pharmacy $34.60 prescription refill`, then `/analyze`.

**Voiceover:** "Parsing still works, fully on-device. The cloud analysis tells me it needs a connection instead of failing silently. The new record is saved in Firestore's offline cache and will sync when I reconnect."

*Action:* turn Wi-Fi back on; chip shows Pending sync, then Firestore synced.

### 2:20 – 2:30 · Close
**Voiceover:** "DG Nexus AI, Hybrid Edition: private by default, powerful when you choose. Built with Firebase AI Logic, Gemini Nano, App Check and Firestore. Thanks for watching."

*On screen:* logo, repo and live URL.

---

## Checklist before recording
- [ ] Gemini Nano shows "ready" (use **Enable on-device AI** at least once beforehand).
- [ ] App Check chip shows green (debug token registered, or reCAPTCHA key valid for the domain).
- [ ] Demo data loaded; `/add` and `/analyze` each tested once online.
- [ ] Rehearse the offline step: the first `/add` offline must succeed on-device.
- [ ] Video is public on YouTube, ≤ 3 minutes, English audio or subtitles.
