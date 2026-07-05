import type { APIRoute } from "astro";
import { insertDeployment, getFailedDeployments } from "@/lib/db/pgDeployments";
import { write_knowledge } from "@/lib/knowledge/write";

interface RailwayDeploymentEvent {
  id: string;
  projectId: string;
  projectName: string;
  environmentId: string;
  environmentName: string;
  status: "success" | "failed" | "building" | "deploying";
  message?: string;
  eventId?: string;
  metadata?: Record<string, unknown>;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const event = (await request.json()) as RailwayDeploymentEvent;

    // Validate required fields
    if (
      !event.id ||
      !event.projectId ||
      !event.projectName ||
      !event.environmentId ||
      !event.environmentName ||
      !event.status
    ) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
      });
    }

    // Store deployment event
    await insertDeployment({
      id: event.id,
      projectId: event.projectId,
      projectName: event.projectName,
      environmentId: event.environmentId,
      environmentName: event.environmentName,
      status: event.status,
      message: event.message,
      railwayEventId: event.eventId,
      metadata: event.metadata,
    });

    // If deployment failed, log it to knowledge and create alert
    if (event.status === "failed") {
      const failedDeployments = await getFailedDeployments(1);
      const latestFailed = failedDeployments[0];

      if (latestFailed) {
        await write_knowledge({
          slug: `deployment-failed-${event.id}`,
          title: `Deployment Failed: ${event.projectName} (${event.environmentName})`,
          content: `## Deployment Failed

**Project:** ${event.projectName}  
**Environment:** ${event.environmentName}  
**Deployment ID:** ${event.id}  
**Time:** ${new Date().toISOString()}

**Message:** ${event.message || "No message provided"}

**Status:** ${event.status}

---

This deployment needs attention. Check Railway dashboard for logs: https://railway.app/project/${event.projectId}
`,
          tags: ["deployment", "railway", "alert", "failed"],
        });

        // Log to console for visibility
        console.error(
          `[RAILWAY] Deployment failed: ${event.projectName} (${event.environmentName})`
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Deployment ${event.status} recorded`,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[RAILWAY] Webhook error:", error);
    return new Response(
      JSON.stringify({
        error: "Webhook processing failed",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
};
