/**
 * Deterministic synthetic data generator for the non-wakeword exhibits.
 * Run: npm run data
 * (Fig. 01 wakeword data is real — see ml/wakeword/export_wakeword.py.)
 *
 * Output goes to public/data/. Each file conforms to the JSON Schema of the
 * same name in public/data/schemas/. To ship real model outputs, replace
 * these files with real data matching the schemas — no code changes needed.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'data');
mkdirSync(out, { recursive: true });

/* ---------- deterministic PRNG ---------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r3 = (x) => Math.round(x * 1000) / 1000;

/* NOTE: wakeword-clips.json is NOT generated here — it is a real artifact
 * exported from the trained model by ml/wakeword/export_wakeword.py. */

/* ============================================================
 * 1. DIARIZATION TIMELINE — diarization.json (synthetic, privacy-safe)
 * ============================================================ */
const diarization = {
  $schema: 'schemas/diarization.schema.json',
  durationSec: 32,
  rtf: 0.8,
  speakers: [
    { id: 'S1', name: 'Margaret', role: 'daughter' },
    { id: 'S2', name: 'Dr. Okafor', role: 'physician' },
    { id: 'S3', name: 'Sam', role: 'caregiver' },
  ],
  segments: [
    { speaker: 'S1', start: 0.6, end: 4.1, text: 'Morning, Dad — Dr. Okafor is here for your checkup.' },
    { speaker: 'S2', start: 4.6, end: 9.8, text: 'Good morning! Last time we talked about your garden. How are the tomatoes?' },
    { speaker: 'S1', start: 10.3, end: 12.4, text: 'He repotted them on Sunday.' },
    { speaker: 'S3', start: 13.1, end: 16.7, text: 'I can bring the planter inside if it frosts this week.' },
    { speaker: 'S2', start: 17.4, end: 23.0, text: 'Perfect. Now, any dizziness since we adjusted the medication?' },
    { speaker: 'S1', start: 23.8, end: 26.5, text: 'He mentioned a little, on Tuesday morning.' },
    { speaker: 'S3', start: 27.2, end: 31.4, text: 'Tuesday, right after breakfast — I wrote it in the log.' },
  ],
  /** moments where audio + vision identity signals are reconciled */
  reconciliation: [
    {
      t: 4.6, segmentSpeaker: 'S2',
      voice: { match: 'S2', confidence: 0.93, source: 'Redimnet embedding' },
      face: { match: 'P-okafor', confidence: 0.88, source: 'vision pipeline' },
      resolved: { person: 'Dr. Okafor', confidence: 0.97 },
      note: 'Known voice + known face → high-confidence identity',
    },
    {
      t: 13.1, segmentSpeaker: 'S3',
      voice: { match: 'S3', confidence: 0.71, source: 'Redimnet embedding' },
      face: { match: 'P-sam', confidence: 0.90, source: 'vision pipeline' },
      resolved: { person: 'Sam', confidence: 0.94 },
      note: 'Uncertain voice resolved by face match',
    },
    {
      t: 23.8, segmentSpeaker: 'S1',
      voice: { match: 'S1', confidence: 0.95, source: 'Redimnet embedding' },
      face: { match: null, confidence: 0.0, source: 'vision pipeline' },
      resolved: { person: 'Margaret', confidence: 0.91 },
      note: 'Speaker off-camera — voice embedding alone carries the match',
    },
  ],
  memoryProfile: {
    person: 'Dr. Okafor',
    facts: ['Asked about the tomato garden', 'Adjusted medication two weeks ago', 'Visits on Thursday mornings'],
  },
};
writeFileSync(join(out, 'diarization.json'), JSON.stringify(diarization, null, 2));

/* ============================================================
 * 2. PERMITPAL — permitpal.json
 * ============================================================ */
const permitpal = {
  $schema: 'schemas/permitpal.schema.json',
  routes: {
    local: { label: 'Local (Ollama, on-prem)', piiSafe: true },
    api: { label: 'OpenAI API (hot path)', piiSafe: false },
  },
  queries: [
    {
      id: 'q-deploy',
      query: 'I need to deploy the billing service to staging',
      route: 'api', localMs: 4280, apiMs: 410,
      bundle: {
        name: 'staging-deployer',
        principle: 'least privilege',
        permissions: [
          { scope: 'k8s:staging/billing', action: 'deploy', reason: 'rollout of the named service only' },
          { scope: 'registry:billing-*', action: 'pull', reason: 'fetch service images' },
          { scope: 'logs:staging/billing', action: 'read', reason: 'verify rollout health' },
        ],
        excluded: [{ scope: 'k8s:staging/*', action: 'admin', reason: 'broader than the request' }],
      },
    },
    {
      id: 'q-dashboard',
      query: 'Read-only access to the revenue dashboard for an audit',
      route: 'api', localMs: 3950, apiMs: 380,
      bundle: {
        name: 'audit-viewer',
        principle: 'least privilege',
        permissions: [
          { scope: 'bi:dashboards/revenue', action: 'view', reason: 'audit review' },
          { scope: 'bi:exports/revenue', action: 'export-csv', reason: 'audit evidence' },
        ],
        excluded: [{ scope: 'bi:datasets/revenue-raw', action: 'query', reason: 'raw PII not needed to audit' }],
      },
    },
    {
      id: 'q-pii',
      query: 'Access to customer SSNs for the KYC backlog',
      route: 'local', localMs: 4490, apiMs: null,
      bundle: {
        name: 'kyc-processor (PII-safe mode)',
        principle: 'least privilege',
        permissions: [
          { scope: 'kyc:queue', action: 'process', reason: 'work the backlog without raw export' },
          { scope: 'pii:ssn', action: 'verify-masked', reason: 'masked verification, no plaintext read' },
        ],
        excluded: [{ scope: 'pii:ssn', action: 'read', reason: 'plaintext PII denied; routed on-prem' }],
      },
    },
  ],
};
writeFileSync(join(out, 'permitpal.json'), JSON.stringify(permitpal, null, 2));

/* ============================================================
 * 3. BIOCLOCK — bioclock.json
 * ============================================================ */
const bioRng = mulberry32(777);
const TRACE_LEN = 90;
function bioSample(restlessness) {
  const hrBase = 52 + restlessness * 34;       // 52 bpm asleep → 86 awake
  const accelVar = 0.04 + restlessness * 0.9;  // g-units variance
  const hr = [], accel = [];
  for (let i = 0; i < TRACE_LEN; i++) {
    hr.push(r3(hrBase + Math.sin(i * 0.22) * 1.6 + (bioRng() - 0.5) * (2 + restlessness * 7)));
    const spike = bioRng() < restlessness * 0.32 ? bioRng() * accelVar * 2.4 : 0;
    accel.push(r3((bioRng() - 0.5) * accelVar + spike));
  }
  const state = restlessness < 0.35 ? 'asleep' : restlessness < 0.68 ? 'drowsy' : 'awake';
  const dist = Math.min(Math.abs(restlessness - 0.35), Math.abs(restlessness - 0.68));
  return {
    restlessness: r3(restlessness),
    state,
    confidence: r3(Math.min(0.99, 0.55 + dist * 1.4)),
    hr, accel,
  };
}
const bioclock = {
  $schema: 'schemas/bioclock.schema.json',
  device: 'ESP32 + MPU-6050 + MAX30102 (synthetic demo traces)',
  classifier: 'edge motion+HR model, 3-state output',
  states: ['asleep', 'drowsy', 'awake'],
  samples: Array.from({ length: 21 }, (_, i) => bioSample(i / 20)),
};
writeFileSync(join(out, 'bioclock.json'), JSON.stringify(bioclock));

/* ============================================================
 * 4. MENTOR-MATCH — mentormatch.json
 * ============================================================ */
const mentormatch = {
  $schema: 'schemas/mentormatch.schema.json',
  algorithm: 'Gale–Shapley-inspired mutual ranking',
  mentors: [
    { id: 'M1', name: 'Ada' }, { id: 'M2', name: 'Grace' }, { id: 'M3', name: 'Edsger' },
  ],
  mentees: [
    { id: 'E1', name: 'Kai' }, { id: 'E2', name: 'Noor' }, { id: 'E3', name: 'Theo' },
  ],
  preferences: {
    M1: ['E2', 'E1', 'E3'], M2: ['E1', 'E3', 'E2'], M3: ['E1', 'E2', 'E3'],
    E1: ['M3', 'M2', 'M1'], E2: ['M1', 'M3', 'M2'], E3: ['M2', 'M1', 'M3'],
  },
  rounds: [
    {
      proposals: [
        { from: 'M1', to: 'E2', outcome: 'accepted' },
        { from: 'M2', to: 'E1', outcome: 'held' },
        { from: 'M3', to: 'E1', outcome: 'accepted', displaces: 'M2' },
      ],
      tentative: [['M1', 'E2'], ['M3', 'E1']],
    },
    {
      proposals: [{ from: 'M2', to: 'E3', outcome: 'accepted' }],
      tentative: [['M1', 'E2'], ['M3', 'E1'], ['M2', 'E3']],
    },
  ],
  final: [['M1', 'E2'], ['M2', 'E3'], ['M3', 'E1']],
  stats: { matchAccuracy: 0.8, stack: 'MERN + Expo' },
};
writeFileSync(join(out, 'mentormatch.json'), JSON.stringify(mentormatch, null, 2));

console.log('Synthetic data written to public/data/');
