import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { HubService } from '../../services/hub.service';
import { AuthService } from '../../services/auth.service';

type GameState = 'idle' | 'playing' | 'ended';

interface Cell {
  state: 'hidden' | 'safe' | 'mine' | 'mine-clicked';
}

@Component({
  selector: 'app-mines',
  templateUrl: './mines.component.html',
  styleUrl: './mines.component.css',
  standalone: false
})
export class MinesComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('starsEl') starsEl!: ElementRef<HTMLDivElement>;

  userName: string;
  tokens = 0;
  tokensBump = false;
  bet = 10;
  activeBet = 10;
  customBet = '';
  mineCount = 3;
  gameState: GameState = 'idle';
  cells: Cell[] = Array.from({ length: 25 }, () => ({ state: 'hidden' }));
  multiplier = '1.00';
  cashoutValue = 'â€”';
  minesCountDisplay = 'â€”';
  bannerText = '';
  bannerCls = 'result-banner';
  cashoutBtnText = 'Reveal a cell first';
  revealedCount = 0;
  currentCashout = 0;

  presetBets = [10, 25, 50, 100, 250, 500];
  minePresets = [1, 3, 5, 10, 15, 20];
  private subs = new Subscription();

  constructor(
    private hub: HubService,
    private auth: AuthService,
    private router: Router
  ) {
    this.userName = auth.getUserName();
  }

  ngOnInit(): void {
    this.subs.add(this.hub.balance$.subscribe(b => { this.tokens = b; }));

    this.subs.add(this.hub.minesState$.subscribe(state => {
      this.tokens = state.balance;
      this.hub.balance$.next(state.balance);

      if (this.gameState === 'idle') {
        // Game just started - mineCount comes from local state (set before hub call)
        this.startPlaying((state as any).mineCount ?? this.mineCount, state.bet);
      } else if (!state.isGameOver) {
        // Safe cell revealed - find new reveals
        const prevRevealed = this.cells.filter(c => c.state === 'safe').length;
        state.revealed.forEach(idx => {
          if (this.cells[idx].state === 'hidden') this.cells[idx] = { state: 'safe' };
        });
        this.revealedCount = state.revealed.length;
        this.multiplier = state.multiplier.toFixed(2);
        this.currentCashout = Math.floor(state.multiplier * state.bet);
        this.cashoutValue = this.currentCashout + ' ðŸª™';
        this.cashoutBtnText = this.revealedCount > 0 ? `CASH OUT Â· ${this.currentCashout}` : 'Reveal a cell first';
      } else if (state.isGameOver && state.hitMine) {
        // Hit a mine
        const clickedIdx = state.revealed[state.revealed.length - 1];
        this.cells[clickedIdx] = { state: 'mine-clicked' };
        state.grid.forEach((isMine, idx) => {
          if (isMine && idx !== clickedIdx && this.cells[idx].state === 'hidden') {
            this.cells[idx] = { state: 'mine' };
          }
        });
        this.gameState = 'ended';
        this.bumpTokens();
        this.showBanner(`ðŸ’¥ BOOM!  ${state.net}`, 'result-banner banner-lose');
      }
    }));

    this.subs.add(this.hub.minesResult$.subscribe(result => {
      // Cashout
      result.grid.forEach((isMine, idx) => {
        if (isMine && this.cells[idx].state === 'hidden') this.cells[idx] = { state: 'mine' };
      });
      this.tokens = result.newBalance;
      this.hub.balance$.next(result.newBalance);
      this.gameState = 'ended';
      this.bumpTokens();
      const sign = result.net >= 0 ? '+' : '';
      this.showBanner(`ðŸ’Ž ${this.multiplier}Ã—  ${sign}${result.net}`, 'result-banner banner-win');
    }));

    this.subs.add(this.hub.hubError$.subscribe(msg => {
      this.gameState = 'idle';
      this.showBanner(msg, 'result-banner banner-lose');
      setTimeout(() => this.hideBanner(), 2500);
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

  setBet(amount: number): void {
    if (this.gameState !== 'idle') return;
    this.bet = amount; this.activeBet = amount; this.customBet = '';
  }

  onCustomBet(): void {
    if (this.gameState !== 'idle') return;
    const v = parseInt(this.customBet);
    if (v && v > 0) { this.bet = v; this.activeBet = -1; }
  }

  setMineCount(n: number): void {
    if (this.gameState !== 'idle') return;
    this.mineCount = n;
  }

  startGame(): void {
    if (this.gameState !== 'idle' || this.tokens < this.bet) return;
    this.hub.minesStart(this.mineCount, this.bet).catch(() => {});
  }

  clickCell(idx: number): void {
    if (this.gameState !== 'playing') return;
    if (this.cells[idx].state !== 'hidden') return;
    this.hub.minesReveal(idx).catch(() => {});
  }

  cashout(): void {
    if (this.gameState !== 'playing' || this.revealedCount === 0) return;
    this.hub.minesCashout().catch(() => {});
  }

  playAgain(): void {
    this.hideBanner();
    this.resetGrid();
    this.gameState = 'idle';
  }

  private startPlaying(mc: number, b: number): void {
    this.gameState = 'playing';
    this.mineCount = mc; this.bet = b;
    this.revealedCount = 0;
    this.resetGrid();
    this.multiplier = '1.00';
    this.cashoutValue = b + ' ðŸª™';
    this.minesCountDisplay = mc + ' ðŸ’£';
    this.cashoutBtnText = 'Reveal a cell first';
    this.bannerText = ''; this.bannerCls = 'result-banner';
  }

  private resetGrid(): void {
    this.cells = Array.from({ length: 25 }, () => ({ state: 'hidden' }));
  }

  get isPlaying(): boolean { return this.gameState === 'playing'; }
  get isIdle(): boolean { return this.gameState === 'idle'; }
  get isEnded(): boolean { return this.gameState === 'ended'; }

  getCellCls(cell: Cell): string {
    if (cell.state === 'safe') return 'mine-cell safe';
    if (cell.state === 'mine') return 'mine-cell mine';
    if (cell.state === 'mine-clicked') return 'mine-cell mine clicked';
    return 'mine-cell';
  }

  getCellEmoji(cell: Cell): string {
    if (cell.state === 'safe') return 'ðŸ’Ž';
    if (cell.state === 'mine' || cell.state === 'mine-clicked') return 'ðŸ’£';
    return '';
  }

  private showBanner(text: string, cls: string): void {
    this.bannerText = text; this.bannerCls = cls;
  }

  private hideBanner(): void {
    this.bannerText = ''; this.bannerCls = 'result-banner';
  }

  private bumpTokens(): void {
    this.tokensBump = false;
    setTimeout(() => { this.tokensBump = true; setTimeout(() => this.tokensBump = false, 300); }, 0);
  }

  goBack(): void { this.router.navigate(['/lobby']); }
  ngOnDestroy(): void { this.subs.unsubscribe(); }
}
