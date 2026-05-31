import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { LobbyComponent } from './pages/lobby/lobby.component';
import { SlotsComponent } from './pages/slots/slots.component';
import { BlackjackComponent } from './pages/blackjack/blackjack.component';
import { RouletteComponent } from './pages/roulette/roulette.component';
import { HorseComponent } from './pages/horse/horse.component';
import { BaccaratComponent } from './pages/baccarat/baccarat.component';
import { MinesComponent } from './pages/mines/mines.component';
import { CrashComponent } from './pages/crash/crash.component';
import { PlinkoComponent } from './pages/plinko/plinko.component';

@NgModule({
  declarations: [
    App,
    LoginComponent,
    RegisterComponent,
    LobbyComponent,
    SlotsComponent,
    BlackjackComponent,
    RouletteComponent,
    HorseComponent,
    BaccaratComponent,
    MinesComponent,
    CrashComponent,
    PlinkoComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    ReactiveFormsModule,
    FormsModule,
  ],
  bootstrap: [App]
})
export class AppModule { }
