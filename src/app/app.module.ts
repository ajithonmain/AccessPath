import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { AccessibilityPanelComponent } from './accessibility-panel/accessibility-panel.component';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    AccessibilityPanelComponent
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
