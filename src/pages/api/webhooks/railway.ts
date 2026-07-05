import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { pgDeployments } from "@/lib/pgDeployments";
import { write_knowledge } from "@/lib/knowledge";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();

    // Log all webhook events
    console.log("[Railway Webhook]", body.type, body.data?.id);

    // Only process deployment events
    if (body.type !== "deployment") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const deployment = body.data;
    const status = deployment.status; // "success", "failed", "building", etc.
    const environment = deployment.environmentId;
    const service = deployment.serviceId;
    const projectId = deployment.projectId;

    // Store in database
    await db.insert(pgDeployments).values({
      railwayDeploymentId: deployment.id,
      projectId,
      serviceId: service,
      environmentId: environment,
      status,
      createdAt: new Date(deployment.createdAt),
      updatedAt: new Date(),
      rawPayload: deployment,
    });

    // Only alert on failures
    if (status === "failed") {
      const alertTitle = `Railway Deployment Failed: ${service}`;
      const alertContent = `
**Deployment ID:** ${deployment.id}
**Service:** ${service}
**Environment:** ${environment}
**Status:** ${status}
**Error:** ${deployment.failureMessage || "No error message provided"}

[View in Railway](https://railway.app/project/${projectId})
      `.trim();

      // Create/update knowledge entry for alert
      await write_knowledge({
        slug: `railway-deploy-failed-${deployment.id.slice(0, 8)}`,
        title: alertTitle,
        content: alertContent,
        tags: ["deployment", "railway", "alert"],
      });

      console.error("[Railway Alert]", alertTitle);
    }

    return new Response(JSON.stringify({ ok: true, processed: true }), {
      status: 200,
    });
  } catch (error) {
    console.error("[Railway Webhook Error]", error);
    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 500 }
    );
  }
};
