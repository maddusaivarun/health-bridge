# HealthBridge AI — Unified Healthcare Intelligence Platform

HealthBridge AI combines five connected healthcare AI capabilities into a unified, privacy-first full-stack web application:
1. **HealthGuide (`01`)**: General healthcare education assistant powered by server-side Gemini (`gemini-3.8-flash`) with real-time **Google Search grounding**, genuine source citation extraction, publication date inspection, and deterministic + AI urgent symptom triage interception (`108` / `112` / `911`).
2. **HealthAccess (`02`)**: Bilingual **English & Telugu (`తెలుగు`)** medical communication assistant that simplifies and translates approved health information while auditing that all numerical dosages, units, and clinical warnings are preserved verbatim.
3. **ClinicConnect (`03`)**: Approved clinic information assistant backed by **Cloud Firestore** (`/clinics`, `/clinic_faqs`). Retrieves published clinic schedules, doctor profiles, and bilingual FAQs without fabricating appointments or fees, and escalates unknown or real-time booking requests to clinic staff.
4. **PrivateMed (`04`)**: Privacy-first medical report explanation workflow. Defaults to **Strict Local-Only Mode** via an on-device **Ollama + Python FastAPI companion service (`127.0.0.1:8765`)** and a zero-network deterministic biomarker parser in browser RAM. Also provides a strictly separated, explicit opt-in **Multimodal Medical Image & Report Verifier** and a client-side **AES-256-GCM encrypted Patient Record Vault** (`/patient_records`).
5. **MedStruct (`05`)**: De-identified clinical note structuring assistant that outputs schema-constrained JSON, distinguishes absent information from explicit negative findings, runs an independent **Numeric Grounding & Schema Validator**, and enforces clinician review sign-off with Firestore Terminal State Locking (`/clinical_notes`).

---

## Project Structure

```text
/
├── .env.example                     # Example environment variables (no secrets committed)
├── firebase-applet-config.json      # Provisioned Firebase project & Firestore Enterprise config
├── firebase-blueprint.json          # Entity & Firestore path blueprint
├── firestore.rules                  # Hardened Zero-Trust Firestore Security Rules (ESLint verified)
├── firestore.rules.test.ts          # Security rules invariant verification suite
├── security_spec.md                 # Security specification & Dirty Dozen adversarial payloads
├── server.ts                        # Full-stack Express + Vite server with @google/genai endpoints
├── privatemd_companion/
│   ├── app.py                       # Local Python FastAPI companion service for on-device Ollama
│   └── requirements.txt             # Python dependencies for local companion
├── src/
│   ├── App.tsx                      # Unified application shell, 3-zone top bar & workspace router
│   ├── components/
│   │   ├── HealthGuideModule.tsx    # Module 1: Grounded search, triage & citation inspector
│   │   ├── HealthAccessModule.tsx   # Module 2: English & Telugu medical communication
│   │   ├── ClinicConnectModule.tsx  # Module 3: Firestore clinic assistant & staff portal
│   │   ├── PrivateMedModule.tsx     # Module 4: Local Ollama, image verifier & AES-256-GCM vault
│   │   ├── MedStructModule.tsx      # Module 5: Clinical note JSON extraction & schema validator
│   │   └── GovernanceAndStatusView.tsx # Live telemetry & feature acceptance status matrix
│   ├── lib/
│   │   ├── firebase.ts              # Firebase Auth, Firestore client & handleFirestoreError
│   │   └── cryptoVault.ts           # Browser-native WebCrypto PBKDF2 + AES-256-GCM encryption
│   └── shared/
│       ├── clinicalCore.ts          # Shared triage, PII scanner, schema validator & citation parser
│       └── sampleData.ts            # Explicitly labeled synthetic demonstration datasets
└── tests/
    └── healthbridge.test.ts         # Automated Vitest test suite
```

---

## Quick Start & Manual Setup Instructions

### 1. Environment & Gemini API Setup
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Set `GEMINI_API_KEY` in `.env` (or in the AI Studio **Settings > Secrets** panel). All `@google/genai` calls execute strictly server-side in `server.ts`.
3. Install dependencies and start the server on port 3000:
   ```bash
   npm install
   npm run dev
   ```

### 2. Firebase & Firestore Security Rules Setup
- Provisioned Firebase Project ID: `hidef-mapper-wk8sk`
- Lint and verify `firestore.rules` locally:
  ```bash
  npx eslint firestore.rules
  ```
- Run the automated test suites:
  ```bash
  npm test
  ```

### 3. PrivateMed Local Ollama & Python FastAPI Companion Setup (On Your Computer)
Because a cloud container's `127.0.0.1` does not point to your personal laptop, PrivateMed connects directly from your browser to `127.0.0.1` on your machine:
1. Install [Ollama](https://ollama.com) on your computer and pull a compact medical/general model:
   ```bash
   ollama pull llama3.2:3b
   ```
2. Start the included Python FastAPI companion service (bound strictly to `127.0.0.1:8765`, never exposed to the public internet):
   ```bash
   pip install -r privatemd_companion/requirements.txt
   uvicorn privatemd_companion.app:app --host 127.0.0.1 --port 8765
   ```
3. Open the **04. PrivateMed** tab in HealthBridge AI and click **Probe Local Companion**.

---

## Exporting & Continuing Development in Google Antigravity
1. Export the project files or clone into your Google Antigravity workspace.
2. Configure `GEMINI_API_KEY` in your local `.env` file.
3. Run `npm install && npm test` to verify all unit and security rule invariants.
4. Launch `npm run dev` for the unified web platform and `uvicorn privatemd_companion.app:app --host 127.0.0.1 --port 8765` for local report inference.

---

## Known Limitations & Expected Service Costs
- **Not a Medical Device**: HealthBridge AI is for educational awareness, communication, and clinical structuring demonstration. It never diagnoses conditions or replaces a physician.
- **Service Costs**: Uses Cloud Firestore Enterprise free tier (daily read/write quotas reset daily) and `gemini-3.8-flash` with server-side rate limiting (40 req/min/IP).
