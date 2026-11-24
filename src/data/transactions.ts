// Firestore persistence (offline-first). Falls back to memory when there is no signed-in user.
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';

export const CATEGORIES = [
  'groceries',
  'dining',
  'transport',
  'bills',
  'shopping',
  'health',
  'entertainment',
  'income',
  'transfer',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];
export type Sensitivity = 'low' | 'medium' | 'high';

export interface Tx {
  id: string;
  ts: number;
  merchant: string;
  concept: string;
  /** Negative = spending, positive = income. */
  amount: number;
  currency: string;
  category: Category;
  sensitivity: Sensitivity;
  /** Where the classification was produced. */
  classifiedBy: 'ON_DEVICE' | 'IN_CLOUD' | 'seed';
}

export type NewTx = Omit<Tx, 'id'>;

export interface TxSnapshot {
  txs: Tx[];
  fromCache: boolean;
  pendingWrites: boolean;
}

// In-memory fallback (no uid).
let memory: Tx[] = [];
let memoryListener: ((s: TxSnapshot) => void) | null = null;

export function watchTransactions(uid: string | null, cb: (s: TxSnapshot) => void): Unsubscribe {
  if (!uid) {
    memoryListener = cb;
    cb({ txs: memory, fromCache: true, pendingWrites: false });
    return () => {
      memoryListener = null;
    };
  }
  const q = query(collection(db, 'users', uid, 'transactions'), orderBy('ts', 'desc'), limit(300));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) =>
      cb({
        txs: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Tx, 'id'>) })),
        fromCache: snap.metadata.fromCache,
        pendingWrites: snap.metadata.hasPendingWrites,
      }),
    (err) => console.error('[Firestore] listener error', err),
  );
}

/** Fire-and-forget: with offline persistence the write is queued locally and synced later. */
export function addTransaction(uid: string | null, tx: NewTx): void {
  if (!uid) {
    memory = [{ id: crypto.randomUUID(), ...tx }, ...memory];
    memoryListener?.({ txs: memory, fromCache: true, pendingWrites: false });
    return;
  }
  addDoc(collection(db, 'users', uid, 'transactions'), tx).catch((e) =>
    console.error('[Firestore] write failed', e),
  );
}

export function seedDemoData(uid: string | null): number {
  const day = 86_400_000;
  const now = Date.now();
  const rows: Array<[number, string, string, number, Category, Sensitivity]> = [
    [1, 'Northwind Payroll', 'Monthly salary', 3200, 'income', 'medium'],
    [2, 'Green Basket', 'Weekly groceries', -84.3, 'groceries', 'low'],
    [3, 'MetroCard', 'Transit top-up', -40, 'transport', 'low'],
    [4, 'Lumen Energy', 'Electricity bill', -96.5, 'bills', 'low'],
    [6, 'Casa Luna', 'Dinner with friends', -52.8, 'dining', 'low'],
    [8, 'Green Basket', 'Groceries', -77.1, 'groceries', 'low'],
    [9, 'StreamBox', 'Subscription', -15.99, 'entertainment', 'low'],
    [11, 'Clinica Vida', 'Dental check-up', -120, 'health', 'high'],
    [13, 'Pixel Mart', 'Headphones', -89, 'shopping', 'low'],
    [15, 'Casa Luna', 'Lunch', -18.4, 'dining', 'low'],
    [17, 'FiberNet', 'Internet bill', -45, 'bills', 'low'],
    [19, 'Green Basket', 'Groceries', -91.2, 'groceries', 'low'],
    [22, 'MetroCard', 'Transit top-up', -40, 'transport', 'low'],
    [24, 'Farmacia Central', 'Prescription', -34.6, 'health', 'high'],
    [27, 'Casa Luna', 'Dinner', -61.3, 'dining', 'low'],
    [30, 'Northwind Payroll', 'Monthly salary', 3200, 'income', 'medium'],
    [32, 'Green Basket', 'Groceries', -80.9, 'groceries', 'low'],
    [35, 'Lumen Energy', 'Electricity bill', -101.2, 'bills', 'low'],
    [38, 'Nova Electronics', 'Laptop purchase', -1850, 'shopping', 'low'],
    [41, 'StreamBox', 'Subscription', -15.99, 'entertainment', 'low'],
    [44, 'MetroCard', 'Transit top-up', -40, 'transport', 'low'],
    [47, 'Casa Luna', 'Lunch', -22.1, 'dining', 'low'],
    [52, 'Green Basket', 'Groceries', -88.4, 'groceries', 'low'],
    [58, 'FiberNet', 'Internet bill', -45, 'bills', 'low'],
  ];
  rows.forEach(([ago, merchant, concept, amount, category, sensitivity]) =>
    addTransaction(uid, {
      ts: now - ago * day,
      merchant,
      concept,
      amount,
      currency: 'USD',
      category,
      sensitivity,
      classifiedBy: 'seed',
    }),
  );
  return rows.length;
}
