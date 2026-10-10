// Colours written into compositions (not Studio's UI, whose colours live in
// src/styles/theme.css). Shared by the blank composition and the "Ajouter" panel's
// defaults, so a new element matches the Creator palette out of the box.

export const COMPOSITION_PALETTE = {
  background: "#101318",
  text: "#F4F7F6",
  accent: "#00A896",
  action: "#FF6B35",
  /** Subtitle text default: pure white reads best over footage. */
  subtitleText: "#ffffff",
} as const;
