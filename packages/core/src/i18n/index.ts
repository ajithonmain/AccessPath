import { Labels, LocaleKey } from './types';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { pt } from './pt';

export type { Labels, LocaleKey } from './types';

const BUNDLES: Record<LocaleKey, Labels> = { en, es, fr, de, pt };

/** Partial overrides for `labels` — nested per-string, not a flat object, matching
 *  Labels' own structure. Function-valued leaves (e.g. `activeBand.count`) must be
 *  replaced wholesale, not merged. */
export type LabelOverrides = {
  [K in keyof Labels]?: Labels[K] extends (...args: never[]) => unknown
    ? Labels[K]
    : Labels[K] extends object
      ? { [K2 in keyof Labels[K]]?: Labels[K][K2] }
      : Labels[K];
};

function mergeLabels(base: Labels, overrides?: LabelOverrides): Labels {
  if (!overrides) return base;
  const result = { ...base } as Labels;
  for (const key of Object.keys(overrides) as (keyof Labels)[]) {
    const overrideValue = overrides[key];
    if (overrideValue === undefined) continue;
    const baseValue = base[key];
    result[key] =
      typeof baseValue === 'object' && baseValue !== null && typeof overrideValue === 'object'
        ? ({ ...baseValue, ...overrideValue } as never)
        : (overrideValue as never);
  }
  return result;
}

/** Resolves the effective label set for a panel: a bundled locale (default 'en'),
 *  with any host-supplied per-string overrides applied on top. */
export function resolveLabels(locale?: LocaleKey, overrides?: LabelOverrides): Labels {
  const base = BUNDLES[locale ?? 'en'] ?? en;
  return mergeLabels(base, overrides);
}
