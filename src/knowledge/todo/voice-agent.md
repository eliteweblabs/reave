# Voice Agent

Polish and expand the Telnyx AI phone agent once the base is live.

- [ ] Tune VOICE_GREETING to match your brand tone
- [ ] Test the call → Claude → TTS round-trip latency and adjust speech_end_timeout_ms if needed
- [ ] Add tool access to voice agent (contact lookup, invoice check) — currently Claude-only, no tools
- [ ] Persist voice sessions to Supabase/Postgres so restarts don't drop active calls
- [ ] Add admin UI or Siri Shortcut to initiate outbound calls via TELNYX_APP_ID
- [ ] Consider upgrading to Telnyx media streaming for sub-1s latency (replace gather_using_speak)
- [ ] Set up call recording (Telnyx Call Control → record action) with consent notice in greeting
- [ ] Build a simple call log page at /dev/calls (call history, duration, transcript)
