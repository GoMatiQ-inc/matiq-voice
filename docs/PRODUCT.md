# MatiQ Voice product contract

Standalone desktop application by MatiQ Inc for macOS and Windows. English
only. Dictation preserves the recognizer's words without cleanup, filler
removal, dictionary substitutions, rewriting or translation. Recognition can
still make errors, and speech fidelity needs real-speaker evaluation.

## Installation and first use

The installer ships Electron, the native speech engine and native speaker
inference libraries. End users do not install Node, Python, packages, compilers,
GPU drivers or a separate server. Setup checks platform/architecture, memory,
CPU, disk and engine metadata. It recommends Base English on constrained
machines, Small on mainstream machines, and Medium with at least 24 GB RAM and
8 available cores. This is a conservative heuristic, not a speed benchmark.
Users may choose a smaller model. All downloads are size/SHA-256 verified;
failed downloads do not become installed models. Leave disk headroom.

Setup includes an actual audio-signal test, contextual paste permissions,
optional Microsoft/Google OAuth connections and explicit completion. Models
can be verified/repaired later. Launch-at-login is available in the installed
app. Closing hides the app; menu bar/system tray controls remain alive.

## Dictation

Settings allow a custom global toggle shortcut using modifier keys plus a
letter, number, function key or listed punctuation key. One press starts and a
second press stops. This is not hold-to-talk. Changes take effect immediately
and persist; conflicts keep the old binding. macOS Command Space and Control
Space are rejected to avoid search/input-switching shortcuts.

The global shortcut starts a nonactivating HUD. Listening appears after the
capture graph is ready. All audio samples through the final acknowledgement
are retained; dictation is bounded at five minutes. The native input helper
holds the original focused field for the session and checks it before posting
a paste shortcut. Mac also checks the selected range when available. A changed
or unsupported field falls back to Copy. Sending a shortcut is not proof that
the destination accepted the text. Clipboard content is replaced for paste.

## Meetings

OAuth connections read upcoming calendar meetings and open provider links.
Recording is explicit and local, while the user attends. It is not a bot.
Microphone and system audio have separate meters and are checkpointed in
short WAV chunks. Video required by screen-capture permission is not saved.
System capture can include unrelated system audio; users must choose the
correct source, stop unrelated playback, and inform participants.

Meetings are limited to four hours. Pause omits audio from the recorded timeline
while keeping capture sources open for resumption; OS microphone indicators
may remain active. Transcript timestamps refer to the retained recording, not
a wall clock including pauses. Recorded audio/transcript/notes remain in the
app's local user-data directory until explicitly deleted. Files are not
additionally encrypted by the app; normal OS disk protection applies. OAuth
credentials are separately protected using OS cryptography.

Processing runs in an isolated utility process. Native speaker models cluster
remote voices anonymously; this does not discover participant names. The mic
channel is labelled Microphone because a shared-room microphone is not
necessarily one person. Users can rename groups. Ambiguous attribution is
marked for review. Speaker edits change metadata, never recognized words.

Notes extract source passages for opening remarks, decisions and actions.
They are not generative summaries. No unstated owner/date is inferred. Each
passage links back to its transcript segment. Personal notes can be saved and
exported with the transcript. Raw saved audio supports processing retries;
interrupted sessions are surfaced after restart. Deletion removes that local
meeting's audio, transcript and notes after an explicit user action.

## Acceptance

Automated fixture-provider and synthetic-device E2E tests exercise real model
inference, speaker clustering, storage, setup, OAuth callback/token plumbing and
UI journeys. Live Teams/Meet calls, real external OAuth registrations, native
OS capture/permission handling, owner-voice fidelity, long sessions and clean
customer-machine upgrades are distinct acceptance gates. See VALIDATION.md.
