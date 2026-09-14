import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the design-system scales so `rounded-full` or
// `shadow-none` passed as className actually override rc-* defaults.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["rc-sm", "rc-md", "rc-lg"],
      shadow: ["rc-sm", "rc-md", "rc-panel"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
