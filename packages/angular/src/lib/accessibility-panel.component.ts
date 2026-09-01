import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  AccessPathState,
  ControlCategoryKey,
  CustomActionConfig,
  CustomSectionConfig,
  LabelOverrides,
  LocaleKey,
  PanelHandle,
  ProfileKey,
  SectionKey,
  applyClasses,
  createPanel,
  getState,
} from '@accesspath/core';

@Component({
  selector: 'app-accessibility-panel',
  standalone: true,
  template: '',
})
export class AccessibilityPanelComponent implements OnInit, OnChanges, OnDestroy {
  /** Element the a11y-* effect classes get applied to (e.g. your widget/app root). Defaults to
   *  <body>, not <html> — some effects (saturation, invert) use a CSS `filter`, which visually
   *  filters an element's entire rendered subtree regardless of Shadow DOM boundaries. Since the
   *  drawer mounts at the <html> level (see ngOnInit), <html> itself must stay filter-free or the
   *  drawer would inherit the filter along with the rest of the page. */
  @Input() container: HTMLElement = document.body;
  @Input() isDarkTheme = false;
  /** localStorage key used to persist preferences. Matches @accesspath/core's
   *  DEFAULT_STORAGE_KEY ('accesspath-prefs') — the same default the embed script and
   *  @accesspath/react use, so switching wrappers on the same site doesn't lose a
   *  visitor's saved prefs. (AccessPathState.load() also one-time-migrates a visitor's
   *  prefs saved under the old pre-unification default, 'a11y-prefs', if found.) */
  @Input() storageKey = 'accesspath-prefs';
  /** Restrict which preset profile buttons render. Defaults to all profiles. */
  @Input() profiles?: ProfileKey[];
  /** Overrides the --ap-brand-* token set via inline style on panel.root, applied once
   *  at ngOnInit — not a live-bindable input, same as `profiles` above, since the panel
   *  is only created once. See @accesspath/core's brand-color.ts. */
  @Input() brandColor?: string;
  /** Host-defined buttons rendered in the drawer's "Actions" section. */
  @Input() actions?: CustomActionConfig[];
  /** Fires when a custom action button is clicked, with its `id`. Sugar over listening
   *  for the `accesspath:action` CustomEvent dispatched on `container` directly. */
  @Output() action = new EventEmitter<string>();
  /** Bundled translation set for all panel text. Defaults to 'en'. */
  @Input() locale?: LocaleKey;
  /** Per-string overrides applied on top of the resolved `locale` bundle. */
  @Input() labels?: LabelOverrides;
  /** Which top-level sections render, and in what order. Defaults to
   *  ['profiles', 'quick', 'controls', 'actions']. */
  @Input() sections?: SectionKey[];
  /** Which of the 5 built-in categories render inside the 'controls' section. */
  @Input() controlCategories?: ControlCategoryKey[];
  /** Host-supplied sections, rendered with the same chrome as the built-in categories. */
  @Input() customSections?: CustomSectionConfig[];
  /** URL rendered as a "Report a Problem" link in the footer. Omit to hide it. */
  @Input() reportUrl?: string;

  private state!: AccessPathState;
  private panel!: PanelHandle;
  private unsubscribe?: () => void;
  private readonly handleAction = (e: Event): void => {
    const { id } = (e as CustomEvent<{ id: string }>).detail;
    this.action.emit(id);
  };

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.state = getState(this.storageKey);
    this.panel = createPanel({
      state: this.state,
      isDarkTheme: this.isDarkTheme,
      profiles: this.profiles,
      container: this.container,
      brandColor: this.brandColor,
      actions: this.actions,
      locale: this.locale,
      labels: this.labels,
      sections: this.sections,
      controlCategories: this.controlCategories,
      customSections: this.customSections,
      reportUrl: this.reportUrl,
    });
    // Mounted at the <html> level, not inside this.el.nativeElement's own position in the
    // template — the panel is position:fixed regardless (see CLAUDE.md), and this guarantees
    // it's never a descendant of `container`, so it can't inherit a saturate/grayscale/invert
    // filter applied there (see the `container` doc comment above).
    document.documentElement.appendChild(this.panel.root);
    this.container.addEventListener('accesspath:action', this.handleAction);

    const reapply = () => applyClasses([this.container], this.state.prefs, this.state.activeProfiles);
    this.unsubscribe = this.state.subscribe(reapply);
    reapply();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isDarkTheme'] && this.panel) {
      this.panel.setDarkTheme(this.isDarkTheme);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.container.removeEventListener('accesspath:action', this.handleAction);
    this.panel?.destroy();
    // Not a child of this.el.nativeElement (see ngOnInit) — Angular won't remove it for us.
    this.panel?.root.remove();
  }

  open(): void {
    this.state.open();
  }

  close(): void {
    this.state.close();
  }

  reset(): void {
    this.state.reset();
  }
}
