import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const itineraries = pgTable("itineraries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  destination: text("destination").notNull(),
  destinationName: text("destination_name").notNull(),
  region: text("region").notNull().default("국내"),
  memberType: text("member_type").notNull(),
  memberCount: integer("member_count").notNull(),
  nights: integer("nights").notNull(),
  month: integer("month").notNull(),
  purposes: jsonb("purposes").$type<string[]>().notNull(),
  days: jsonb("days").notNull(),
  estimatedTotalCost: integer("estimated_total_cost").notNull(),
  currency: text("currency").notNull().default("KRW"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  author: text("author").notNull(),
  destination: text("destination").notNull(),
  rating: integer("rating").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tripMonth: integer("trip_month").notNull(),
  nights: integer("nights").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
