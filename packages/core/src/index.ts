export type { A11yPrefs, ProfileKey } from './types';
export { DEFAULT_PREFS, DEFAULT_STORAGE_KEY, PROFILES, PROFILE_LABELS } from './profiles';
export { AccessPathState } from './state';
export type { Listener } from './state';
export { getState } from './registry';
export { applyClasses } from './apply-classes';
export { prefersReducedMotion } from './reduced-motion';
export { createFocusTrap } from './focus-trap';
export type { FocusTrap, FocusTrapOptions } from './focus-trap';
export { createPanel } from './panel-dom';
export type {
  CreatePanelOptions,
  PanelHandle,
  CustomActionConfig,
  ControlCategoryKey,
  SectionKey,
  CustomSectionConfig,
} from './panel-dom';
export { createTriggerButton } from './trigger-button';
export type {
  CreateTriggerButtonOptions,
  TriggerPosition,
  TriggerShape,
  TriggerIconKey,
} from './trigger-button';
export { applyBrandColor } from './brand-color';
export { generateStatement } from './statement';
export type { StatementConfig } from './statement';
export { resolveLabels } from './i18n';
export type { Labels, LocaleKey, LabelOverrides } from './i18n';
export { runAccessibilityScan, highlightScanNode, CATEGORY_LABEL, TOTAL_RULE_COUNT } from './a11y-scanner';
export type { ScanResult, ScanCheck, ScanViolationNode, ScanImpact, ScanStatus, ScanCategory, ScanScope } from './a11y-scanner';
export { openReportAndScan } from './report-page';

