export type Direction = 'LONG' | 'SHORT';
export type SignalStrength = 'VERY_STRONG' | 'STRONG' | 'MODERATE' | 'WEAK';

interface BitEntry {
  bit: 0 | 1;
  price: number;
  timestamp: Date;
}

interface StasisInfo {
  startTime: Date;
  startPrice: number;
  peakStasis: number;
}

export interface BitstreamSnapshot {
  symbol: string;
  threshold: number;
  thresholdPct: number;
  stasis: number;
  totalBits: number;
  currentPrice: number;
  anchorPrice: number | null;
  direction: Direction | null;
  signalStrength: SignalStrength | null;
  isTradable: boolean;
  stasisStartStr: string;
  durationSeconds: number;
  stasisPriceChangePct: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  riskReward: number | null;
  distanceToTpPct: number | null;
  distanceToSlPct: number | null;
  volume: number;
}

/**
 * Port of the Python Bitstream class from app.py.
 *
 * Stasis = alternating bits at the tail of the deque (0,1,0,1...).
 * Direction: LONG when last bit is 0, SHORT when last bit is 1.
 */
export class Bitstream {
  symbol: string;
  threshold: number;
  volume: number;

  private referencePrice: number;
  private bandWidth!: number;
  private upperBand!: number;
  private lowerBand!: number;
  private bits: BitEntry[] = [];
  private readonly MAX_BITS = 500;

  currentStasis = 0;
  lastBit: 0 | 1 | null = null;
  direction: Direction | null = null;
  signalStrength: SignalStrength | null = null;
  stasisInfo: StasisInfo | null = null;
  currentLivePrice: number;
  totalBits = 0;

  constructor(symbol: string, threshold: number, initialPrice: number, volume: number) {
    this.symbol        = symbol;
    this.threshold     = threshold;
    this.volume        = volume;
    this.referencePrice = initialPrice;
    this.currentLivePrice = initialPrice;
    this.updateBands();
  }

  private updateBands(): void {
    this.bandWidth  = this.threshold * this.referencePrice;
    this.upperBand  = this.referencePrice + this.bandWidth;
    this.lowerBand  = this.referencePrice - this.bandWidth;
  }

  processPrice(price: number, timestamp: Date): void {
    this.currentLivePrice = price;

    if (price > this.lowerBand && price < this.upperBand) return;
    if (this.bandWidth <= 0) return;

    const x = Math.trunc((price - this.referencePrice) / this.bandWidth);
    if (x > 0) {
      for (let i = 0; i < x; i++) {
        this.bits.push({ bit: 1, price, timestamp });
        this.totalBits++;
      }
    } else if (x < 0) {
      for (let i = 0; i < Math.abs(x); i++) {
        this.bits.push({ bit: 0, price, timestamp });
        this.totalBits++;
      }
    }

    // Enforce maxlen
    if (this.bits.length > this.MAX_BITS) {
      this.bits = this.bits.slice(this.bits.length - this.MAX_BITS);
    }

    this.referencePrice = price;
    this.updateBands();
    this.updateStasis(timestamp);
  }

  private updateStasis(ts: Date): void {
    const bl = this.bits;
    if (bl.length < 2) {
      this.currentStasis = bl.length;
      this.lastBit       = bl.length > 0 ? bl[bl.length - 1].bit : null;
      this.direction     = null;
      this.signalStrength = null;
      return;
    }

    // Count consecutive alternating bits from the tail
    let sc = 1;
    let si = bl.length - 1;
    for (let i = bl.length - 1; i > 0; i--) {
      if (bl[i].bit !== bl[i - 1].bit) {
        sc++;
        si = i - 1;
      } else {
        break;
      }
    }

    const prev    = this.currentStasis;
    this.currentStasis = sc;
    this.lastBit  = bl[bl.length - 1].bit;

    // Track stasis info (entry point)
    if (prev < 2 && sc >= 2 && si >= 0 && si < bl.length) {
      this.stasisInfo = {
        startTime:   bl[si].timestamp,
        startPrice:  bl[si].price,
        peakStasis:  sc,
      };
    } else if (sc >= 2 && this.stasisInfo && sc > this.stasisInfo.peakStasis) {
      this.stasisInfo.peakStasis = sc;
    } else if (prev >= 2 && sc < 2) {
      this.stasisInfo = null;
    }

    if (sc >= 2) {
      this.direction = this.lastBit === 0 ? 'LONG' : 'SHORT';
      if (sc >= 10)      this.signalStrength = 'VERY_STRONG';
      else if (sc >= 7)  this.signalStrength = 'STRONG';
      else if (sc >= 5)  this.signalStrength = 'MODERATE';
      else if (sc >= 3)  this.signalStrength = 'WEAK';
      else               this.signalStrength = null;
    } else {
      this.direction      = null;
      this.signalStrength = null;
    }
  }

  getSnapshot(livePrice?: number): BitstreamSnapshot {
    const p  = livePrice ?? this.currentLivePrice;
    const si = this.stasisInfo;

    let tp: number | null = null;
    let sl: number | null = null;
    let rr: number | null = null;
    let distTpPct: number | null = null;
    let distSlPct: number | null = null;
    let stasisPriceChangePct: number | null = null;

    if (si) {
      stasisPriceChangePct = si.startPrice > 0
        ? ((p - si.startPrice) / si.startPrice) * 100
        : null;
    }

    if (this.direction && this.currentStasis >= 2) {
      if (this.direction === 'LONG') {
        tp = this.upperBand; sl = this.lowerBand;
      } else {
        tp = this.lowerBand; sl = this.upperBand;
      }
      const reward = this.direction === 'LONG' ? tp - p : p - tp;
      const risk   = this.direction === 'LONG' ? p - sl : sl - p;
      if (risk > 0 && reward > 0) rr = reward / risk;
      else if (risk > 0)          rr = 0;
      if (p > 0) {
        distTpPct = (Math.abs(tp - p) / p) * 100;
        distSlPct = (Math.abs(sl - p) / p) * 100;
      }
    }

    const durationSeconds = si
      ? (Date.now() - si.startTime.getTime()) / 1000
      : 0;

    return {
      symbol:               this.symbol,
      threshold:            this.threshold,
      thresholdPct:         this.threshold * 100,
      stasis:               this.currentStasis,
      totalBits:            this.totalBits,
      currentPrice:         p,
      anchorPrice:          si?.startPrice ?? null,
      direction:            this.direction,
      signalStrength:       this.signalStrength,
      isTradable:           this.currentStasis >= 3 && this.direction !== null && this.volume > 1.0,
      stasisStartStr:       si ? si.startTime.toISOString() : '—',
      durationSeconds,
      stasisPriceChangePct,
      takeProfit:           tp,
      stopLoss:             sl,
      riskReward:           rr,
      distanceToTpPct:      distTpPct,
      distanceToSlPct:      distSlPct,
      volume:               this.volume,
    };
  }
}
