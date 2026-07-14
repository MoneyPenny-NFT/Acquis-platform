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
      className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border
                  p-4 min-h-[100px] transition-all duration-200 active:scale-95 select-none
                  ${qty > 0
                    ? 'bg-pos-accent/10 border-pos-accent/60 shadow-teal-glow'
                    : 'bg-pos-card border-pos-border hover:border-pos-border/80 shadow-card'
                  }`}
    >
      <span className="text-2xl leading-none">{item.emoji}</span>
      <span className="text-xs font-semibold text-pos-text leading-none text-center truncate w-full">
        {item.name}
      </span>
      <span className={`text-[11px] font-bold tabular-nums ${qty > 0 ? 'text-pos-accent' : 'text-pos-muted'}`}>
        ${item.price.toFixed(2)}
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
