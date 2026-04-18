export type Bit = 0 | 1;

export interface BandBitstreamResult {
  binaryList: Bit[];
  priceList: number[];
  timeList: Date[];
  bpRangeList: number[];
}

export interface DecimalWindow {
  decimalValue: number;
  binarySequence: string;
  keyDecimalOne: number;
  keyDecimalZero: number;
  isStasis: boolean;
  stasisDirection: 0 | 1 | null;
  signalPrice: number;
  signalAt: Date;
}

export interface BitstreamInput {
  ticker: string;
  bandIndex: number;
  bpRange: number;
  spotlight: number;
  prices: number[];
  timestamps: Date[];
}

export interface StasisDetectionResult {
  isStasis: boolean;
  direction: 0 | 1 | null;
  stasisCount: number;
  entryPrice: number | null;
  peakPrice: number | null;
  troughPrice: number | null;
  breakoutCount: number;
  reversionCount: number;
  winProbability: number | null;
  stasisStartedAt: Date | null;
}
