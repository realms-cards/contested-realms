import Link from "next/link";
import { prisma } from "@/lib/prisma";
import DeckItem from "./DeckItem";
import DeckImportCuriosa from "./DeckImportCuriosa";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  type DeckRow = { id: string; name: string; format: string; updatedAt: Date; createdAt: Date };
  const decks = await prisma.deck.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, format: true, updatedAt: true, createdAt: true },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Your Decks</h1>
        <Link href="/decks/editor" className="ml-auto px-3 py-2 rounded bg-foreground text-background">
          New Deck
        </Link>
      </div>

      {/* Curiosa import panel */}
      <DeckImportCuriosa />

      {decks.length === 0 ? (
        <div className="text-sm opacity-80">
          No decks yet. Create one from the <Link href="/decks/editor" className="underline">editor</Link> or save from Draft.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {decks.map((d: DeckRow) => (
            <DeckItem
              key={d.id}
              deck={{
                id: d.id,
                name: d.name,
                format: d.format,
                updatedAt: d.updatedAt.toISOString(),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
