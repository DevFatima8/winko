export const AVATARS: string[] = Array.from({ length: 50 }, (_, i) => `Avatar-${String(i + 1).padStart(2, "0")}-${(i + 1) % 2 ? "Male" : "Female"}`);

export const isAvatar = (v: unknown): v is string => typeof v === "string" && AVATARS.includes(v);

export const avatarSrc = (a: string) => `/Profile-Avatars/Profile-Avatars/${a}/${a}.png`;
