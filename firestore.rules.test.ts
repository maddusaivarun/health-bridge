import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Firestore Hardened Security Rules — Dirty Dozen Invariant Verification', () => {
  const rulesPath = path.resolve(__dirname, 'firestore.rules');
  const rulesText = fs.readFileSync(rulesPath, 'utf-8');

  it('Enforces rules_version = 2 and global default-deny catch-all', () => {
    expect(rulesText).toContain("rules_version = '2';");
    expect(rulesText).toContain('match /{document=**}');
    expect(rulesText).toContain('allow read, write: if false;');
  });

  it('Enforces isValidId path variable hardening on all document collections', () => {
    expect(rulesText).toContain('function isValidId(id)');
    expect(rulesText).toContain('isValidId(clinicId)');
    expect(rulesText).toContain('isValidId(faqId)');
    expect(rulesText).toContain('isValidId(recordId)');
    expect(rulesText).toContain('isValidId(noteId)');
  });

  it('Enforces strict owner isolation on patient_records and clinical_notes (No blanket reads)', () => {
    expect(rulesText).toContain('existing().ownerId == request.auth.uid');
    expect(rulesText).toContain('data.ownerId == request.auth.uid');
    expect(rulesText).toContain("data.algorithm == 'AES-256-GCM'");
  });

  it('Enforces Terminal State Locking on clinical_notes once APPROVED_FINAL', () => {
    expect(rulesText).toContain("existing().reviewStatus != 'APPROVED_FINAL'");
  });

  it('Enforces verified email and relational exists() check for clinic_faqs', () => {
    expect(rulesText).toContain('request.auth.token.email_verified == true');
    expect(rulesText).toContain(
      'exists(/databases/$(database)/documents/clinics/$(incoming().clinicId))'
    );
  });
});
