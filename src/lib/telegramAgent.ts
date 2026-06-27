import { resolveAgentModel } from './agentModel';
import { isBraveConfigured } from './braveClient';
import { buildTools, runTool } from './telegramToolDefs';
import { isContactApiConfigured, siteBaseUrl } from './contactApi';
import { isCardDavConfigured } from './carddav/auth';
import { isCraterConfigured } from './craterClient';
import { isGithubConfigured } from './githubClient';
import { isRailwayConfigured } from './railwayClient';
import { serverEnv } from './serverEnv';
import type { TelegramChatTurn } from './telegramChatHistory';

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

/** Map the internal (OpenAI-style) tool defs to Anthropic's tools shape. */
function buildAnthropicTools(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return buildTools().map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

function currentDateTimeLine(): string {
  return `Current date and time: ${new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York',
  })}`;
}

/**
 * Minimal agent loop (Anthropic Messages API): the model may call
 * list_knowledge / read_knowledge / resolve_contact / create_invoice / etc.;
 * we execute each tool and feed results back until it produces a final answer.
 */
export async function runTelegramKnowledgeAgent(opts: {
  userText: string;
  priorTurns?: TelegramChatTurn[];
  model?: string | null;
}): Promise<string> {
  const { userText, priorTurns = [], model: modelOverride } = opts;
  const apiKey = serverEnv('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return 'LLM is not configured. Set ANTHROPIC_API_KEY, or use /knowledge, /get, /invoices, /resolve.';
  }

  const model = await resolveAgentModel(modelOverride);
  const tools = buildAnthropicTools();

  const sysParts = [
    'You are a concise assistant for a solo developer business OS.',
    'You receive prior turns from this Telegram chat. Treat short follow-ups ("yes", "build that", "do it") as continuing the thread — do not ask what to build if the user is agreeing to something you just offered.',
    'Ground answers in tools: call list_knowledge if you need playbooks; call resolve_contact when the user mentions a client/person name or asks who they are (typos, nicknames). To browse or show the full client list (e.g. "list my contacts"), call list_contacts (optionally with a search term) — do not claim you can only do fuzzy lookups.',
    'Work/jobs: project notes live separately from playbooks (list_work / read_work / create_work / update_work / delete_work). resolve_contact returns work_jobs summaries for that client — call read_work with a slug when you need full job details. Use create_work when a client request should become a tracked job (client must exist in contact-api). Only call delete_work when the user explicitly asks to remove a job. Do not assume job content without reading it.',
    'After tools, answer in plain text for Telegram (short paragraphs, avoid huge markdown tables).',
    'Dev ops: use run_dev_task for service_status or connectivity pings — never ask to run shell commands directly.',
  ];
  if (isRailwayConfigured()) {
    sysParts.push(
      'Railway: RAILWAY_API_TOKEN is configured — you CAN read projects/domains. Use list_railway_domains for CNAME targets, *.up.railway.app domains, and custom-domain TXT verification (defaults: Reave App / production). run_dev_task ping_railway checks token connectivity; list_railway_domains also works via run_dev_task. Do not claim Railway is read-only or that you lack MCP — call the tool. Note: email DNS (mail.reave.app MX/TXT for Resend) is NOT Railway — see read_knowledge email-rules.',
    );
  } else {
    sysParts.push(
      'Railway reads unavailable (RAILWAY_API_TOKEN not set). /railway project still works only if token is added later.',
    );
  }
  sysParts.push(
    'Code/deploy checks: to verify work was committed & pushed, call get_git_status or get_recent_commits (GitHub is the source of truth). To verify it is live, call check_deployment_status (compares the deployed commit to GitHub latest + health ping). Deploy banners (🚀 deploying, 🔴 stale after 10m, 🟢 live only when asked or right after a deploy lands) prepend agent replies automatically — do not use ✅ for deploy status. Use list_open_branches for in-progress work. run_terminal_command runs read-only git/ls in a sandbox; do not promise to run arbitrary shell. Verify these yourself instead of asking the user to check.',
  );
  if (isGithubConfigured()) {
    sysParts.push(
      'GitHub edits: for file commits and PRs call read_knowledge slug "github-dev-tools" first if unsure of the workflow. Typical flow: create_github_branch → write_github_file (one or more commits) → create_pull_request (base defaults to main). Report branch URL, commit SHA/URL, and PR link. Do not claim code was pushed unless tools succeed. The bot cannot merge PRs or deploy.',
    );
  } else {
    sysParts.push(
      'GitHub writes unavailable (GITHUB_TOKEN not set). Status tools may still work on public repos with heavy rate limits.',
    );
  }
  if (isCraterConfigured()) {
    sysParts.push(
      'Billing: use create_invoice to make invoices in Crater. Treat amounts as whole US dollars. For "invoice <name> for $X" with no line detail, create one line item named "Services rendered" with quantity 1 and price X. Invoices default to DRAFT; do not mark SENT unless the user says it was sent. After creating, report the invoice number, amount, and the public link returned by the tool.',
      'Deleting: only call delete_invoice when the user explicitly asks to delete/remove an invoice; confirm the invoice_id first via get_invoice or list_recent_invoices.',
      'Destructive admin tools (reset_invoices) require explicit user confirmation with YES_DELETE_EVERYTHING; prefer dry_run first.'
    );
  } else {
    sysParts.push('Note: invoicing tools are unavailable (CRATER_API_BASE_URL / CRATER_API_TOKEN not set).');
  }
  if (isContactApiConfigured()) {
    sysParts.push(
      'Contacts: full CRUD is available — create_contact, list_contacts, resolve_contact, update_contact, delete_contact. Use update_contact to change a client\'s name, email, phone, company, or notes. Use delete_contact only when explicitly asked — requires uid (no fuzzy delete). If the contact has attached projects, warn that deleting the client will permanently delete all attached projects; if there are Crater invoices too, mention those separately. Pass force:true after the user confirms.',
      'Client portals: EVERY client automatically has a shareable mobile page at /c/<uid> (a link they open on iPhone and can "Add to Home Screen") — you never need to "create" one. The page shows the client\'s details plus any outstanding Crater invoices (with pay links). list_contacts returns each portal_url, and get_client_portal fetches a single link. The page is tabbed: Overview (headline/body/fields), Billing (automatic from Crater: outstanding, upcoming, previous), and Data (web-design handoff items like passwords/DNS/hosting). Use set_client_portal to CUSTOMIZE Overview content or populate the Data tab (its `data` param: each item has a label plus any of value/username/password/url), or to hide a page (enabled:false). Treat Data items as sensitive credentials. To actually deliver the link to a client ("send the client link to <name>"), use send_client_portal, which emails or texts it to them. These are CLIENT-FACING — never put private/internal notes there. If a name is ambiguous, the tool returns candidates; confirm before sending. Always report the share URL.'
    );
    if (isCardDavConfigured()) {
      sysParts.push(
        `CardDAV (iOS Contacts sync): When the user asks to sync contacts to iPhone, give step-by-step setup (Settings → Contacts → Accounts → Add Account → Other → CardDAV). Server = hostname only (reave.app), not a URL with path. Credentials = CARDDAV_USERNAME / CARDDAV_PASSWORD from Railway Variables — never paste values in chat. Always include a required Advanced block: Use SSL On, Port 443, Account URL / Path /carddav — do not say "if it asks for a path"; Advanced is mandatory on iOS. Sync is bidirectional with contact-api. Troubleshooting: https://reave.app/carddav/ should return 401 (not 404); "verification failed" usually means Advanced path missing. For full playbook call read_knowledge slug "carddav".`
      );
    } else {
      sysParts.push(
        'CardDAV: Native iOS Contacts sync can be enabled on the Reave app by setting CARDDAV_USERNAME + CARDDAV_PASSWORD (requires CONTACT_API_BASE_URL). Call read_knowledge slug "carddav" for iOS setup steps.'
      );
    }
  } else {
    sysParts.push('Note: resolve_contact and client portals are unavailable (CONTACT_API_BASE_URL not set).');
  }
  if (isBraveConfigured()) {
    sysParts.push(
      'Web search: use brave_search to look up public info (businesses, websites, people) when contact-api or knowledge docs do not have the answer.',
    );
  }
  sysParts.push(
    'Website review: use fetch_url to read a client site (content, title, meta description). Use lighthouse_audit for PageSpeed/Lighthouse scores (performance, accessibility, SEO). Use ssl_check for certificate expiry, TLS, and security headers. Use check_links for broken links and redirects. Use dns_check for DNS, SPF/DKIM/DMARC, and WHOIS. For a full client audit, combine these tools. Call them yourself when the user asks to review, audit, or check a URL or domain; do not ask them to paste page content.',
  );

  const system = `${currentDateTimeLine()}\n\n${sysParts.join('\n')}`;
  const messages: AnthropicMessage[] = [
    ...priorTurns.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: userText },
  ];

  const maxRounds = 25;

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages,
        tools,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return `Anthropic error (${res.status}): ${t.slice(0, 500)}`;
    }

    const data = (await res.json()) as {
      stop_reason?: string;
      content?: AnthropicContentBlock[];
    };

    const content = data.content ?? [];

    if (data.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content });
      const toolResults: AnthropicContentBlock[] = [];
      for (const block of content) {
        if (block.type === 'tool_use') {
          const out = await runTool(block.name, JSON.stringify(block.input ?? {}));
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: out });
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const text = content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return text || '(no text)';
  }

  return 'Stopped after max tool rounds. Try a narrower question.';
}
