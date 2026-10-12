# Speech continuity investigation

The short browser utterances have several plausible causes. Code inspection found immediate cancellation on tentative VAD detection, main-thread scheduling between every WAV packet, an unbounded number of concurrent sentence synthesis requests, and canned narration for every browser action. These are confirmed code paths; which dominates on a particular microphone still needs listening and diagnostic logs.

## Changes

- Confirm speech for 384 ms before interrupting, with 700 ms silence to end a turn. Retain microphone pre-roll so the first syllables survive confirmation.
- Schedule decoded WAV packets ahead on the Web Audio clock with a 160 ms initial/recovery cushion. Do not wait for an end callback to start the next packet.
- Serialize TTS requests while allowing audio playback to overlap synthesis. This prevents browser-tool loops from flooding the local speech model with requests.
- Limit canned browser speech to one cue per user turn, omitted when the assistant already provides an update. Meaningful model-generated updates still play.
- Prefer grouped sentences, but release a complete sentence of at least 40 characters after a one-second wait. The former 150-character minimum alone could delay a perfectly usable first sentence.
- Expose “Let me interrupt spoken replies” in Settings. Disabling it protects replies from speaker feedback, at the cost of spoken barge-in. Stop remains available.
- Log confirmed interruptions, ignored microphone misfires, late audio packets, and per-utterance synthesis time/audio duration. Surface truncated streams as errors.

The 0.32-second MLX streaming interval is an audio transport packet size, not a spoken sentence length. Shrinking it cannot fix cancellation. A larger interval may reduce decoding overhead but also delays first audio. The timing log distinguishes late generation from intentional interruption.

## Reference implementations inspected

- [Hugging Face speech-to-speech](https://github.com/huggingface/speech-to-speech): also a VAD → STT → LLM → TTS cascade, with Parakeet and Qwen3/MLX on Apple silicon. A model replacement is not necessary to borrow its pipeline ideas.
- [Its audio playback worklet](https://github.com/huggingface/speech-to-speech/blob/main/demo/worklets/audio-playback.js): queued audio, underrun reporting, interruption clearing, and small fades. Jarvis currently uses native audio-clock scheduling; a PCM AudioWorklet remains a larger follow-up if main-thread decoding proves limiting.
- [Its turn handling](https://github.com/huggingface/speech-to-speech#smart-turn-endpointing): semantic turn completion and speculative revisions. Smart Turn is a possible next step for mid-thought pauses, but requires an additional model and cancellation/revision handling; it was not installed here.
- [VAD callback semantics](https://github.com/ricky0123/vad/blob/master/_autodocs/api-reference/MicVAD.md): onSpeechStart is tentative; onSpeechRealStart is confirmed after minSpeechMs.
- [Alternative speech backends](https://github.com/huggingface/speech-to-speech/blob/main/src/speech_to_speech/TTS/README.md): Pocket TTS and Kokoro are candidates for measured latency/quality comparisons. Ryan remains selected; no new model weights were downloaded.

## Listening check

A direct local Qwen streaming check produced 10.24 seconds of audio across 32 complete WAV packets in 3.55 seconds, with the first packet arriving in 361 ms and no trailing incomplete bytes. This measures one warmed-up synthesis request, not microphone-to-speaker latency or synthesis under simultaneous browser/LLM load. A headless browser regression also verifies that opening the browser panel does not stop all three mock audio packets from being scheduled consecutively before any end callback fires.

After restarting the app and refreshing its page, ask for browser research with Logs open. Repeat with headphones, then speakers. Check whether cutoff coincides with a confirmed interruption or late audio. Test a brief click/noise, deliberate interruption, Stop, a short answer, and a longer browser answer. Compare interruptions enabled/disabled. Automated timing tests cannot establish perceived naturalness or eliminate acoustic echo.
