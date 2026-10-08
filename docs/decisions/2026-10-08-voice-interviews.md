# Decision: Voice (audio) interviews — provisioned now, built later

Date: 2026-10-08
Status: Decided (provision only)

## Context
Users should eventually be able to talk to the interviewer and hear its answers, instead of typing. The interview engine must stay the single source of truth (state in PostgreSQL, deterministic question policy, analyst review), whatever the channel.

## Options Considered
1. **Speech pipeline around the existing engine** — browser microphone → speech-to-text → the same `POST /interviews/:id/messages` (channel `voice`) → reply text → text-to-speech streamed back.
2. **Realtime voice model as the interviewer** (e.g. a speech-to-speech realtime API) calling our engine as a tool.
3. **Telephony / Teams calling** as the voice entry point.

## Decision
Option 1, when audio is built. It keeps all intelligence (extraction, analyst, SOP grounding, provenance) in one engine, so voice and text interviews behave identically and can be mixed in the same session. Option 2 gives lower latency but moves control of what is asked into the voice model, which conflicts with the deterministic question policy and provenance rules. Option 3 can reuse option 1 later.

Provisioned now:
- `voice` is a channel (`interview_sessions.channel`, `interview_messages.channel`), accepted by the start and message endpoints.
- On the `voice` channel the engine phrases replies to be spoken (short sentences, no lists or symbols, no step keys).

To build later:
- Web: push-to-talk / hands-free mode in `/chat`, live transcript shown as the user's message (editable before sending), audio playback of replies with the text still visible.
- API: `POST /interviews/:id/audio` (upload a short recording → transcript → normal turn), and a streaming text-to-speech response for the reply.
- Providers behind the existing gateway: speech-to-text (e.g. OpenAI transcription models or Azure AI Speech) and text-to-speech (OpenAI TTS or Azure AI Speech, which also covers Arabic voices). Configured like the LLM, by environment variables.
- Latency budget: aim for the first spoken words within ~3 s of the user finishing (stream TTS from the first sentence of the reply).
- Privacy: audio is transcribed and discarded by default; only the transcript is stored, like typed messages.

## Consequences
- No change to the engine contract: any channel posts text and receives text plus structured events.
- Arabic speech is a provider choice (Azure AI Speech supports Gulf Arabic); decide when building.
