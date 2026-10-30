"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "./GameLabel.module.css";

export function GameName({ name, compact = false, className = "" }: { name: string; compact?: boolean; className?: string }) {
  const container = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const box = container.current;
    const label = text.current;
    if (!box || !label) return;
    const fit = () => {
      label.style.fontSize = "inherit";
      const available = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight);
      const width = label.getBoundingClientRect().width;
      if (available > 0 && width > available) {
        label.style.fontSize = `${parseFloat(getComputedStyle(box).fontSize) * (available / width) * 0.98}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [name]);

  return (
    <span ref={container} data-game-name className={`${styles.label} ${styles.name} ${compact ? styles.compactName : ""} ${className}`}>
      <span ref={text} data-game-name className={styles.text}>{name}</span>
    </span>
  );
}
