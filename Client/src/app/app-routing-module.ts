import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
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

const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'lobby',     component: LobbyComponent,     canActivate: [AuthGuard] },
  { path: 'slots',     component: SlotsComponent,     canActivate: [AuthGuard] },
  { path: 'blackjack', component: BlackjackComponent, canActivate: [AuthGuard] },
  { path: 'roulette',  component: RouletteComponent,  canActivate: [AuthGuard] },
  { path: 'horse',     component: HorseComponent,     canActivate: [AuthGuard] },
  { path: 'baccarat',  component: BaccaratComponent,  canActivate: [AuthGuard] },
  { path: 'mines',     component: MinesComponent,     canActivate: [AuthGuard] },
  { path: 'crash',     component: CrashComponent,     canActivate: [AuthGuard] },
  { path: 'plinko',    component: PlinkoComponent,    canActivate: [AuthGuard] },
  { path: '**', redirectTo: '/login' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
