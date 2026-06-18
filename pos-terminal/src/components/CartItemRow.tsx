import { useSession } from '../context/SessionContext';
import type { CartItem } from '../context/SessionContext';

interface Props { item: CartItem; }

export function CartItemRow({ item }: Props) {
  const { incrementCart, decrementCart, removeFromCart } = useSession();

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-2xl w-8 text-center">{item.emoji}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        <p className="text-xs text-pos-muted">{item.price} × {item.quantity} = {item.price * item.quantity} tkn</p>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => decrementCart(item.id)}
          className="w-7 h-7 rounded-lg bg-pos-surface border border-pos-border text-pos-dim
                     flex items-center justify-center text-sm font-bold active:scale-90 transition-transform"
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-bold text-white">{item.quantity}</span>
        <button
          onClick={() => incrementCart(item.id)}
          className="w-7 h-7 rounded-lg bg-pos-surface border border-pos-border text-pos-dim
                     flex items-center justify-center text-sm font-bold active:scale-90 transition-transform"
        >
          +
        </button>
        <button
          onClick={() => removeFromCart(item.id)}
          className="w-7 h-7 ml-1 rounded-lg text-pos-error/60 hover:text-pos-error
                     flex items-center justify-center text-sm active:scale-90 transition-all"
        >
          ×
        </button>
      </div>
    </div>
  );
}
