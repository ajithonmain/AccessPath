import { Component, Input, OnInit, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface A11yPrefs {
  fontSize:     'normal' | 'lg' | 'xl';
  reduceMotion: boolean;
  textSpacing:  boolean;
  lineHeight:   boolean;
  dyslexia:     boolean;
  saturation:   'normal' | 'low' | 'high' | 'desaturate';
  contrast:     'normal' | 'invert' | 'dark' | 'light';
}

const DEFAULT_PREFS: A11yPrefs = {
  fontSize:     'normal',
  reduceMotion: false,
  textSpacing:  false,
  lineHeight:   false,
  dyslexia:     false,
  saturation:   'normal',
  contrast:     'normal',
};

const STORAGE_KEY = 'a11y-prefs';

@Component({
  selector: 'app-accessibility-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accessibility-panel.component.html',
  styleUrls: ['./accessibility-panel.component.css'],
})
export class AccessibilityPanelComponent implements OnInit {
  /** Element that the a11y-* effect classes get applied to (e.g. your widget/app root). Defaults to <html>. */
  @Input() container: HTMLElement = document.documentElement;
  @Input() isDarkTheme = false;
  /** localStorage key used to persist preferences. */
  @Input() storageKey = STORAGE_KEY;

  constructor(private el: ElementRef) {}

  isOpen = false;
  activeProfile: string | null = null;
  prefs: A11yPrefs = { ...DEFAULT_PREFS };

  readonly profiles: Record<string, Partial<A11yPrefs>> = {
    'low-vision': { fontSize: 'xl', reduceMotion: true, saturation: 'high' },
    'dyslexia':   { dyslexia: true, textSpacing: true, lineHeight: true },
    'seizure':    { reduceMotion: true, saturation: 'low' },
    'motor':      { fontSize: 'lg', reduceMotion: true },
    'colorblind': { saturation: 'desaturate', contrast: 'dark', textSpacing: true },
    'adhd':       { reduceMotion: true, textSpacing: true },
  };

  ngOnInit() {
    const saved = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
    if (saved.prefs)   this.prefs = { ...DEFAULT_PREFS, ...saved.prefs };
    if (saved.profile) this.activeProfile = saved.profile;
    this.applyClasses();
    this.updateHostClass();
  }

  open()  { this.isOpen = true; }
  close() { this.isOpen = false; }

  setFontSize(size: 'normal' | 'lg' | 'xl') {
    this.prefs.fontSize = size;
    this.saveAndApply();
  }

  toggle(prop: keyof Pick<A11yPrefs, 'reduceMotion' | 'textSpacing' | 'lineHeight' | 'dyslexia'>) {
    this.prefs[prop] = !this.prefs[prop];
    this.saveAndApply();
  }

  setSaturation(val: 'low' | 'high' | 'desaturate' | 'normal') {
    this.prefs.saturation = val;
    this.saveAndApply();
  }

  setContrast(val: 'invert' | 'dark') {
    this.prefs.contrast = this.prefs.contrast === val ? 'normal' : val;
    this.saveAndApply();
  }

  applyProfile(profile: string) {
    this.activeProfile = this.activeProfile === profile ? null : profile;
    this.prefs = { ...DEFAULT_PREFS };
    if (this.activeProfile) {
      Object.assign(this.prefs, this.profiles[this.activeProfile] || {});
    }
    this.saveAndApply();
    this.updateHostClass();
  }

  private updateHostClass() {
    const host = this.el.nativeElement as HTMLElement;
    host.classList.toggle('cb-active', this.activeProfile === 'colorblind');
  }

  reset() {
    this.prefs = { ...DEFAULT_PREFS };
    this.activeProfile = null;
    localStorage.removeItem(this.storageKey);
    this.applyClasses();
  }

  private saveAndApply() {
    localStorage.setItem(this.storageKey, JSON.stringify({ prefs: this.prefs, profile: this.activeProfile }));
    this.applyClasses();
  }

  private applyClasses() {
    const container = this.container;
    const host = this.el.nativeElement as HTMLElement;
    if (!container) return;

    const apply = (target: HTMLElement) => {
      target.classList.toggle('a11y-lg',         this.prefs.fontSize === 'lg');
      target.classList.toggle('a11y-xl',         this.prefs.fontSize === 'xl');
      target.classList.toggle('a11y-no-motion',  this.prefs.reduceMotion);
      target.classList.toggle('a11y-spacing',    this.prefs.textSpacing);
      target.classList.toggle('a11y-lh',         this.prefs.lineHeight);
      target.classList.toggle('a11y-dyslexia',   this.prefs.dyslexia);
      target.classList.toggle('a11y-sat-low',    this.prefs.saturation === 'low');
      target.classList.toggle('a11y-sat-high',   this.prefs.saturation === 'high');
      target.classList.toggle('a11y-sat-none',   this.prefs.saturation === 'desaturate');
      target.classList.toggle('a11y-con-invert', this.prefs.contrast === 'invert');
      target.classList.toggle('a11y-con-dark',   this.prefs.contrast === 'dark');
    };

    apply(container);
    apply(host);
  }
}
