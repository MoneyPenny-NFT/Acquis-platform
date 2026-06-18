import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type PaymentMode = 'token' | 'hbar' | 'bank' | 'xrp';

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  emoji: string;
}

export interface CartItem extends CatalogItem {
  quantity: number;
}

export interface MerchantConfig {
  name: string;
  tagline: string;
  location: string;
  tokenId: string;
  taxRatePct: number;
}

export interface XrpProof {
  txHash: string;
  destinationTag: number;
  ledgerIndex?: number;
  fee?: string;
}

export interface Receipt {
  id: string;
  mode: PaymentMode;
  tokenId?: string;
  toId: string;
  items: CartItem[];
  customAmount: number;
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  timestamp: string;
  merchantName: string;
  status: 'settled' | 'processing';
  xrp?: XrpProof;
}

const DEFAULT_MERCHANT: MerchantConfig = {
  name: 'Acquis Store',
  tagline: 'Powered by Hedera',
  location: '',
  tokenId: '',
  taxRatePct: 8.5,
};

const DEFAULT_CATALOG: CatalogItem[] = [
  { id: '1', name: 'Coffee',    price: 5,  emoji: '☕' },
  { id: '2', name: 'Sandwich',  price: 12, emoji: '🥪' },
  { id: '3', name: 'Smoothie',  price: 8,  emoji: '🥤' },
  { id: '4', name: 'Snack',     price: 3,  emoji: '🍪' },
  { id: '5', name: 'Meal Deal', price: 15, emoji: '🍱' },
  { id: '6', name: 'Juice',     price: 6,  emoji: '🧃' },
];

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function save<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

interface Session {
  merchant: MerchantConfig;
  setMerchant: (m: MerchantConfig) => void;
  catalog: CatalogItem[];
  setCatalog: (items: CatalogItem[]) => void;
  cart: CartItem[];
  addToCart: (item: CatalogItem) => void;
  incrementCart: (id: string) => void;
  decrementCart: (id: string) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  customAmount: number;
  setCustomAmount: (n: number) => void;
  cartSubtotal: number;
  cartCount: number;
  receipts: Receipt[];
  addReceipt: (r: Receipt) => void;
  tokenId: string;
  setTokenId: (id: string) => void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [merchant, setMerchantState] = useState<MerchantConfig>(() =>
    load('acquis:merchant', {
      ...DEFAULT_MERCHANT,
      tokenId: import.meta.env.VITE_DEFAULT_TOKEN_ID ?? '',
    })
  );
  const [catalog, setCatalogState] = useState<CatalogItem[]>(() =>
    load('acquis:catalog', DEFAULT_CATALOG)
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customAmount, setCustomAmount] = useState(0);
  const [receipts, setReceipts] = useState<Receipt[]>(() =>
    load('acquis:receipts', [])
  );

  const setMerchant = useCallback((m: MerchantConfig) => {
    setMerchantState(m);
    save('acquis:merchant', m);
  }, []);

  const setCatalog = useCallback((items: CatalogItem[]) => {
    setCatalogState(items);
    save('acquis:catalog', items);
  }, []);

  const addToCart = useCallback((item: CatalogItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      return existing
        ? prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
        : [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const incrementCart = useCallback((id: string) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, quantity: c.quantity + 1 } : c));
  }, []);

  const decrementCart = useCallback((id: string) => {
    setCart(prev => {
      const item = prev.find(c => c.id === id);
      if (!item) return prev;
      return item.quantity <= 1
        ? prev.filter(c => c.id !== id)
        : prev.map(c => c.id === id ? { ...c, quantity: c.quantity - 1 } : c);
    });
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => prev.filter(c => c.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomAmount(0);
  }, []);

  const addReceipt = useCallback((r: Receipt) => {
    setReceipts(prev => {
      const next = [r, ...prev].slice(0, 100);
      save('acquis:receipts', next);
      return next;
    });
  }, []);

  const cartSubtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0) + customAmount;
  const cartCount    = cart.reduce((s, i) => s + i.quantity, 0) + (customAmount > 0 ? 1 : 0);

  const setTokenId = useCallback((id: string) => {
    setMerchant({ ...merchant, tokenId: id });
  }, [merchant, setMerchant]);

  return (
    <Ctx.Provider value={{
      merchant, setMerchant,
      catalog, setCatalog,
      cart, addToCart, incrementCart, decrementCart, removeFromCart, clearCart,
      customAmount, setCustomAmount,
      cartSubtotal, cartCount,
      receipts, addReceipt,
      tokenId: merchant.tokenId,
      setTokenId,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
