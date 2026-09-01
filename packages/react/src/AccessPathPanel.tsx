import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { getState, createPanel, applyClasses } from '@accesspath/core';
import type {
  PanelHandle,
  ProfileKey,
  CustomActionConfig,
  LocaleKey,
  LabelOverrides,
  SectionKey,
  ControlCategoryKey,
  CustomSectionConfig,
} from '@accesspath/core';

export interface AccessPathPanelProps {
  /** Element the a11y-* effect classes get applied to. Defaults to document.body. */
  container?: HTMLElement | null;
  isDarkTheme?: boolean;
  storageKey?: string;
  profiles?: ProfileKey[];
  /** Overrides the --ap-brand-* token set via inline style on panel.root — safe to use
   *  even though panel.root mounts at document.documentElement (outside this
   *  component's own JSX subtree), unlike a `style` prop on a wrapping <div> further
   *  up, which would never reach it. See @accesspath/core's brand-color.ts. */
  brandColor?: string;
  /** Host-defined buttons rendered in the drawer's "Actions" section. */
  actions?: CustomActionConfig[];
  /** Fires when a custom action button is clicked, with its `id`. Sugar over listening
   *  for the `accesspath:action` CustomEvent dispatched on `container` directly. */
  onAction?: (id: string) => void;
  /** Bundled translation set for all panel text. Defaults to 'en'. */
  locale?: LocaleKey;
  /** Per-string overrides applied on top of the resolved `locale` bundle. */
  labels?: LabelOverrides;
  /** Which top-level sections render, and in what order. Defaults to
   *  ['profiles', 'quick', 'controls', 'actions']. */
  sections?: SectionKey[];
  /** Which of the 5 built-in categories render inside the 'controls' section. */
  controlCategories?: ControlCategoryKey[];
  /** Host-supplied sections, rendered with the same chrome as the built-in categories. */
  customSections?: CustomSectionConfig[];
  /** URL rendered as a "Report a Problem" link in the footer. Omit to hide it. */
  reportUrl?: string;
}

export interface AccessPathPanelHandle {
  open(): void;
  close(): void;
  reset(): void;
}

export const AccessPathPanel = forwardRef<AccessPathPanelHandle, AccessPathPanelProps>(
  (
    {
      container,
      isDarkTheme = false,
      storageKey,
      profiles,
      brandColor,
      actions,
      onAction,
      locale,
      labels,
      sections,
      controlCategories,
      customSections,
      reportUrl,
    },
    ref
  ) => {
    const panelRef = useRef<PanelHandle | null>(null);
    const containerRef = useRef<HTMLElement | null>(null);
    containerRef.current = container ?? null;
    // Kept fresh every render so the create-once listener below never calls a stale
    // onAction closure, without needing to remount the panel when it changes identity.
    const onActionRef = useRef(onAction);
    onActionRef.current = onAction;

    useEffect(() => {
      const state = getState(storageKey);
      const panel = createPanel({
        state,
        isDarkTheme,
        profiles,
        container: containerRef.current ?? undefined,
        brandColor,
        actions,
        locale,
        labels,
        sections,
        controlCategories,
        customSections,
        reportUrl,
      });
      panelRef.current = panel;

      const listenTarget = containerRef.current ?? document.documentElement;
      const handleAction = (e: Event) => {
        const { id } = (e as CustomEvent<{ id: string }>).detail;
        onActionRef.current?.(id);
      };
      listenTarget.addEventListener('accesspath:action', handleAction);
      // Mounted at the <html> level, not wherever <AccessPathPanel> happens to sit in the
      // consumer's JSX tree — the panel is position:fixed regardless (see CLAUDE.md), and this
      // guarantees it's never a descendant of `container`, so it can't inherit a
      // saturate/grayscale/invert filter applied there (some a11y-* effects use CSS `filter`,
      // which visually filters an element's entire rendered subtree, Shadow DOM or not).
      document.documentElement.appendChild(panel.root);

      const reapply = () => {
        const target = containerRef.current ?? document.body;
        applyClasses([target], state.prefs, state.activeProfiles);
      };
      const unsubscribe = state.subscribe(reapply);
      reapply();

      return () => {
        unsubscribe();
        listenTarget.removeEventListener('accesspath:action', handleAction);
        panel.destroy();
        panel.root.remove();
        panelRef.current = null;
      };
      // Panel identity is created once per mount; storageKey/profiles/actions changes require remounting.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      panelRef.current?.setDarkTheme(isDarkTheme);
    }, [isDarkTheme]);

    useImperativeHandle(
      ref,
      () => ({
        open: () => getState(storageKey).open(),
        close: () => getState(storageKey).close(),
        reset: () => getState(storageKey).reset(),
      }),
      [storageKey]
    );

    return null;
  }
);

AccessPathPanel.displayName = 'AccessPathPanel';
