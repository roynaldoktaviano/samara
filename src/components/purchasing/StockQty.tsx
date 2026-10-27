import { formatNumber } from '@/lib/format'
import { displayQty, type UnitInfo } from '@/lib/purchasing/units'

/** A stored base-unit quantity, shown in the purchase unit with the base amount underneath. */
export function StockQty({ item, qty, className = '', subClassName = '' }: { item: UnitInfo; qty: number; className?: string; subClassName?: string }) {
  const d = displayQty(item, qty)
  return (
    <span className={className}>
      {formatNumber(d.qty, { decimals: 3 })} <span className="text-xs font-normal text-muted-foreground">{d.unit}</span>
      {d.baseQty !== null && d.baseQty !== 0 && (
        <span className={`block text-[10px] font-normal text-muted-foreground ${subClassName}`}>{formatNumber(d.baseQty, { decimals: 3 })} {d.baseUnit}</span>
      )}
    </span>
  )
}
