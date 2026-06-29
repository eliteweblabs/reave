# Reave - Voice Chat Website

A modern website with integrated Vapi voice chat functionality, allowing visitors to interact with an AI assistant through voice commands.

**Where does the code live?** GitHub (`eliteweblabs/reave`) is the source of truth; Railway deploys from that repo. See [GITHUB_AND_RAILWAY.md](GITHUB_AND_RAILWAY.md) for clone, `git pull`, and optional Railway CLI usage.

## 🎤 Voice Chat Feature

This website includes a voice chat button powered by [Vapi](https://vapi.ai) that allows visitors to speak their needs directly. The button appears as a floating action button in the bottom-right corner of the page.

### Setup Instructions

1. **Set Up Clerk Authentication**
   - Sign up at [https://clerk.com](https://clerk.com)
   - Create a new application in your Clerk dashboard
   - Copy your **Publishable Key** and **Secret Key** from the API Keys section
   - Add them to your `.env` file as `PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
   - Configure authentication methods (email, social providers, etc.) in the Clerk dashboard

2. **Create a Vapi Account**
   - Sign up at [https://vapi.ai](https://vapi.ai)
   - Create a new assistant in your dashboard
   - Configure your assistant's voice, personality, and capabilities

3. **Get Your Vapi API Credentials**
   - Navigate to your profile in the Vapi dashboard
   - Copy your **Public Key** from the API keys section
   - Copy your **Assistant ID** from your assistant settings

3. **Configure Environment Variables**
   - Create a `.env` file in the root directory
   - Add the following variables:
     ```
     # Vapi Configuration
     PUBLIC_VAPI_PUBLIC_KEY=your_vapi_public_key_here
     PUBLIC_VAPI_ASSISTANT_ID=your_vapi_assistant_id_here
     
     # Clerk Authentication (Required for authenticated features)
     PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
     CLERK_SECRET_KEY=your_clerk_secret_key
     
     # Voice Recognition (Optional)
     # Enable voice recognition to allow the agent to recognize your voice
     PUBLIC_VAPI_ENABLE_VOICE_RECOGNITION=true
     PUBLIC_VAPI_VOICE_PROFILE_ID=your_voice_profile_id_here
     
     # Twilio SMS Configuration
     TWILIO_ACCOUNT_SID=your_twilio_account_sid
     TWILIO_AUTH_TOKEN=your_twilio_auth_token
     ```
   - Replace the placeholder values with your actual credentials

### Authentication & Personalized Agent Features

When users are **not authenticated**, the agent provides basic functionality for all visitors.

When users **are authenticated** (signed in via Clerk), the agent:
- Recognizes the authenticated user
- Can access personalized features (email, tools, etc.)
- Receives user context that can be used for personalized responses

**To test authentication:**
1. Start your dev server
2. Visit `/sign-up` to create an account
3. Sign in at `/sign-in`
4. Once authenticated, the agent will receive your user ID and can provide personalized features

4. **Start the Development Server**
   ```sh
   npm run dev
   ```
   - The voice chat button will appear on your website
   - Click it to start a voice conversation with your AI assistant

### Voice Recognition Configuration

The voice chat component supports voice recognition to allow the agent to recognize your voice. This can be configured in two ways:

**Option 1: Environment Variables (Recommended)**
Add to your `.env` file:
```
PUBLIC_VAPI_ENABLE_VOICE_RECOGNITION=true
PUBLIC_VAPI_VOICE_PROFILE_ID=your_voice_profile_id
```

**Option 2: Component Props**
Pass voice recognition settings directly to the component:
```astro
<VoiceChatButton 
  position="center-bottom"
  enableVoiceRecognition={true}
  voiceProfileId="your_voice_profile_id"
/>
```

**Getting Your Voice Profile ID:**
1. In your Vapi dashboard, navigate to Voice Recognition settings
2. Create or select a voice profile
3. Copy the Voice Profile ID
4. Add it to your environment variables or component props

**Note:** Voice recognition features depend on your Vapi plan and assistant configuration. Check the [Vapi documentation](https://docs.vapi.ai) for available voice recognition options.

### Customization

You can customize the voice chat button by modifying `src/components/VoiceChatButton.astro`:
- Change the button position (bottom-right, bottom-left, top-right, top-left)
- Adjust colors and styling
- Modify the button size and animations
- Configure voice recognition settings

Example:
```astro
<VoiceChatButton position="bottom-left" />
```

### Deployment (Docker / Railway)

The `Dockerfile` runs `npm run build` **before** your hosting platform injects environment variables into the running container. Values read only from `import.meta.env` can end up empty in production even when Railway variables are set correctly.

`VoiceChatButton` therefore reads `PUBLIC_VAPI_PUBLIC_KEY` and `PUBLIC_VAPI_ASSISTANT_ID` from **`process.env` at request time** (with `import.meta.env` as a fallback for local dev). Ensure these two variables are defined on the **running service** in Railway (or your host). They must use the `PUBLIC_` prefix so they are intended for client-side use; the server injects them into the page when it renders.

If the toggle still shows **VAPI NOT CONFIGURED**, the server process does not see those variables—double-check the variable names and redeploy.

## 📱 SMS Integration (Twilio)

This project includes inbound SMS handling via Twilio.

### Setup Instructions

1. **Get Your Twilio Credentials**
   - Sign up at [https://www.twilio.com](https://www.twilio.com)
   - Get your **Account SID** and **Auth Token** from the Twilio Console
   - Add them to your `.env` file:
     ```
     TWILIO_ACCOUNT_SID=your_account_sid
     TWILIO_AUTH_TOKEN=your_auth_token
     ```

2. **Configure Your Twilio Number**
   - In the Twilio Console, go to Phone Numbers → Manage → Active Numbers
   - Select your number: `+18889498224`
   - Under "Messaging", set the webhook URL to:
     ```
     https://your-domain.com/api/sms
     ```
   - For local development, use a tool like [ngrok](https://ngrok.com) to expose your local server:
     ```
     ngrok http 4323
     ```
     Then use: `https://your-ngrok-url.ngrok.io/api/sms`

3. **Customize SMS Handling**
   - Edit `src/pages/api/sms.ts` to add your custom logic
   - Examples: forward to AI, store in database, send auto-replies, etc.

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Dev server with **Vite HMR** at `http://localhost:4321` (also `http://<LAN-IP>:4321`) |
| `npm run dev:poll`        | Same, but **polling** file watcher — use if saves do not trigger reload (Docker/NFS) |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Admin agent (Claude tool loop)

Bundled markdown lives in `src/knowledge/*.md`. The **/admin → Chats** tab runs an Anthropic agent with tools for knowledge, contacts, jobs, billing, email inbox actions, and dev ops. See `src/lib/agentTools.ts`.

**Inbound email triage** runs inside this app: mail arrives via a **Resend webhook** at `/api/email/inbound`, is classified by keyword rules + Claude, and surfaces in **/admin → Inbox** (Web Push optional). See `src/knowledge/email-rules.md`.

1. Copy `.env.example` → `.env` and set **`ANTHROPIC_API_KEY`**, **`DATABASE_URL`**, and **`AGENT_ALERT_USER_ID`** (your Clerk user id for the System alerts thread).
2. Sign in at **`/admin`**, open **Chats**, and ask natural-language questions — the agent calls tools (list contacts, create invoices, mark email junk, etc.).

3. **Contact identity (`eliteweblabs/contact-api`)** — on Railway, **do not hardcode** the public URL on the Astro service. Add **`CONTACT_API_BASE_URL`** as a [reference variable](https://docs.railway.com/guides/variables#reference-variables), e.g. `https://${{ contact-api.RAILWAY_PUBLIC_DOMAIN }}` (service name must match your Railway service). Optional **`CONTACT_API_KEY`**: use a **shared variable** and reference it from both Astro and contact-api so secrets stay single-source. **Reave App** already includes **`contact-api`** and **`contact-postgres`**.

4. **Railway tooling:** set **`RAILWAY_API_TOKEN`** (and optionally **`RAILWAY_WORKSPACE_ID`**, **`RAILWAY_DRY_RUN=1`** for rehearsals) on Astro. Ask the agent to list domains or check deploy status.

5. **Deploy failure alerts:** configure a **Railway project webhook** to `https://reave.app/api/railway/webhook?key=…` (same secret as **`RAILWAY_WEBHOOK_INGRESS_KEY`**). Failures post to the **System alerts** chat when **`AGENT_ALERT_USER_ID`** is set. Details: `src/knowledge/railway-deploy-webhook.md`.

6. **Inbound email:** in Resend, enable receiving on a `reave.app` subdomain (add the MX record) and create an `email.received` webhook to `https://reave.app/api/email/inbound`. Set **`RESEND_API_KEY`** and **`RESEND_WEBHOOK_SECRET`**. Tune rules in `src/lib/emailRules.ts`. Details: `src/knowledge/email-rules.md`.

### Hot reload (local)

- Run **`npm run dev`** — Astro + Vite hot-reload **client** scripts/styles and refresh **server** routes when you save (some `.astro` layout changes may still do a full page reload; that is normal).
- Prefer **`http://localhost:4321`** for the fewest WebSocket/HMR edge cases. The dev server listens on **all interfaces** (`server.host: true`) so LAN access still works.
- If edits never trigger a reload, try **`npm run dev:poll`** (sets `VITE_USE_POLLING=1` for the file watcher).

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

