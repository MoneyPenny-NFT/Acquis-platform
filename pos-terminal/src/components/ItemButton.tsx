import { useSession } from '../context/SessionContext';
import type { CatalogItem } from '../context/SessionContext';

interface Props {
  item: CatalogItem;
}

export function ItemButton({ item }: Props) {
  const { cart, addToCart } = useSession();
  const inCart = cart.find(c => c.id === item.id);
  const qty = inCart?.quantity ?? 0;

  return (
    <button
      onClick={() => addToCart(item)}
      className={`relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border
                  p-4 min-h-[96px] transition-all active:scale-95 select-none
                  ${qty > 0
                    ? 'bg-pos-accent/10 border-pos-accent/50 shadow-[0_0_12px_rgba(56,189,248,0.15)]'
                    : 'bg-pos-card border-pos-border hover:border-pos-muted'
                  }`}
    >
      <span className="text-2xl leading-none">{item.emoji}</span>
      <span className="text-xs font-medium text-white leading-none text-center truncate w-full">
        {item.name}
      </span>
      <span className={`text-[11px] font-bold ${qty > 0 ? 'text-pos-accent' : 'text-pos-muted'}`}>
        {item.price} tkn
      </span>

      {qty > 0 && (
        <span className="absolute -top-2 -right-2 bg-pos-accent text-pos-bg text-[10px] font-bold
                         rounded-full w-5 h-5 flex items-center justify-center shadow-md animate-pop-in">
          {qty}
        </span>
      )}
    </button>
  );
}
