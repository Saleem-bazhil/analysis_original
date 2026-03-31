import { create } from 'zustand';
import type { AppStep, ClassifiedRow, ProcessingResult } from '../lib/types';
import { DEFAULT_ENGINEERS } from '../lib/types';

interface AppState {
  // Navigation
  step: AppStep;
  setStep: (step: AppStep) => void;

  // Upload state
  flexData: Record<string, unknown>[] | null;
  yesterdayData: Record<string, unknown>[] | null;
  availableCities: string[];
  selectedCity: string;
  reportDate: string; // YYYY-MM-DD
  setFlexData: (data: Record<string, unknown>[], cities: string[]) => void;
  setYesterdayData: (data: Record<string, unknown>[]) => void;
  setSelectedCity: (city: string) => void;
  setReportDate: (date: string) => void;

  // Processing result
  result: ProcessingResult | null;
  setResult: (result: ProcessingResult) => void;

  // Editable rows (the working copy)
  rows: ClassifiedRow[];
  droppedRows: ClassifiedRow[];
  setRows: (rows: ClassifiedRow[]) => void;
  setDroppedRows: (rows: ClassifiedRow[]) => void;
  updateRow: (ticketNo: string, field: keyof ClassifiedRow, value: string | number) => void;

  // Active tab in review
  activeTab: 'all' | 'pending' | 'new' | 'dropped';
  setActiveTab: (tab: 'all' | 'pending' | 'new' | 'dropped') => void;

  // Engineer list (configurable)
  engineers: string[];
  setEngineers: (engineers: string[]) => void;

  // Reset
  reset: () => void;
}

const today = new Date().toISOString().split('T')[0];

export const useStore = create<AppState>((set) => ({
  step: 'upload',
  setStep: (step) => set({ step }),

  flexData: null,
  yesterdayData: null,
  availableCities: [],
  selectedCity: 'Chennai',
  reportDate: today,
  setFlexData: (data, cities) => set({
    flexData: data,
    availableCities: cities,
    selectedCity: cities.includes('Chennai') ? 'Chennai' : cities[0] ?? 'Chennai',
  }),
  setYesterdayData: (data) => set({ yesterdayData: data }),
  setSelectedCity: (city) => set({ selectedCity: city }),
  setReportDate: (date) => set({ reportDate: date }),

  result: null,
  setResult: (result) => set({ result }),

  rows: [],
  droppedRows: [],
  setRows: (rows) => set({ rows }),
  setDroppedRows: (rows) => set({ droppedRows: rows }),
  updateRow: (ticketNo, field, value) =>
    set((state) => ({
      rows: state.rows.map((r) =>
        r.ticketNo === ticketNo ? { ...r, [field]: value } : r
      ),
    })),

  activeTab: 'all',
  setActiveTab: (tab) => set({ activeTab: tab }),

  engineers: DEFAULT_ENGINEERS,
  setEngineers: (engineers) => set({ engineers }),

  reset: () =>
    set({
      step: 'upload',
      flexData: null,
      yesterdayData: null,
      availableCities: [],
      selectedCity: 'Chennai',
      reportDate: today,
      result: null,
      rows: [],
      droppedRows: [],
      activeTab: 'all',
    }),
}));
