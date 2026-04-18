export type InstrumentType = 'equity' | 'etf' | 'forex' | 'futures';

export interface Symbol {
  id: string;
  ticker: string;
  instrument_type: InstrumentType;
  is_active: boolean;
  is_tradable: boolean;
  created_at: string;
}
