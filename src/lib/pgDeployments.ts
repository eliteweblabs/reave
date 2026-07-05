import { pgTable, text, timestamp, varchar, json } from "drizzle-orm/pg-core";

export const pgDeployments = pgTable("deployments", {
  id: varchar("id", { length: 256 }).primaryKey().notNull(),
  railwayDeploymentId: varchar("railway_deployment_id", { length: 256 })
    .notNull()
    .unique(),
  projectId: varchar("project_id", { length: 256 }).notNull(),
  serviceId: varchar("service_id", { length: 256 }).notNull(),
  environmentId: varchar("environment_id", { length: 256 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(), // "success", "failed", "building", etc.
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  rawPayload: json("raw_payload"),
});
