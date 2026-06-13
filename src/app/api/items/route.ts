import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { embed, itemEmbedText } from "@/lib/ai/embeddings";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().min(1).max(300),
  category: z.string().min(1).max(80).default("general"),
  description: z.string().max(10000).optional(),
  location: z.string().max(300).optional(),
  tags: z.array(z.string().max(60)).max(40).optional(),
  fields: z.record(z.string(), z.string()).optional(),
});

export async function GET(req: NextRequest) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const category = req.nextUrl.searchParams.get("category")?.trim();

  const conditions = [eq(items.ownerId, user.id)];
  if (category) conditions.push(eq(items.category, category));
  if (q) {
    conditions.push(
      or(ilike(items.title, `%${q}%`), ilike(items.description, `%${q}%`))!
    );
  }

  const rows = await db
    .select({
      id: items.id,
      title: items.title,
      category: items.category,
      description: items.description,
      location: items.location,
      tags: items.tags,
      updatedAt: items.updatedAt,
    })
    .from(items)
    .where(and(...conditions))
    .orderBy(desc(items.updatedAt))
    .limit(200);

  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const embedding = await embed(
    itemEmbedText({
      title: data.title,
      category: data.category,
      description: data.description,
      fields: data.fields,
      tags: data.tags,
      location: data.location,
    })
  );

  const [created] = await db
    .insert(items)
    .values({
      ownerId: user.id,
      title: data.title,
      category: data.category,
      description: data.description ?? null,
      location: data.location ?? null,
      tags: data.tags ?? [],
      fields: data.fields ?? {},
      embedding: embedding ?? null,
    })
    .returning();

  return NextResponse.json({ item: created }, { status: 201 });
}
