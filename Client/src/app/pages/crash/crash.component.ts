import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { HubService } from '../../services/hub.service';
import { AuthService } from '../../services/auth.service';

type GameState = 'idle' | 'waiting' | 'playing' | 'ended';

@Component({
  selector: 'app-crash',
  templateUrl: './crash.component.html',
  styleUrl: './crash.component.css',
  standalone: false
})
export class CrashComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('starsEl') starsEl!: ElementRef<HTMLDivElement>;
  @ViewChild('crashCanvas') crashCanvasRef!: ElementRef<HTMLCanvasElement>;

  userName: string;
  tokens = 0;
  tokensBump = false;
  bet = 50;
  activeBet = 50;
  customBet = '';
  autoCashoutValue = '';
  gameState: GameState = 'idle';
  currentMult = 1.0;
  multText = 'â€”';
  multCls = 'mult-value idle';
  multSub = '';
  resultText = '';
  resultCls = '';
  cashoutBtnText = 'CASH OUT';
  tickHistory: number[] = [];
  private currentBet = 50;

  presetBets = [10, 25, 50, 100, 250, 500];
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
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

    this.subs.add(this.hub.crashTick$.subscribe(tick => {
      this.ngZone.run(() => {
        this.currentMult = tick.multiplier;
        this.tickHistory.push(tick.multiplier);
        if (this.gameState === 'waiting') this.gameState = 'playing';
        if (tick.crashed) {
          this.multText = tick.multiplier.toFixed(2) + 'Ã—';
          this.multCls = 'mult-value crashed';
          this.multSub = 'CRASHED';
          this.drawCurve(true, tick.multiplier);
          if (this.gameState === 'playing') {
            this.gameState = 'ended';
          }
        } else {
          this.multText = tick.multiplier.toFixed(2) + 'Ã—';
          this.multCls = this.getMultCls(tick.multiplier);
          this.cashoutBtnText = 'CASH OUT Â· ' + Math.floor(this.currentBet * tick.multiplier);
          this.drawCurve(false, null);
        }
      });
    }));

    this.subs.add(this.hub.crashResult$.subscribe(result => {
      this.ngZone.run(() => {
        this.tokens = result.newBalance;
        this.hub.balance$.next(result.newBalance);
        this.bumpTokens();
        const sign = result.net >= 0 ? '+' : '';
        if (result.cashedOutAt > 0) {
          this.resultText = `CASHED OUT  ${result.cashedOutAt.toFixed(2)}Ã—  ${sign}${result.net}`;
          this.resultCls = 'crash-result result-win';
        } else {
          this.resultText = `CRASHED  ${result.crashedAt.toFixed(2)}Ã—  ${result.net}`;
          this.resultCls = 'crash-result result-lose';
        }
        this.gameState = 'ended';
        this.multSub = result.cashedOutAt > 0 ? 'CASHED OUT' : 'CRASHED';
      });
    }));

    this.subs.add(this.hub.crashPhase$.subscribe(phase => {
      this.ngZone.run(() => {
        if (phase === 'waiting' || phase === 'Waiting') {
          if (this.gameState === 'playing' || this.gameState === 'ended') {
            this.resetForNewRound();
          }
        }
      });
    }));

    this.subs.add(this.hub.hubError$.subscribe(msg => {
      this.ngZone.run(() => {
        this.gameState = 'idle';
        this.multText = 'â€”'; this.multCls = 'mult-value idle';
        this.multSub = msg;
      });
    }));
  }

  ngAfterViewInit(): void {
    const el = this.starsEl?.nativeElement;
    if (el) {
      for (let i = 0; i < 80; i++) {
        const s = document.createElement('div'); s.className = 'star';
        const sz = Math.random() * 2 + 1;
        s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${2+Math.random()*4}s;--o:${0.2+Math.random()*0.5};animation-delay:${Math.random()*4}s`;
        el.appendChild(s);
      }
    }
    this.canvas = this.crashCanvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.resizeCanvas();
    this.drawCurve(false, null);
    window.addEventListener('resize', () => this.ngZone.run(() => {
      this.resizeCanvas();
      this.drawCurve(this.gameState === 'ended' && this.multText.includes('Ã—'), null);
    }));
  }

  private resetForNewRound(): void {
    this.gameState = 'idle';
    this.tickHistory = [];
    this.resultText = ''; this.resultCls = '';
    this.multText = 'â€”'; this.multCls = 'mult-value idle'; this.multSub = '';
    this.drawCurve(false, null);
  }

  setBet(amount: number): void {
    if (this.gameState !== 'idle') return;
    this.bet = amount; this.activeBet = amount; this.customBet = '';
  }

  onCustomBet(): void {
    if (this.gameState !== 'idle') return;
    const v = parseInt(this.customBet);
    if (v && v >= 10) { this.bet = v; this.activeBet = -1; }
  }

  launch(): void {
    if (this.gameState !== 'idle' || this.tokens < this.bet) return;
    this.currentBet = this.bet;
    this.tickHistory = [];
    this.resultText = ''; this.resultCls = '';
    this.gameState = 'waiting';
    this.multText = '1.00Ã—'; this.multCls = 'mult-value safe';
    const acVal = parseFloat(this.autoCashoutValue);
    const ac = (!isNaN(acVal) && acVal > 1.00) ? acVal : null;
    this.multSub = ac ? 'AUTO: ' + ac.toFixed(2) + 'Ã—' : '';
    this.hub.crashBet(this.bet, ac).catch(() => { this.gameState = 'idle'; });
  }

  cashout(): void {
    if (this.gameState !== 'playing') return;
    this.hub.crashCashout().catch(() => {});
  }

  playAgain(): void { this.resetForNewRound(); }

  get isIdle(): boolean { return this.gameState === 'idle'; }
  get isWaiting(): boolean { return this.gameState === 'waiting'; }
  get isPlaying(): boolean { return this.gameState === 'playing'; }
  get isEnded(): boolean { return this.gameState === 'ended'; }
  get canLaunch(): boolean { return this.tokens >= this.bet; }

  private getMultCls(m: number): string {
    return m >= 5 ? 'mult-value danger' : m >= 2 ? 'mult-value warning' : 'mult-value safe';
  }

  private resizeCanvas(): void {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  private drawCurve(crashed: boolean, endMult: number | null): void {
    const W = this.canvas.width || this.canvas.offsetWidth;
    const H = this.canvas.height || this.canvas.offsetHeight;
    if (!W || !H) return;
    this.ctx.clearRect(0, 0, W, H);

    const hist = this.tickHistory;
    if (hist.length === 0) return;

    const mult = crashed ? (endMult || hist[hist.length - 1]) : (endMult !== null ? endMult : hist[hist.length - 1]);
    const maxMult = Math.max(mult * 1.25, 3.0);
    const ty = (m: number) => H - 18 - Math.max(0, ((m - 1) / (maxMult - 1)) * (H - 36));
    const tx = (i: number) => (i / (hist.length - 1 || 1)) * W * 0.92 + W * 0.02;

    // Grid lines
    this.ctx.lineWidth = 1; this.ctx.font = '9px Space Mono, monospace';
    for (const gm of [2, 3, 5, 10, 20, 50, 100]) {
      if (gm > maxMult * 1.05) break;
      const y = ty(gm);
      this.ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(W, y); this.ctx.stroke();
      this.ctx.fillStyle = 'rgba(255,255,255,0.18)'; this.ctx.fillText(gm + 'Ã—', 4, y - 3);
    }

    const color = crashed ? '#FF4500' : mult >= 5 ? '#FF4500' : mult >= 2 ? '#FF9500' : '#00D4FF';
    this.ctx.beginPath(); this.ctx.strokeStyle = color; this.ctx.lineWidth = 2.5;
    this.ctx.shadowColor = color; this.ctx.shadowBlur = 10;
    this.ctx.moveTo(tx(0), ty(1.00));
    for (let i = 1; i < hist.length; i++) this.ctx.lineTo(tx(i), ty(hist[i]));
    this.ctx.stroke(); this.ctx.shadowBlur = 0;

    // Tip dot
    const tipX = tx(hist.length - 1), tipY = ty(mult);
    this.ctx.beginPath(); this.ctx.fillStyle = color;
    this.ctx.shadowColor = color; this.ctx.shadowBlur = 18;
    this.ctx.arc(tipX, tipY, 5, 0, Math.PI * 2); this.ctx.fill(); this.ctx.shadowBlur = 0;
  }

  private bumpTokens(): void {
    this.tokensBump = false;
    setTimeout(() => { this.tokensBump = true; setTimeout(() => this.tokensBump = false, 300); }, 0);
  }

  goBack(): void { this.router.navigate(['/lobby']); }
  ngOnDestroy(): void { this.subs.unsubscribe(); }
}
