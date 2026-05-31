import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { HubService } from '../../services/hub.service';
import { AuthService } from '../../services/auth.service';
import { Card } from '../../models/game.models';

type Phase = 'idle' | 'waiting' | 'player' | 'dealing';

@Component({
  selector: 'app-blackjack',
  templateUrl: './blackjack.component.html',
  styleUrl: './blackjack.component.css',
  standalone: false
})
export class BlackjackComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('starsEl') starsEl!: ElementRef<HTMLDivElement>;

  userName: string;
  tokens = 0;
  tokensBump = false;
  bet = 1;
  activeBet = 1;
  customBet = '';
  phase: Phase = 'idle';
  loading = false;

  playerHand: Card[] = [];
  dealerHand: Card[] = [];
  playerTotal = 0;
  dealerVisibleTotal = 0;
  dealerTotal = 0;
  currentBet = 1;

  resultText = '';
  resultCls = '';

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

    this.subs.add(this.hub.blackjackState$.subscribe(state => {
      this.tokens = state.balance;
      this.hub.balance$.next(state.balance);
      this.playerHand = state.playerHand;
      this.dealerHand = state.dealerVisible ? [state.dealerVisible, { rank: '?', suit: '' }] : [];
      this.playerTotal = state.playerTotal;
      this.dealerVisibleTotal = state.dealerVisibleTotal;
      this.currentBet = state.bet;
      this.loading = false;
      if (state.isGameOver) {
        this.dealerHand = state.dealerHand;
        this.dealerTotal = state.dealerTotal;
        this.bumpTokens();
        this.showResult(this.getResultText(state.result, state.net), this.getResultCls(state.result));
        setTimeout(() => { this.phase = 'idle'; this.clearResult(); }, 1800);
        this.phase = 'dealing';
      } else {
        this.clearResult();
        this.phase = 'player';
      }
    }));

    this.subs.add(this.hub.blackjackResult$.subscribe(async result => {
      this.phase = 'dealing';
      this.playerHand = result.playerHand;
      this.playerTotal = result.playerTotal;
      this.dealerTotal = result.dealerTotal;

      // Animate dealer cards
      this.dealerHand = result.dealerHand.slice(0, 2);
      for (let i = 2; i < result.dealerHand.length; i++) {
        await this.sleep(600);
        this.dealerHand = result.dealerHand.slice(0, i + 1);
      }
      this.dealerHand = result.dealerHand;

      this.tokens = result.newBalance;
      this.hub.balance$.next(result.newBalance);
      this.bumpTokens();
      this.showResult(this.getResultText(result.result, result.net), this.getResultCls(result.result));

      setTimeout(() => { this.phase = 'idle'; }, 1800);
    }));

    this.subs.add(this.hub.hubError$.subscribe(msg => {
      if (this.phase === 'waiting') { this.phase = 'idle'; }
      this.showResult(msg, 'loss');
      this.loading = false;
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
    if (this.phase !== 'idle') return;
    this.bet = amount; this.activeBet = amount; this.customBet = '';
  }

  onCustomBet(): void {
    if (this.phase !== 'idle') return;
    const v = parseInt(this.customBet);
    if (v && v > 0) { this.bet = v; this.activeBet = -1; }
  }

  deal(): void {
    if (this.phase !== 'idle' || this.tokens < this.bet) return;
    this.phase = 'waiting'; this.loading = true;
    this.playerHand = []; this.dealerHand = [];
    this.clearResult();
    this.hub.blackjackDeal(this.bet).catch(e => { this.phase = 'idle'; this.loading = false; });
  }

  hit(): void {
    if (this.phase !== 'player') return;
    this.phase = 'waiting';
    this.hub.blackjackHit().catch(() => { this.phase = 'player'; });
  }

  stand(): void {
    if (this.phase !== 'player') return;
    this.phase = 'waiting';
    this.hub.blackjackStand().catch(() => { this.phase = 'player'; });
  }

  double(): void {
    if (this.phase !== 'player') return;
    this.phase = 'waiting';
    this.hub.blackjackDouble().catch(() => { this.phase = 'player'; });
  }

  canDouble(): boolean {
    return this.tokens >= this.currentBet && this.playerHand.length === 2;
  }

  get playerTotalCls(): string {
    if (this.playerTotal > 21) return 'side-total bust';
    if (this.playerTotal === 21 && this.playerHand.length === 2) return 'side-total bj';
    return 'side-total';
  }

  get dealerTotalCls(): string {
    if (this.phase === 'dealing' || this.phase === 'idle') {
      if (this.dealerTotal > 21) return 'side-total bust';
      if (this.dealerTotal >= 17) return 'side-total good';
    }
    return 'side-total';
  }

  isRed(card: Card): boolean { return card.suit === '♥' || card.suit === '♦'; }
  isFaceDown(card: Card): boolean { return !card.suit || card.rank === '?'; }

  private showResult(text: string, cls: string): void {
    this.resultText = text; this.resultCls = cls;
  }

  private clearResult(): void { this.resultText = ''; this.resultCls = ''; }

  private getResultText(result: string, net: number): string {
    const abs = Math.abs(net);
    switch (result) {
      case 'blackjack':   return `🃏 BLACKJACK! +${net}`;
      case 'win':         return `You Win! +${net}`;
      case 'dealer_bust': return `Dealer Busts! +${net}`;
      case 'push':        return `Push — Bet Returned`;
      case 'bust':        return `Bust! −${abs}`;
      case 'loss':        return `Dealer Wins −${abs}`;
      default:            return result;
    }
  }

  private getResultCls(result: string): string {
    if (result === 'blackjack') return 'blackjack';
    if (['win', 'dealer_bust'].includes(result)) return 'win';
    if (result === 'push') return 'push';
    return 'loss';
  }

  private bumpTokens(): void {
    this.tokensBump = false;
    setTimeout(() => { this.tokensBump = true; setTimeout(() => this.tokensBump = false, 300); }, 0);
  }

  private sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

  goBack(): void { this.router.navigate(['/lobby']); }
  ngOnDestroy(): void { this.subs.unsubscribe(); }
}
