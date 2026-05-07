/**
 * Industrial Utility Design Tokens
 * Aesthetic: High-contrast, Monospaced, "Heads-up Display"
 */

export const StatusColors = {
  // Semantic States
  HEALTHY: { bg: '#CFF8DF', text: '#064E25', border: '#32C76F' },
  WARNING: { bg: '#FFE59A', text: '#6F4700', border: '#E8AA00' },
  CRITICAL: { bg: '#FFD8D2', text: '#8E1B13', border: '#EF5A4F' },
  ACTIVE: { bg: '#D6E8FF', text: '#0754A6', border: '#3B82F6' },
  NEUTRAL: { bg: '#E7E9EE', text: '#27272A', border: '#A1A1AA' },

  // UI Elements
  PANEL_BG: '#F8FAFC',
  PANEL_BORDER: '#E2E8F0',
  HEADER_BG: '#F1F5F9'
} as const;

export const StatusTypos = {
  MONO: 'font-mono tracking-tight',
  HEADER: 'uppercase tracking-widest text-[10px] font-bold text-muted-foreground',
  VALUE: 'font-mono font-bold text-sm'
} as const;
