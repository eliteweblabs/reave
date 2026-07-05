import type { Tool } from "anthropic";

/**
 * All available tools for the agent.
 * These are passed to Claude and used in agentRunner.ts to execute actions.
 */
export const AGENT_TOOLS: Tool[] = [
  {
    name: "send_email",
    description:
      "Send an outbound email via Resend. Use when the user asks you to email someone directly.",
    input_schema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject line",
        },
        body: {
          type: "string",
          description: "Message body (plain text or HTML)",
        },
        cc: {
          type: "string",
          description: "Optional CC — comma-separated addresses",
        },
        bcc: {
          type: "string",
          description: "Optional BCC — comma-separated addresses",
        },
        from: {
          type: "string",
          description:
            "Optional From address (defaults to RESEND_FROM / company outbound email)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  // ... rest of existing tools
];
