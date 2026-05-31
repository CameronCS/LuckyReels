import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { HubService } from '../../services/hub.service';
import { AuthService } from '../../services/auth.service';

const ADVANCE = 0.27;
const PAYOUT_MULT = 4;

export interface Horse {
  name: string;
  color: string;
  position: number;
  pos: number;
  finishOrdinal: string;
  finishClass: string;
  isWinnerLane: boolean;
}

@Component({
  selector: 'app-horse',
  templateUrl: './horse.component.html',
  styleUrl: './horse.component.css',
  standalone: false
})
export class HorseComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('starsEl') starsEl!: ElementRef<HTMLDivElement>;

  userName: string;
  tokens = 0;
  tokensBump = false;
  bet = 10;
  selectedChip = 10;
  customChipValue = '';
  customChipVisible = false;
  selectedHorse = -1;
  racing = false;
  statusText = 'Pick a horse and place your bet';
  statusCls = 'status-bar';

  horses: Horse[] = [
    { name: 'Thunder Bolt', color: '#FFD700', position: 0, pos: 0, finishOrdinal: '', finishClass: 'lane-pos', isWinnerLane: false },
    { name: 'Lucky Strike', color: '#00FF87', position: 0, pos: 0, finishOrdinal: '', finishClass: 'lane-pos', isWinnerLane: false },
    { name: 'Iron Duke',    color: '#0AF5F5', position: 0, pos: 0, finishOrdinal: '', finishClass: 'lane-pos', isWinnerLane: false },
    { name: 'Wild Fire',    color: '#FF4455', position: 0, pos: 0, finishOrdinal: '', finishClass: 'lane-pos', isWinnerLane: false },
    { name: 'Night Shadow', color: '#bb88ff', position: 0, pos: 0, finishOrdinal: '', finishClass: 'lane-pos', isWinnerLane: false },
    { name: 'Silver Fox',   color: '#cccccc', position: 0, pos: 0, finishOrdinal: '', finishClass: 'lane-pos', isWinnerLane: false },
  ];

  chipBtns = [1, 10, 25, 50, 100];
  ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
  posClasses = ['lane-pos p1', 'lane-pos p2', 'lane-pos p3', 'lane-pos', 'lane-pos', 'lane-pos'];

  private raceSpeeds: number[] = [];
  private finishOrder: number[] = [];
  private winnerIdx = -1;
  private framesAfterWin = 0;
  private subs = new Subscription();

  constructor(
    private hub: HubService,
    private auth: AuthService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.userName = auth.getUserName();
  }

  ngOnInit(): void {
    this.subs.add(this.hub.balance$.subscribe(b => { this.tokens = b; }));

    this.subs.add(this.hub.horseResult$.subscribe(result => {
      this.ngZone.run(() => this.startRaceAnimation(result));
    }));

    this.subs.add(this.hub.hubError$.subscribe(msg => {
      this.ngZone.run(() => {
        this.racing = false;
        this.setStatus(msg, '');
      });
    }));
  }

  ngAfterViewInit(): void {
    const el = this.starsEl?.nativeElement;
    if (!el) return;
    for (let i = 0; i < 80; i++) {
      const s = document.createElement('div'); s.className = 'star';
      const sz = Math.random() * 2 + 1;
      s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${2+Math.random()*4}s;--o:${0.2+Math.random()*0.5};animation-delay:${Math.random()*4}s`;
      el.appendChild(s);
    }
  }

  horseColors(i: number): string { return this.horses[i].color; }

  selectHorse(idx: number): void {
    if (this.racing) return;
    this.selectedHorse = idx;
    if (!this.racing) this.setStatus('Ready to race â€” click RACE!');
  }

  isSelectedHorse(idx: number): boolean { return this.selectedHorse === idx; }

  setChip(val: number): void {
    this.selectedChip = val; this.bet = val; this.customChipVisible = false;
  }

  showCustomChip(): void { this.customChipVisible = true; }

  applyCustomChip(): void {
    const v = Math.max(1, parseInt(this.customChipValue) || 1);
    this.selectedChip = v; this.bet = v;
  }

  startRace(): void {
    if (this.racing) return;
    if (this.selectedHorse < 0) { this.setStatus('Pick a horse first!', ''); return; }
    if (this.tokens < this.bet) { this.setStatus('Not enough tokens!', ''); return; }
    this.racing = true;
    this.finishOrder = []; this.winnerIdx = -1; this.framesAfterWin = 0;
    this.horses.forEach(h => { h.position = 0; h.pos = 0; h.finishOrdinal = ''; h.finishClass = 'lane-pos'; h.isWinnerLane = false; });
    this.hub.raceHorse(this.horses[this.selectedHorse].name, this.bet).catch(() => { this.racing = false; });
    this.setStatus('Waiting for server...', 'countdown');
  }

  private startRaceAnimation(result: any): void {
    const winnerIndex = this.horses.findIndex(h => h.name === result.winnerName);
    const packBase = 0.88 + Math.random() * 0.12;
    this.raceSpeeds = this.horses.map(() => packBase + (Math.random() - 0.5) * 0.30);
    const maxSpeed = Math.max(...this.raceSpeeds);
    this.raceSpeeds[winnerIndex] = maxSpeed + 0.15;
    for (let i = 0; i < this.horses.length; i++) {
      if (i !== winnerIndex) this.raceSpeeds[i] = Math.min(this.raceSpeeds[i], maxSpeed * 0.92);
    }

    const counts = ['3', '2', '1', 'ðŸ GO!'];
    let ci = 0;
    this.setStatus(counts[ci], 'countdown');
    const cid = setInterval(() => {
      ci++;
      if (ci < counts.length) { this.setStatus(counts[ci], 'countdown'); }
      else {
        clearInterval(cid);
        this.ngZone.runOutsideAngular(() => requestAnimationFrame(() =>
          this.raceFrame(winnerIndex, result.winnerName, result.net, result.newBalance)));
      }
    }, 620);
  }

  private raceFrame(targetWinner: number, winnerName: string, net: number, newTokens: number): void {
    for (let i = 0; i < this.horses.length; i++) {
      if (this.horses[i].position >= 100) continue;
      const noise = (Math.random() - 0.5) * 0.09;
      this.horses[i].position = Math.min(100, this.horses[i].position + ADVANCE * this.raceSpeeds[i] + noise);
      if (this.horses[i].position >= 100 && !this.finishOrder.includes(i)) {
        this.finishOrder.push(i);
        if (this.winnerIdx < 0) this.winnerIdx = i;
      }
    }

    this.ngZone.run(() => this.updateTrackPositions());

    if (this.winnerIdx >= 0) {
      this.framesAfterWin++;
      if (this.framesAfterWin >= 72) {
        Array.from({ length: this.horses.length }, (_, i) => i)
          .filter(i => !this.finishOrder.includes(i))
          .sort((a, b) => this.horses[b].position - this.horses[a].position)
          .forEach(i => this.finishOrder.push(i));
        this.ngZone.run(() => this.endRace(targetWinner, winnerName, net, newTokens));
        return;
      }
    }

    requestAnimationFrame(() => this.raceFrame(targetWinner, winnerName, net, newTokens));
  }

  private updateTrackPositions(): void {
    const ranked = Array.from({ length: this.horses.length }, (_, i) => i)
      .sort((a, b) => this.horses[b].position - this.horses[a].position);
    const rankOf: number[] = new Array(this.horses.length);
    ranked.forEach((hi, rank) => { rankOf[hi] = rank; });
    for (let i = 0; i < this.horses.length; i++) {
      this.horses[i].pos = 2 + Math.min(this.horses[i].position, 100) * 0.885;
      const rank = rankOf[i];
      this.horses[i].finishOrdinal = this.ordinals[rank];
      this.horses[i].finishClass = this.posClasses[rank];
    }
    if (this.winnerIdx < 0) {
      this.setStatus(`${this.horses[ranked[0]].name} leads!`, 'racing');
    }
  }

  private endRace(targetWinner: number, winnerName: string, net: number, newTokens: number): void {
    this.tokens = newTokens; this.hub.balance$.next(newTokens);
    if (net > 0) this.bumpTokens();
    const playerWon = targetWinner === this.selectedHorse;
    if (playerWon) {
      this.setStatus(`ðŸ† ${winnerName} wins!  +${net}`, 'win');
      this.horses[this.selectedHorse].isWinnerLane = true;
    } else {
      this.setStatus(`${winnerName} wins  Â·  âˆ’${Math.abs(net)}`, 'loss');
    }
    this.horses[targetWinner].isWinnerLane = true;

    setTimeout(() => {
      this.racing = false;
      this.setStatus(this.tokens > 0 ? 'Place your bet for the next race' : 'Out of tokens â€” ask the admin for more');
    }, 2200);
  }

  private setStatus(text: string, cls = ''): void {
    this.statusText = text;
    this.statusCls = 'status-bar' + (cls ? ' ' + cls : '');
  }

  private bumpTokens(): void {
    this.tokensBump = false;
    setTimeout(() => { this.tokensBump = true; setTimeout(() => this.tokensBump = false, 300); }, 0);
  }

  goBack(): void { this.router.navigate(['/lobby']); }
  ngOnDestroy(): void { this.subs.unsubscribe(); }
}
