import { Injectable, OnDestroy } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import {
  SlotResult, BlackjackState, BlackjackResult,
  RouletteResult, RouletteBet, HorseResult,
  BaccaratResult, MinesState, MinesResult,
  CrashUpdate, CrashResult, PlinkoResult
} from '../models/game.models';

@Injectable({ providedIn: 'root' })
export class HubService implements OnDestroy {
  private connection: HubConnection | null = null;

  balance$ = new BehaviorSubject<number>(0);

  slotResult$      = new Subject<SlotResult>();
  blackjackState$  = new Subject<BlackjackState>();
  blackjackResult$ = new Subject<BlackjackResult>();
  rouletteResult$  = new Subject<RouletteResult>();
  horseResult$     = new Subject<HorseResult>();
  baccaratResult$  = new Subject<BaccaratResult>();
  minesState$      = new Subject<MinesState>();
  minesResult$     = new Subject<MinesResult>();
  crashPhase$      = new Subject<string>();
  crashTick$       = new Subject<CrashUpdate>();
  crashResult$     = new Subject<CrashResult>();
  plinkoResult$    = new Subject<PlinkoResult>();
  hubError$        = new Subject<string>();

  constructor(private auth: AuthService) {}

  async connect(): Promise<void> {
    if (this.connection?.state === HubConnectionState.Connected) return;

    this.connection = new HubConnectionBuilder()
      .withUrl(environment.hubUrl, { accessTokenFactory: () => this.auth.getToken() ?? '' })
      .withAutomaticReconnect()
      .build();

    this.connection.on('TokensUpdated', (tokens: number) => this.balance$.next(tokens));
    this.connection.on('SlotResult',      d => this.slotResult$.next(d));
    this.connection.on('BlackjackState',  d => this.blackjackState$.next(d));
    this.connection.on('BlackjackResult', d => this.blackjackResult$.next(d));
    this.connection.on('RouletteResult',  d => this.rouletteResult$.next(d));
    this.connection.on('HorseResult',     d => this.horseResult$.next(d));
    this.connection.on('BaccaratResult',  d => this.baccaratResult$.next(d));
    this.connection.on('MinesState',      d => this.minesState$.next(d));
    this.connection.on('MinesResult',     d => this.minesResult$.next(d));
    this.connection.on('CrashPhase',      d => this.crashPhase$.next(d));
    this.connection.on('CrashTick',       d => this.crashTick$.next(d));
    this.connection.on('CrashResult',     d => this.crashResult$.next(d));
    this.connection.on('PlinkoResult',    d => this.plinkoResult$.next(d));
    this.connection.on('Error',           d => this.hubError$.next(d));

    await this.connection.start();
    await this.connection.invoke('CrashJoin');

    try {
      const tokens = await this.connection.invoke<number>('GetTokens');
      this.balance$.next(tokens);
    } catch {
      // Backend may not yet have GetTokens — balance arrives via TokensUpdated from OnConnectedAsync
    }
  }

  async disconnect(): Promise<void> {
    await this.connection?.stop();
    this.connection = null;
  }

  get isConnected(): boolean {
    return this.connection?.state === HubConnectionState.Connected;
  }

  spinSlots(machineNum: number, bet: number)           { return this.invoke('SpinSlots', machineNum, bet); }
  blackjackDeal(bet: number)                           { return this.invoke('BlackjackDeal', bet); }
  blackjackHit()                                       { return this.invoke('BlackjackHit'); }
  blackjackStand()                                     { return this.invoke('BlackjackStand'); }
  blackjackDouble()                                    { return this.invoke('BlackjackDouble'); }
  spinRoulette(bets: RouletteBet[])                    { return this.invoke('SpinRoulette', bets); }
  raceHorse(pickedHorse: string, bet: number)          { return this.invoke('RaceHorse', pickedHorse, bet); }
  baccaratBet(betType: string, bet: number)            { return this.invoke('BaccaratBet', betType, bet); }
  minesStart(mineCount: number, bet: number)           { return this.invoke('MinesStart', mineCount, bet); }
  minesReveal(cellIndex: number)                       { return this.invoke('MinesReveal', cellIndex); }
  minesCashout()                                       { return this.invoke('MinesCashout'); }
  crashBet(bet: number, autoCashout?: number | null)   {
    return autoCashout && autoCashout > 1
      ? this.invoke('CrashBet', bet, autoCashout)
      : this.invoke('CrashBet', bet);
  }
  crashCashout()                                       { return this.invoke('CrashCashout'); }
  crashLeave()                                         { return this.invoke('CrashLeave'); }
  dropPlinko(bet: number, riskLevel: string)           { return this.invoke('DropPlinko', bet, riskLevel); }

  private async invoke(method: string, ...args: any[]): Promise<void> {
    if (!this.connection) {
      await this.connect();
    }
    if (this.connection!.state !== HubConnectionState.Connected) {
      await this.connection!.start();
    }
    return this.connection!.invoke(method, ...args);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
