/**
 * Telnyx Call Control webhook — /api/voice/webhook
 *
 * Receives call lifecycle events from Telnyx and drives the AI voice agent.
 *
 * Event flow (inbound call):
 *   call.initiated  → answer the call
 *   call.answered   → greet caller + start gathering speech
 *   call.gather.ended → transcribed speech → Claude → speak reply + gather again
 *   call.speak.ended  → (unused if using gather_using_speak for the loop)
 *   call.hangup     → clean up session
 *
 * Voice agent toggle:
 *   VOICE_AGENT_ENABLED=1  enables AI responses.
 *   If disabled, caller hears an unavailable message and call is ended.
 *
 * Manual takeover: transfer the call to TELNYX_OPERATOR_NUMBER via admin tooling.
 *
 * Configure your Telnyx phone number's webhook URL to:
 *   https://<your-host>/api/voice/webhook
 *
 * Optional signature validation: set TELNYX_WEBHOOK_PUBLIC_KEY.
 */
import type { APIRoute } from 'astro';
import { serverEnv } from '../../../lib/serverEnv';
import { verifyTelnyxWebhook } from '../../../lib/telnyxClient';
import {
  telnyxAnswerCall,
  telnyxGatherUsingSpeak,
  telnyxHangupCall,
  telnyxSpeakOnCall,
} from '../../../lib/telnyxClient';
import {
  createVoiceSession,
  deleteVoiceSession,
  formatCallAlert,
  getVoiceSession,
  isVoiceAgentEnabled,
  runVoiceAgent,
} from '../../../lib/voiceSessionManager';
import { postToSystemAlertsThread } from '../../../lib/adminAgentAlert';

export const prerender = false;

// ─── Telnyx event shapes ──────────────────────────────────────────────────

interface TelnyxCallPayload {
  call_control_id?: string;
  call_leg_id?: string;
  from?: string;
  to?: string;
  direction?: string;
  speech_result?: string;
  reason?: string;
  hangup_source?: string;
  client_state?: string;
  status?: string;
}

interface TelnyxEvent {
  event_type: string;
  payload: TelnyxCallPayload;
}

interface TelnyxWebhookBody {
  data: TelnyxEvent;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const UNAVAILABLE_MSG =
  'Hi, thanks for calling. Our AI assistant is temporarily unavailable. ' +
  'Please reach us through our website or try again later. Goodbye.';

const GREETING =
  serverEnv('VOICE_GREETING') ||
  'Hi, you\'ve reached our AI assistant. How can I help you today?';

const FALLBACK_MSG =
  "I'm sorry, I had trouble understanding that. Could you please try again?";

async function notifyOperator(text: string): Promise<void> {
  await postToSystemAlertsThread({
    message: text,
    autoRun: false,
    push: {
      title: 'Voice call',
      body: text.split('\n')[0] ?? 'Call event',
      tag: 'voice-call',
      url: '/admin?tab=chats',
    },
  }).catch((e) => console.error('[voice] alert failed', e));
}

// ─── Event handlers ────────────────────────────────────────────────────────

async function handleCallInitiated(payload: TelnyxCallPayload): Promise<void> {
  const { call_control_id, from, to } = payload;
  if (!call_control_id || !from || !to) return;

  const session = createVoiceSession(call_control_id, from, to);
  await notifyOperator(formatCallAlert(session, 'Incoming call'));

  // Answer the call — Telnyx will send call.answered next.
  const ans = await telnyxAnswerCall(call_control_id);
  if (!ans.ok) {
    console.error('[voice] answer failed', ans.error);
  }
}

async function handleCallAnswered(payload: TelnyxCallPayload): Promise<void> {
  const { call_control_id } = payload;
  if (!call_control_id) return;

  if (!isVoiceAgentEnabled()) {
    // Speak unavailable message then hang up.
    await telnyxSpeakOnCall(call_control_id, UNAVAILABLE_MSG);
    // Telnyx will fire call.speak.ended; we hang up there to let TTS finish.
    return;
  }

  // Greet and start listening.
  await telnyxGatherUsingSpeak(call_control_id, GREETING);
}

async function handleGatherEnded(payload: TelnyxCallPayload): Promise<void> {
  const { call_control_id, speech_result, reason } = payload;
  if (!call_control_id) return;

  const session = getVoiceSession(call_control_id);
  if (!session) return;

  // If the caller transferred away or mode changed, ignore further gathers.
  if (session.mode !== 'ai') return;

  // speech_result may be empty if the caller was silent or reason is timeout.
  const userText = speech_result?.trim();
  if (!userText || reason === 'timeout') {
    await telnyxGatherUsingSpeak(call_control_id, "I didn't catch that — could you repeat?");
    return;
  }

  const aiReply = await runVoiceAgent(call_control_id, userText);
  const response = aiReply ?? FALLBACK_MSG;

  // Speak the reply and immediately start listening again.
  await telnyxGatherUsingSpeak(call_control_id, response);
}

async function handleSpeakEnded(payload: TelnyxCallPayload): Promise<void> {
  const { call_control_id } = payload;
  if (!call_control_id) return;

  const session = getVoiceSession(call_control_id);
  if (!session) return;

  // Only reached when we used telnyxSpeakOnCall (not gather_using_speak).
  // This happens when the voice agent is disabled (we spoke UNAVAILABLE_MSG).
  if (!isVoiceAgentEnabled()) {
    await telnyxHangupCall(call_control_id);
  }
}

async function handleCallHangup(payload: TelnyxCallPayload): Promise<void> {
  const { call_control_id } = payload;
  if (!call_control_id) return;

  const session = getVoiceSession(call_control_id);
  if (session) {
    await notifyOperator(formatCallAlert(session, 'Call ended'));
    deleteVoiceSession(call_control_id);
  }
}

// ─── Webhook route ─────────────────────────────────────────────────────────

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({ status: 'ok', message: 'Voice webhook endpoint is running' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

export const POST: APIRoute = async ({ request }) => {
  // Respond 200 immediately so Telnyx doesn't retry; process the event async.
  const rawBody = await request.text();

  // Validate signature if public key is configured.
  const publicKey = serverEnv('TELNYX_WEBHOOK_PUBLIC_KEY')?.trim();
  if (publicKey) {
    const sig = request.headers.get('telnyx-signature-ed25519') ?? '';
    const ts = request.headers.get('telnyx-timestamp') ?? '';
    if (!sig || !ts) {
      console.warn('[voice] missing Telnyx signature headers');
      if (import.meta.env.PROD) {
        return new Response('Unauthorized', { status: 401 });
      }
    } else {
      const valid = verifyTelnyxWebhook({ rawBody, signature: sig, timestamp: ts, publicKey });
      if (!valid) {
        console.error('[voice] invalid Telnyx webhook signature');
        if (import.meta.env.PROD) {
          return new Response('Unauthorized', { status: 401 });
        }
      }
    }
  }

  let body: TelnyxWebhookBody;
  try {
    body = JSON.parse(rawBody) as TelnyxWebhookBody;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { event_type, payload } = body.data ?? {};
  console.info('[voice] event', event_type, { ccId: payload?.call_control_id, from: payload?.from });

  // Fire and forget — respond 200 before doing API calls.
  (async () => {
    try {
      switch (event_type) {
        case 'call.initiated':
          await handleCallInitiated(payload);
          break;
        case 'call.answered':
          await handleCallAnswered(payload);
          break;
        case 'call.gather.ended':
          await handleGatherEnded(payload);
          break;
        case 'call.speak.ended':
          await handleSpeakEnded(payload);
          break;
        case 'call.hangup':
          await handleCallHangup(payload);
          break;
        default:
          console.debug('[voice] unhandled event', event_type);
      }
    } catch (err) {
      console.error('[voice] event handler error', event_type, err);
    }
  })();

  return new Response(null, { status: 200 });
};
