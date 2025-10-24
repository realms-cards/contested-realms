"use client";

import Image from "next/image";
import React from "react";

export default function AsciiLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`${className} select-none`}>
      <Image
        src="/realms.cards.svg"
        alt="Realms.cards logo"
        width={840}
        height={220}
        priority
        className="block w-full h-auto pointer-events-none select-none"
        draggable={false}
      />
    </div>
  );
}
