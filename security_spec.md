# Security Specification — HealthBridge AI (`security_spec.md`)

## 1. Data Invariants & Master Source of Truth
1. **Default-Deny Catch-All**: All paths default to `allow read, write: if false;`.
2. **Path Variable Hardening**: Every single-document operation (`get`, `create`, `update`, `delete`) enforces `isValidId(docId)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
3. **Strict Schema & Anti-Update-Gap**: Every `create` and `update` operation invokes `isValid[Entity](incoming())` enforcing `hasAll`, `hasOnly`, string `.size()` bounds, enums, and `request.time` temporal integrity.
4. **Master Gate & Relational Consistency**: Every `clinic_faqs` creation verifies `exists(/databases/$(database)/documents/clinics/$(incoming().clinicId))`.
5. **PII / PHI Isolation**: `patient_records` (AES-256-GCM encrypted payloads) and `clinical_notes` are strictly isolated to `resource.data.ownerId == request.auth.uid`. Blanket `isSignedIn()` reads or lists are strictly forbidden.
6. **Terminal State Locking**: Once a `StructuredClinicalNote` reaches `reviewStatus == 'APPROVED_FINAL'`, further non-admin updates are blocked.
7. **Verified Identity**: Write operations require `request.auth != null && request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Payload 1 (Identity Spoofing on Patient Record)**: Authenticated user `user_A` attempts to create `/patient_records/rec_1` with `ownerId: "user_B"`. -> `PERMISSION_DENIED`.
2. **Payload 2 (Shadow Field Injection on Clinic FAQ)**: Admin attempts to update `/clinic_faqs/faq_1` with an undeclared field `"isVerified": true`. -> `PERMISSION_DENIED`.
3. **Payload 3 (Unbounded String / Denial of Wallet)**: User attempts to create `/patient_records/rec_2` with `recordTitle` of 5,000 characters (exceeds maxLength 160). -> `PERMISSION_DENIED`.
4. **Payload 4 (Path Variable Poisoning)**: Attacker sends `get` or `create` to `/patient_records/invalid$id!with*spaces`. -> `PERMISSION_DENIED`.
5. **Payload 5 (Timestamp Forgery)**: Client supplies a past/future `createdAt` instead of `request.time`. -> `PERMISSION_DENIED`.
6. **Payload 6 (Immortal Field Mutation)**: Owner updates `/patient_records/rec_1` attempting to mutate `ownerId` or `createdAt`. -> `PERMISSION_DENIED`.
7. **Payload 7 (Terminal State Bypass on Clinical Note)**: Owner attempts to modify `structuredPayload` on `/clinical_notes/note_1` after `reviewStatus` is already `'APPROVED_FINAL'`. -> `PERMISSION_DENIED`.
8. **Payload 8 (Cross-Tenant Read on Patient Record)**: Authenticated user `user_B` attempts `get` or `list` on `user_A`'s `/patient_records`. -> `PERMISSION_DENIED`.
9. **Payload 9 (Orphaned Clinic FAQ Write)**: Admin creates `/clinic_faqs/faq_99` referencing non-existent `clinicId: "ghost_clinic"`. -> `PERMISSION_DENIED`.
10. **Payload 10 (Unverified Email Write)**: User with `email_verified: false` attempts to create a record or spoof admin email `madduvarun5@gmail.com`. -> `PERMISSION_DENIED`.
11. **Payload 11 (Value Poisoning on Update)**: Owner updates `status` on `/patient_records/rec_1` with `"deleted"` (not in `['active', 'archived']`). -> `PERMISSION_DENIED`.
12. **Payload 12 (Self-Assigned Admin Escalation)**: Non-admin user attempts to write to `/admins/user_A`. -> `PERMISSION_DENIED`.
