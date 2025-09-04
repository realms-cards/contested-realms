"use client";

import { useEffect, useState } from "react";

type SealedConfig = {
  timeLimit: number; // minutes
  constructionStartTime: number; // timestamp
};

export default function useSealedTimer(
  isSealed: boolean,
  sealedConfig: SealedConfig | null
) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    if (!isSealed || !sealedConfig?.constructionStartTime || !sealedConfig?.timeLimit)
      return;
    const update = () => {
      const now = Date.now();
      const elapsed = now - sealedConfig.constructionStartTime;
      const total = sealedConfig.timeLimit * 60 * 1000;
      setTimeRemaining(Math.max(0, total - elapsed));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isSealed, sealedConfig?.constructionStartTime, sealedConfig?.timeLimit]);

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return { timeRemaining, formatTime };
}

