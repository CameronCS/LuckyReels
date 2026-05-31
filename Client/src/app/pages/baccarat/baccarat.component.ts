import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { HubService } from '../../services/hub.service';
import { AuthService } from '../../services/auth.service';
import { Card } from '../../models/game.models';

@Component({
  selector: 'app-baccarat',
  templateUrl: './baccarat.component.html',
  styleUrl: './baccarat.component.css',
  standalone: false
})
export class BaccaratComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('starsEl') starsEl!: ElementRef<HTMLDivElement>;

  userName: string;
  tokens = 0;
  tokensBump = false;
  bet = 1;
  activeBet = 1;
  customBet = '';
  betType: 'player' | 'tie' | 'banker' = 'player';
  dealing = false;

  playerCards: Card[] = [];
  bankerCards: Card[] = [];
  playerScore = 0;
  bankerScore = 0;
  playerNatural = false;
  bankerNatural = false;
  resultText = '';
  resultCls = 'result-bar';

  presetBets = [1, 5, 10, 25, 50, 100];
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

    this.subs.add(this.hub.baccaratResult$.subscribe(async result => {
      this.dealing = false;
      const { playerHand, bankerHand, outcome, net, newBalance } = result as any;

      // Deal in sequence: P1 B1 P2 B2 [P3] [B3]
      this.clearTable();
      const playerH: Card[] = playerHand;
      const bankerH: Card[] = bankerHand;
      const seq: { side: 'p'|'b', card: Card }[] = [
        { side: 'p', card: playerH[0] }, { side: 'b', card: bankerH[0] },
        { side: 'p', card: playerH[1] }, { side: 'b', card: bankerH[1] },
        ...(playerH[2] ? [{ side: 'p' as const, card: playerH[2] }] : []),
        ...(bankerH[2] ? [{ side: 'b' as const, card: bankerH[2] }] : []),
      ];

      for (const step of seq) {
        await this.sleep(320);
        if (step.side === 'p') this.playerCards = [...this.playerCards, step.card];
        else this.bankerCards = [...this.bankerCards, step.card];
      }

      this.playerScore = this.baccaratValue(playerH);
      this.bankerScore = this.baccaratValue(bankerH);
      this.playerNatural = playerH.length === 2 && this.playerScore >= 8;
      this.bankerNatural = bankerH.length === 2 && this.bankerScore >= 8;

      await this.sleep(200);
      const abs = Math.abs(net);
      if (net > 0) {
        const label = outcome === 'tie' ? `TIE! +${net}` : outcome === 'player' ? `PLAYER WINS  +${net}` : `BANKER WINS  +${net}`;
        const cls = outcome === 'player' ? 'player-win' : outcome === 'banker' ? 'banker-win' : 'tie-result';
        this.showResult(label, cls);
      } else if (net === 0) {
        this.showResult('PUSH â€” BET RETURNED', 'push');
      } else {
        const label = outcome === 'player' ? `Player Wins  âˆ’${abs}` : outcome === 'banker' ? `Banker Wins  âˆ’${abs}` : `Tie  âˆ’${abs}`;
        this.showResult(label, outcome === 'player' ? 'player-win' : outcome === 'banker' ? 'banker-win' : 'tie-result');
      }

      this.tokens = newBalance; this.hub.balance$.next(newBalance); this.bumpTokens();
      setTimeout(() => this.resetIdle(), 2000);
    }));

    this.subs.add(this.hub.hubError$.subscribe(msg => {
      this.dealing = false;
      this.showResult(msg, '');
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

  private baccaratValue(hand: Card[]): number {
    return hand.reduce((s, c) => {
      const v = ['J','Q','K','10'].includes(c.rank) ? 0 : c.rank === 'A' ? 1 : parseInt(c.rank);
      return (s + v) % 10;
    }, 0);
  }

  setBetType(t: 'player' | 'tie' | 'banker'): void {
    if (this.dealing) return;
    this.betType = t;
  }

  setBet(amount: number): void {
    if (this.dealing) return;
    this.bet = amount; this.activeBet = amount; this.customBet = '';
  }

  onCustomBet(): void {
    if (this.dealing) return;
    const v = parseInt(this.customBet);
    if (v && v > 0) { this.bet = v; this.activeBet = -1; }
  }

  deal(): void {
    if (this.dealing || this.tokens < this.bet) return;
    this.dealing = true;
    this.clearTable();
    this.hub.baccaratBet(this.betType, this.bet).catch(() => { this.dealing = false; });
  }

  private clearTable(): void {
    this.playerCards = []; this.bankerCards = [];
    this.playerScore = 0; this.bankerScore = 0;
    this.playerNatural = false; this.bankerNatural = false;
    this.resultText = ''; this.resultCls = 'result-bar';
  }

  private resetIdle(): void {
    // Just clear state, keep cards visible
    this.dealing = false;
  }

  private showResult(text: string, cls: string): void {
    this.resultText = text;
    this.resultCls = 'result-bar' + (cls ? ' ' + cls : '');
  }

  isRed(card: Card): boolean { return card.suit === 'â™¥' || card.suit === 'â™¦'; }

  get scoreCls(): string { return this.playerNatural ? 'side-score natural' : 'side-score'; }
  get bankerScoreCls(): string { return this.bankerNatural ? 'side-score natural' : 'side-score'; }

  private bumpTokens(): void {
    this.tokensBump = false;
    setTimeout(() => { this.tokensBump = true; setTimeout(() => this.tokensBump = false, 300); }, 0);
  }

  private sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

  goBack(): void { this.router.navigate(['/lobby']); }
  ngOnDestroy(): void { this.subs.unsubscribe(); }
}
