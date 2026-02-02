"use client";

/**
 * Attack of the Realm Eater (AOTRE) - Main Page
 *
 * Solo/co-op game mode route
 * Based on the community variant by OOPMan
 * https://codeberg.org/OOPMan/attack-of-the-realm-eater
 */

import { Suspense } from "react";
import { RealmEaterGame } from "@/components/aotre/RealmEaterGame";

export default function AotrePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-black">
          <div className="text-center">
            <h1 className="mb-4 text-2xl font-bold text-white">
              Attack of the Realm Eater
            </h1>
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      }
    >
      <RealmEaterGame />
    </Suspense>
  );
}
