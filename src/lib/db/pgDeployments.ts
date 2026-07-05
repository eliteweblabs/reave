import { db } from "./index";
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  varchar,
  json,
} from "drizzle-orm/pg-core";

export const deployments = pgTable("deployments", {
  id: varchar("id", { length: 255 }).primaryKey(),
  projectId: varchar("project_id", { length: 255 }).notNull(),
  projectName: varchar("project_name", { length: 255 }).notNull(),
  environmentId: varchar("environment_id", { length: 255 }).notNull(),
  environmentName: varchar("environment_name", { length: 255 }).notNull(),
  status: varchar("status", {
    length: 50,
    enum: ["success", "failed", "building", "deploying"],
  }).notNull(),
  message: text("message"),
  railwayEventId: varchar("railway_event_id", { length: 255 }),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export async function insertDeployment(data: {
  id: string;
  projectId: string;
  projectName: string;
  environmentId: string;
  environmentName: string;
  status: "success" | "failed" | "building" | "deploying";
  message?: string;
  railwayEventId?: string;
  metadata?: Record<string, unknown>;
}) {
  return db.insert(deployments).values(data).onConflictDoUpdate({
    target: deployments.id,
    set: {
      status: data.status,
      message: data.message,
      updatedAt: new Date(),
      metadata: data.metadata,
    },
  });
}

export async function getFailedDeployments(limit = 10) {
  return db
    .select()
    .from(deployments)
    .where(sql`${deployments.status} = 'failed'`)
    .orderBy(sql`${deployments.createdAt} DESC`)
    .limit(limit);
}

export async function getRecentDeployments(limit = 20) {
  return db
    .select()
    .from(deployments)
    .orderBy(sql`${deployments.createdAt} DESC`)
    .limit(limit);
}
