"use client";

import { useEffect, useState } from "react";
import { DEFAULT_MODEL, MODELS } from "@/lib/api";

const KEY = "astro-model";

export function useModel(): [string, (m: string) => void] {
  const [model, setModel] = useState(DEFAULT_MODEL);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved && MODELS.some((m) => m.id === saved)) setModel(saved);
  }, []);

  const set = (m: string) => {
    setModel(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* private mode */
    }
  };

  return [model, set];
}
