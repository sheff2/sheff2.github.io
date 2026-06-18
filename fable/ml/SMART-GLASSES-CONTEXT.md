# SMART-GLASSES-CONTEXT

Source material for portfolio writing. Every claim below is traceable to code, config, README, or git history in this repo (github.com/Tiger9406/Smart-Glasses, per README.md). Anything that could not be verified is in the final section. Author identities used for attribution: sheff2 (shaheff01@gmail.com, 33 commits) and Shaun Heffernan (102618155+sheff2@users.noreply.github.com, 2 merge commits). The only other contributor is Tiger (xcao2005@gmail.com, 247 commits).

## Overview

A real-time, multiprocessing ML backend for smart glasses (README.md calls it "Smart Glasses Multimodel Backend"). The glasses (or a simulator) stream camera frames and microphone audio over UDP to a Python server. The server runs face detection and recognition, voice activity detection, streaming speech-to-text, and speaker diarization in parallel worker processes. A coordinator process fuses face identity and voice identity, logs every transcribed sentence to a per-person SQLite chat history, and calls an LLM to parse intent from speech (for example, registering a new person when someone introduces themselves, or answering when the wearer addresses the assistant, named "Steve" in the tool config). A retro terminal-styled web dashboard ("SMART GLASSES :: MONITORING SYSTEM v1.0") shows live logs, the identity database, per-person chat history, and a face-lookup tool. A separate hardware repo is linked from README.md (github.com/Tiger9406/Smart-Glasses-Hardware); this repo is the backend only.

## Architecture

Process model (main.py): one parent process spawns four `multiprocessing.Process` workers plus two threads.

- UDP receiver thread (api/udp_receiver.py): binds 0.0.0.0:8000 (core/config.py:1-2), receives datagrams up to 65507 bytes. The first byte is a routing header: 0x01 vision, 0x02 audio (core/config.py:4-5). Payloads go into bounded `mp.Queue`s (maxsize 100, core/shared_mem.py); when a queue is full the oldest item is dropped.
- VisionWorker (workers/vision.py): decodes JPEG frames, runs InspireFace detection and tracking, re-verifies identity at most every 2.0 s per track (RECHECK_INTERVAL), face-match confidence threshold 0.5, emits `vision_result` events with per-face track_id, bbox, user_id, name, score, and optionally the embedding.
- AudioWorker (workers/audio.py): full audio pipeline, detailed below. Emits `speech` events.
- Coordinator (workers/coordinator.py): the decision maker. Consumes all events from a shared results queue, maintains a 10 s vision cache and 30 s audio cache, fuses identities, writes chat history, and dispatches commands to other workers.
- APIWorker (workers/api_worker.py): serial LLM request worker with its own asyncio loop. Handles PARSE_INTENT and ANALYZE_MEMORY commands.
- Monitoring server thread (frontend/server.py): aiohttp app on 0.0.0.0:8765 (core/config.py:31-32) serving the dashboard, a WebSocket at /ws, and REST endpoints (/api/db, /api/users/{id} rename and delete, /api/users/{id}/history, /api/chat clear, /api/db purge, /api/face_lookup).

Inter-process communication is entirely via `multiprocessing.Queue` objects defined in core/shared_mem.py: vision_queue, audio_queue (raw bytes in), results_queue (events to Coordinator), vision_command_queue, audio_command_queue, gemini_command_queue (commands out), log_queue (maxsize 2000, logs to the dashboard). Event and command schemas are documented in workers/event_definitions.md: event types are `vision_result`, `speech`, `vlm_result`, `intent`, `api_error`, `memory_result`; commands include `REGISTER_FACE`, `REGISTER_VOICE`, `GET_VIDEO_CONTEXT`, `PARSE_INTENT`, `ANALYZE_VIDEO_FRAMES`, `ANALYZE_MEMORY`.

Logging to the dashboard works by monkey-patching `builtins.print` in every process (core/log_interceptor.py): each print also pushes `{source, text, ts}` onto log_queue, which the dashboard server drains and broadcasts to all connected WebSocket clients as JSON. Log lines containing keywords like "Created new identity" or "Registered voice" trigger an immediate database snapshot broadcast (frontend/server.py:48-54, 142-158); the DB is also polled every 5 s.

Persistence is SQLite (database/database.py, file database/identities.db): tables `users` (uuid, name), `face_embeddings`, `voice_embeddings` (numpy arrays stored as BLOBs via custom adapters), and `chat_history` (per-user transcripts with timestamps), WAL mode, foreign keys with cascade delete.

On shutdown, main.py merges the saved annotated video and recorded audio into a single mp4 using the bundled ffmpeg binary from imageio-ffmpeg (main.py:117-141).

## Tech stack

- Language: Python (README.md says "Using Python 3.11").
- Concurrency: multiprocessing, threading, asyncio.
- Transport: raw UDP sockets with a 1-byte type header. No web framework on the ingest path (a FastAPI-based path existed earlier; commit 1fad0ec "utilize udp ingestion to match hardware; remove fastapi use" replaced it, per git history of api/udp_receiver.py).
- Speech-to-text: parakeet-mlx, model `mlx-community/parakeet-tdt-0.6b-v3` (core/config_audio.py:1), Apple MLX runtime (`mlx.core` imported in workers/audio.py:9).
- VAD: Silero VAD as ONNX (workers/audio_utils/silero_vad.onnx) via onnxruntime.
- Speaker embeddings: ReDimNet b2 as ONNX (workers/audio_utils/redimnet_b2.onnx) via onnxruntime.
- Vision: OpenCV, InspireFace (face detection, tracking, embedding extraction, feature comparison).
- LLM: currently an OpenAI-compatible gateway at https://api.ai.it.ufl.edu/v1/chat/completions (core/config_openai.py:9, a University of Florida AI endpoint), chat model `nemotron-3-super-120b-a12b`, vision model `gemma-3-27b-it`, temperature 0.4, max 1000 output tokens. An earlier Gemini client (api/gemini_client.py, `gemini-2.5-flash` in core/config_gemini.py:7) is still present but commented out in workers/api_worker.py and workers/vision.py.
- Dashboard: aiohttp server plus a single-file vanilla HTML/CSS/JS frontend (frontend/index.html), WebSocket streaming.
- Database: SQLite via the stdlib sqlite3 module with numpy BLOB adapters.
- Pinned minimums (requirements.txt): numpy>=2.3.5, opencv-python>=4.13.0.90, inspireface>=1.2.3, python-dotenv>=1.2.1, parakeet-mlx>=0.5.0, onnxruntime>=1.24.1, aiohttp>=3.13.1.

## Audio pipeline (detailed)

All constants below are quoted from core/config_audio.py, core/config.py, and workers/audio.py.

1. Capture and transport. Audio arrives as 16 kHz, mono, 16-bit PCM (AUDIO_SAMPLE_RATE_HZ = 16000, core/config_audio.py:7; the simulator config confirms channels 1, sample_width 2). Each UDP datagram is prefixed with header byte 0x02. The simulator (api/simulator.py) reads a WAV file and sends 1024-frame chunks paced to real time. The receiver thread strips the header and pushes raw bytes onto audio_queue. Note: transport is UDP datagrams, not WebSockets; the only WebSocket in the system is the dashboard's /ws endpoint on port 8765.

2. Chunking. AudioWorker accumulates bytes and processes fixed chunks of AUDIO_CHUNK_SIZE_MS = 160 ms (core/config_audio.py:6), which is 2560 samples / 5120 bytes at 16 kHz (workers/audio.py:36-37). Samples are converted int16 to float32 in [-1, 1] by dividing by 32767.

3. VAD. Silero VAD runs through onnxruntime on 512-sample (32 ms) windows with a 64-sample carry-over context, so the model actually sees 576 samples per call; recurrent state shape is (2, 1, 128) (workers/audio.py:50-120). Speech probability threshold is 0.5. A 160 ms chunk counts as speech if any of its 32 ms windows crosses the threshold.

4. Sentence segmentation. On the first speech chunk, a session starts: a short uuid session id is minted and a Parakeet streaming context opens with `transcribe_stream(context_size=(64, 64))` (CONTEXT_LEFT/CONTEXT_RIGHT, core/config_audio.py:9-10). A pre-speech ring buffer of 320 ms (2 chunks, workers/audio.py:40) is prepended so word onsets are not clipped. After SILENT_CHUNK_THRESHOLD = 1 silent chunk (core/config_audio.py:13), the sentence is considered finished: VAD state resets, all buffered chunks are concatenated into one array.

5. Transcription. The whole sentence is fed to Parakeet at once (`transcriber.add_audio(mx.array(sentence_audio))`) and the final text is read from `transcriber.result.text`. Passing the entire sentence at sentence end, rather than incrementally, was a deliberate change (Tiger's commit 51560a0 "VAMOS; pass entire audio at sentence end much better results").

6. Diarization. The same sentence audio is reshaped to (1, N) and pushed through ReDimNet b2 ONNX to get one speaker embedding per sentence (workers/audio.py:122-123). Identification is cosine similarity against per-user average embeddings loaded from SQLite, with SIMILARITY_THRESHOLD = 0.30 (core/config_audio.py:16) and a bias toward the previous speaker: the last speaker is checked first and becomes the floor that other identities must beat (workers/audio.py:128-146). New voice samples registered at runtime update a running count-weighted average per user (register_identity, workers/audio.py:274-288).

7. Fusion with vision (Coordinator). A `speech` event carries text, embedding, user_id, and timestamps. If the voice is unknown, the Coordinator tries, in order: (a) a pending "voice trap" set when the LLM registered an identity but no voice was available yet, valid for max_delay = 20 s; (b) visual association: within a +/- 1.0 s window of the speech timestamp, bind the voice to a known face flagged `is_speaking` in at least 30 percent of frames, or, as fallback, to the only known face present in at least 80 percent of frames (workers/coordinator.py:468-530). Successful association sends REGISTER_VOICE back to the AudioWorker, so the system learns voices opportunistically. Face registration picks the unknown face closest to the wearer's attention, scored as 0.3 x normalized bbox area minus 0.7 x normalized distance from frame center (workers/coordinator.py:438-462).

8. Output. Each recognized sentence is logged as "Name: text" into chat_history (only when the speaker is known), appended to a rolling 10-message conversation deque, and sent to the LLM as a PARSE_INTENT prompt that includes "Known people in view" from the vision cache. The LLM returns tool calls: `register_identity` (with speaker_name and is_self_introduction flags), `speak` (assistant reply, printed as "[STEVE]: ..."), or `vision_context` (triggers VLM analysis of buffered frames). The system prompt also instructs the LLM to silently correct STT spelling using names in view (core/config_tools_openai.json).

9. LLM memory profiles. An ANALYZE_MEMORY command exists in APIWorker (workers/api_worker.py:94-117) using `memory_prompt_template` (core/config_prompts.json): it extracts new facts about named speakers from conversation history as JSON {subject, fact} pairs, emitting `memory_result` events. A code comment notes it is "not being used by coordinator yet tho" (workers/api_worker.py:92). Further memory work (DB-backed fact storage, a Steve DB query test) exists in commit c9edef2 on the unmerged `steve_agent` branch.

## Shaun's contributions (git evidenced)

Identities: sheff2 / shaheff01@gmail.com plus the GitHub noreply identity. 35 commits total (33 plus 2 merges), Jan 25 to Apr 2 (repo dates are in 2026), roughly 3,529 lines added and 615 deleted in text files across all branches (binaries such as model and WAV files excluded).

### Streaming STT and speaker diarization (created the subsystem core, Feb 4 to Feb 12)

- Files: workers/audio.py, core/config.py (audio params), requirements.txt, workers/audio_utils/* (ReDimNet model files, test voices, embeddings).
- Tiger created the empty worker skeleton first (commit 6087a2f "implement outline for audio and vision workers"). Shaun then built the actual pipeline: commit 64c00a5 "audio.py chunking made, works real time streaming and sends events to coordinater, works with the simulator too" (116 lines into workers/audio.py) established UDP byte chunking, Parakeet streaming transcription, and speech events to the Coordinator. Commit 2d05592 added parakeet to requirements.
- Shaun added speaker diarization: commit c1d0398 brought in the ReDimNet b2 ONNX model and a test script; commit 3a0100c "diartizaiton with redimnet vector voice embeddings" wired per-sentence embeddings and named-speaker matching into audio.py; commit 3ee1bf0 added the default-to-last-speaker logic that still exists today as the last-speaker bias in identify_speaker.
- Honest granularity: Shaun created the transcription and diarization core, but the file was substantially reworked afterward by Tiger, who added Silero VAD sentence-end detection (a6d0f55), the pass-whole-sentence-at-end change (51560a0), the command queue and register_identity handling (8af3240), and the id-based migration (84361d9). Current blame on workers/audio.py: 226 lines Tiger, 109 lines sheff2 (of 335).

### LLM agent integration and APIWorker (created, Feb 26 to Mar 11)

- Files: workers/api_worker.py (created in eeb6189; current blame 113 of 119 lines sheff2), workers/event_definitions.md additions, tests/test_api_worker_live.py and tests/test_api_worker_queue.py (created, f8e7283), api/gemini_client.py fixes (978d28f "fixed error indexing into gemini client parts, added one event loop for api worker").
- Earlier iterations on branches: moved the LLM into its own worker/thread (706dd94, 069a246), refactored the VLM client into a Gemini client (941356e, ce1540b, 9c32e89). Note the current api/openai_client.py was written by Tiger (blame: 184 of 184 lines); Shaun's client work was on the Gemini path and the worker that calls the client.

### Conversation logging to the database (modified, Mar 25)

- Commit 36e391b "adding each sentence to sentence DB": Coordinator saves each recognized sentence to per-user chat_history (workers/coordinator.py changes), plus config updates. This built on Tiger's existing DatabaseManager; Shaun later added get_recent_chat_history and other dashboard query methods (3444fb3, c9edef2 on branch).

### Monitoring dashboard, wholly Shaun's (created, Apr 1)

- Files created by Shaun and still 100 percent his by blame: frontend/index.html (1,387 lines), frontend/server.py (393 lines), core/log_interceptor.py (30 lines).
- Commits 64cffc3, 3444fb3 ("frontent, monkeypatch consle log, change prompt for register"), 90fd8d6 ("control center thing with face lookup and look at each persons chats", merged as PR #36).
- What it does: aiohttp server with WebSocket log streaming fed by the print monkey-patch installed into every worker process; three live panels (Coordinator log, Workers log, Database status with registered identities and recent transcripts); a Command Console with Identity Manager (rename/delete users), History Query (per-person chat logs), and Face Lookup (upload an image, get cosine-ranked matches against all stored face embeddings via InspireFace). Wiring the log interceptor into all workers also touched main.py, workers/base.py, audio.py, vision.py, coordinator.py, api_worker.py, shared_mem.py (3444fb3).

### Memory extraction for the agent (created, Apr 2, unmerged branch steve_agent)

- Commit c9edef2 "memory": analyze_memory in the OpenAI client, ANALYZE_MEMORY handling and DB query tooling in api_worker.py and database.py, plus tests/test_steve_db_query.py (121 lines). The ANALYZE_MEMORY plumbing visible on main in api_worker.py is part of this line of work; the fuller version is not merged to main.

### Minor early work

- Commit 04040a3 (Jan 25): added the vision-vs-audio byte header check to the then-FastAPI route (api/routes.py), the precursor of the header routing now in udp_receiver.py (the UDP rewrite itself was Tiger's).
- Test audio assets: WAV recordings and npy voice embeddings for himself, Matt, and Tiger (c1d0398, 3a0100c, af99fa1, 10076bb). database/sample_data/voice_Shaun1.npy still ships in the repo.

### What Shaun did not write (for honesty)

VisionWorker and InspireFace processing, the Coordinator's fusion logic, the Silero VAD integration, the UDP receiver, the OpenAI client, the database layer's original version, and the simulator are Tiger's by blame and commit history.

## Measured numbers (with sources)

### Transcription RTF, measured 2026-06-12 with tests/benchmark_rtf.py

A benchmark script (tests/benchmark_rtf.py) now exists that mirrors the production audio path exactly: Silero VAD segmentation with the same 160 ms chunks, 0.5 threshold, 1-silent-chunk sentence break and 320 ms pre-speech padding as workers/audio.py, then per sentence one `transcribe_stream(context_size=(64, 64))` session with a single `add_audio()` call (Parakeet `mlx-community/parakeet-tdt-0.6b-v3` on MLX GPU), plus the ReDimNet b2 ONNX speaker embedding. RTF = processing time / audio duration, lower is better. Run over all 7 committed sample WAVs (95.52 s of audio, 38 VAD-segmented sentences), after a cold-start warmup that is excluded:

- Transcription overall RTF: 0.085 (8.09 s of compute for 95.52 s of audio, about 12x faster than real time)
- Per-sentence transcription RTF: mean 0.119, median 0.092, min 0.044, max 0.551 (the max is a 0.64 s fragment where fixed per-sentence overhead dominates; short sentences cost roughly 0.17 s flat, long sentences approach RTF 0.05)
- Speaker embedding (ReDimNet) overall RTF: 0.013
- Combined transcription plus embedding overall RTF: 0.097

Hardware: Apple M2, 8 GB RAM, MLX default device gpu. Measured on Shaun's development machine; numbers exclude model load and first-inference compile (warmup cold-start transcription of 2 s audio took several seconds and is reported separately by the script).

Honest framing for the portfolio: the earlier "RTF 0.8" recollection was wrong for the current pipeline on this hardware; the measured figure is about 0.085. An RTF measurement script existed before the streaming rework but is not in the repo or its history, so only the new measurement is citable. Also note this measures inference throughput per sentence, not end-to-end latency; perceived latency per utterance is roughly the sentence duration (audio must finish) plus 160 ms of trailing silence for the VAD to close the sentence plus the 0.17 to 0.36 s of inference.

### Other notes on numbers
- The only latency numbers present are in TESTsoftformer.py (an untracked local file, not committed to git): NVIDIA Streaming Sortformer preset latency modes of 0.32 s, 1.04 s, 10.0 s, and 30.4 s (TESTsoftformer.py:203-206). These are configuration presets from NVIDIA's model card, not measurements made on this system, and the Sortformer experiment is not part of the running pipeline (the pipeline uses ReDimNet plus Silero).
- Verifiable design constants you can safely quote instead: 160 ms audio chunks, 16 kHz mono 16-bit input, 32 ms VAD windows with 0.5 speech threshold, sentence end after 160 ms of silence, 320 ms pre-speech padding, 0.30 cosine threshold for speaker ID, 0.5 face match confidence, 10 fps / 640x480 video, 2.0 s face re-verification interval, 10 s vision cache and 30 s audio cache for fusion.

## Demo flow

From start.sh, api/simulator.py, and the dashboard code, a live demo runs like this:

1. `./start.sh` opens a terminal tab running `python main.py`, waits 3 s, opens http://localhost:8765 in the browser, then opens a second tab running the simulator. The server terminal prints worker startup lines: loading ReDimNet, Silero VAD, and Parakeet, "Loaded N voice identities", "UDP Server listening on 0.0.0.0:8000", "Monitoring dashboard at http://localhost:8765", "All systems started; waiting for stream".
2. Sample data is preloaded (START_WITH_SAMPLE_DATA = True): the wearer Tiger's voice embeddings from database/sample_data, so the system already knows the wearer's voice.
3. The simulator streams a recorded clip over UDP as if it were the glasses: currently shrish_introduced_92.mp4 at its native fps plus shrish_introduced.wav as 16 kHz PCM (api/simulator_resources/simulator_config.json). The repo also contains a riley_self_intro clip pair.
4. As speech arrives, the server log (and dashboard Coordinator panel) prints each recognized sentence as "[Coordinator] Name: text", with unknown voices labeled "Unknown".
5. When someone in the clip is introduced or introduces themselves, the LLM intent parser fires `register_identity`. The logs show lines like "Created new identity: Name (uuid)", "Registered 'Name' using provided embedding." (face), "Registered voice for id ...", or "Visually associated voice with Name across N frames." The dashboard's DATABASE STATUS panel updates within a second (keyword-triggered snapshot): the new person appears under REGISTERED IDENTITIES with face/voice badges, and their sentences start appearing under RECENT TRANSMISSIONS attributed by name.
6. In the COMMAND CONSOLE the presenter can click an identity to inspect it, query that person's chat history, rename or delete them, or upload a photo in FACE LOOKUP to get a confidence-ranked match against everyone in the database.
7. If the wearer addresses "Steve" (per the tool config), the reply prints as "[Coordinator]: [STEVE]: ..." in the logs; a "what am I looking at" style request routes buffered frames to the vision model (VLM_ACTIVE is currently False in config, so this is disabled by default).
8. On Ctrl+C, the server shuts down workers and merges the annotated video (face boxes and name labels drawn on every frame) with the recorded audio into api/simulator_resources/video.mp4 via ffmpeg, which makes a good side-by-side artifact for the demo video.

Note for captioning: there is no on-glasses display or TTS output in this repo; what the "wearer" experiences live is the system silently learning identities, and all visible output is the dashboard plus server logs. The annotated video is rendered after the run, not live.

## Unverified / ask me

- RTF 0.8 for transcription: resolved. No trace of that figure in the repo, and a fresh measurement with tests/benchmark_rtf.py gives overall RTF 0.085 on Apple M2 (see Measured numbers). Do not publish 0.8; if you remember measuring 0.8 it was likely an older pipeline (pre whole-sentence rework, or the older parakeet-ctc model in testrawdata.py) or different hardware, and that script is not recoverable from this repo.
- Your predicted emails (heffernanshaun2@gmail.com, shaunheffernan@ufl.edu) do not appear in git history; only shaheff01@gmail.com and the sheff2 noreply address do. Confirm there is no other repo or squashed history where you committed under different identities (PR squash merges by Tiger could hide your authorship; PR #36 was merged preserving your authorship, but I cannot rule out earlier squashes).
- Untracked local files in your working directory (not in git, authorship and status unverifiable): TESTsoftformer.py (NVIDIA Streaming Sortformer diarization experiment), LLM.py, testvoices.py, test_convertToembd.py, testrawdata.py, start.sh is tracked-pending (listed as untracked in git status), plus recordings (IMG_1219.m4a, IMG_1220.m4a, IMG_1221.MOV, conversationAudio.m4a). If the Sortformer experiment was yours and informed the diarization design, say so explicitly, but the repo cannot prove it.
- Whether the deployed hardware ever streamed to this backend live (versus simulator-only demos) is not determinable from this repo; the hardware lives in a separate linked repo.
- The "is_speaking" face flag used by voice-face fusion (workers/coordinator.py:496) is consumed in the Coordinator, but I found no producer setting it in workers/vision.py on main; the visual voice association may currently rely only on the single-person fallback path. Worth confirming before claiming active-speaker detection works end to end.
- VOICE_TRAP_LIMIT = 15.0 is defined (core/config.py:29) but never referenced; the actual pending-registration window used is max_delay = 20.0 s in the Coordinator.
- Team size, project timeline framing (course project? club? hackathon?), and the product name to use publicly are not stated anywhere in the repo.
