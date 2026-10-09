import { Prisma } from '@prisma/client'

// ── BOT role: read-only data access for AI bots ─────────────────────────────────────────────
// A BOT user can ONLY call GET /api/bot/* (enforced in src/middleware.ts) — every other page
// and API route, and every non-GET method, is rejected before it reaches a handler. That makes
// the bot unable to post, approve or delete anything, and keeps it away from Users, Settings,
// HR, chats, etc. by construction (deny-by-default).
//
// /api/bot/* only serves the models whitelisted in BOT_RESOURCES below, and only their scalar
// columns (no relations, so nothing sensitive can ride along nested), minus every column that
// matches the sensitive-field rules below. Off-limits by design:
//  - passwords, login/API tokens, PINs, system settings, user accounts
//  - bank account numbers, SWIFT, transfer proofs, reimbursement payee accounts
//  - staff personal data (Employee, payslips, HR records are not exposed at all)
//  - guest passport numbers/scans, medical data, date of birth, home address
// Salaries & payroll are never readable — not per person, not as totals: Employee/payslip/
// payroll models are not exposed, salary-named columns are stripped, and salary rows in
// Expenses (e.g. category "Crew Salary") are filtered out via baseWhere.

/** Column names (case-insensitive substring) that are never returned to a bot, on any model. */
const SENSITIVE_SUBSTRINGS = [
  'password', 'token', 'secret', 'apikey', 'pinhash', 'hash',
  'passport', 'nikpassport', 'niksnap', 'npwp', 'bpjs',
  'medical', 'health', 'religion', 'marital', 'dateofbirth', 'birthdate', 'placeofbirth',
  'accountnumber', 'idraccount', 'usdaccount', 'swift', 'iban', 'cardnumber', 'cvv',
  'salary', 'proof', 'signature', 'emergencycontact', 'personalemail',
]
/** Column-name suffixes for stored files (scans, receipts, contracts may show IDs/bank details). */
const SENSITIVE_SUFFIX = /(file|files|filename|key|keys|image|attachments)$/i

/** Extra per-model columns to hide that the generic rules above don't catch. */
const EXTRA_OMIT: Record<string, string[]> = {
  Customer: ['address'],               // guest home address
  AgentContact: ['address'],
  Crew: ['phone', 'email'],            // staff personal contact details
  Payment: ['paymentLink', 'changeProofUrl'],
  Agent: ['portalPasswordSetById'],
}

export function isSensitiveField(model: string, field: string): boolean {
  const f = field.toLowerCase()
  if (SENSITIVE_SUBSTRINGS.some(s => f.includes(s))) return true
  if (SENSITIVE_SUFFIX.test(field)) return true
  return (EXTRA_OMIT[model] ?? []).includes(field)
}

type BotResource = {
  /** Prisma model name (as in schema.prisma) */
  model: string
  /** Column used by ?from=&to= date-range filtering; defaults to createdAt */
  dateField?: string
  description: string
  /** Rows the bot may never see — always ANDed with the bot's own filters, so it can't be overridden. */
  baseWhere?: Record<string, unknown>
}

const SALARY_WORDS = ['salary', 'gaji', 'payroll', 'wage', 'upah', 'bonus']

// Whitelist — anything not listed here is unreachable for the bot.
export const BOT_RESOURCES: Record<string, BotResource> = {
  // Sales & bookings
  'bookings':                  { model: 'Booking', dateField: 'startDate', description: 'Bookings (charter & open trip), prices, status' },
  'booking-guests':            { model: 'BookingGuest', description: 'Guest ↔ booking ↔ cabin links, flights/pickup' },
  'booking-services':          { model: 'BookingService', description: 'Add-on services sold on bookings' },
  'customers':                 { model: 'Customer', description: 'Guests — name/contact only (no passport, medical, DOB, address)' },
  'leads':                     { model: 'Lead', description: 'Sales leads & pipeline stage' },
  'inquiries':                 { model: 'Inquiry', description: 'Inbound inquiries' },
  'agents':                    { model: 'Agent', description: 'B2B agents & commission rates' },
  'agent-contacts':            { model: 'AgentContact', description: 'Agent contact persons' },
  'agent-clawback-entries':    { model: 'AgentClawbackEntry', description: 'Agent commission clawbacks' },
  'vouchers':                  { model: 'Voucher', description: 'Discount vouchers' },
  'waiting-lists':             { model: 'WaitingList', description: 'Open-trip waiting list' },
  // Finance
  'payments':                  { model: 'Payment', dateField: 'paymentDate', description: 'Invoices & payments received' },
  'banks':                     { model: 'Bank', description: 'Receiving bank names (no account numbers)' },
  'expenses':                  { model: 'Expense', dateField: 'date', description: 'Operating expenses (salary/payroll rows excluded)',
    baseWhere: { NOT: { OR: SALARY_WORDS.flatMap(w => [
      { category: { contains: w, mode: 'insensitive' } },
      { description: { contains: w, mode: 'insensitive' } },
    ]) } } },
  'po-payment-requests':       { model: 'POPaymentRequest', description: 'PO payment requests (read-only)' },
  'po-reimbursements':         { model: 'POReimbursement', description: 'PO reimbursements (no payee account)' },
  'delivery-fees':             { model: 'DeliveryFee', description: 'Delivery fees' },
  'delivery-fee-payment-requests': { model: 'DeliveryFeePaymentRequest', description: 'Delivery fee payment requests' },
  'delivery-fee-reimbursements':   { model: 'DeliveryFeeReimbursement', description: 'Delivery fee reimbursements (no payee account)' },
  // Fleet / operations
  'yachts':                    { model: 'Yacht', description: 'Boats' },
  'cabins':                    { model: 'Cabin', description: 'Cabins per boat' },
  'cabin-pricing-tiers':       { model: 'CabinPricingTier', description: 'Cabin pricing tiers' },
  'destinations':              { model: 'Destination', description: 'Destinations' },
  'yacht-destination-prices':  { model: 'YachtDestinationPrice', description: 'Charter price per boat × destination' },
  'open-trips':                { model: 'OpenTrip', dateField: 'startDate', description: 'Scheduled open trips' },
  'crew':                      { model: 'Crew', description: 'Crew roster per boat (name/position only)' },
  'maintenance':               { model: 'Maintenance', description: 'Boat maintenance records' },
  'internal-events':           { model: 'InternalEvent', description: 'Internal calendar blocks' },
  // Purchasing & stock
  'purchase-requests':         { model: 'PurchaseRequest', description: 'Purchase requests' },
  'purchase-request-items':    { model: 'PurchaseRequestItem', description: 'Purchase request lines' },
  'purchase-quotations':       { model: 'PurchaseQuotation', description: 'Supplier quotations' },
  'purchase-orders':           { model: 'PurchaseOrder', description: 'Purchase orders' },
  'purchase-order-items':      { model: 'PurchaseOrderItem', description: 'Purchase order lines' },
  'goods-receipts':            { model: 'GoodsReceipt', dateField: 'receivedAt', description: 'Goods receipts' },
  'goods-receipt-items':       { model: 'GoodsReceiptItem', description: 'Goods receipt lines' },
  'suppliers':                 { model: 'Supplier', description: 'Suppliers' },
  'purchase-items':            { model: 'PurchaseItem', description: 'Item master (purchasing)' },
  'purchase-item-categories':  { model: 'PurchaseItemCategory', description: 'Item categories' },
  'stock-locations':           { model: 'StockLocation', description: 'Warehouses / boats / stock locations' },
  'stock-lots':                { model: 'StockLot', description: 'Stock on hand by lot' },
  'stock-movements':           { model: 'StockMovement', description: 'Stock movement ledger' },
  'stock-transfers':           { model: 'StockTransfer', description: 'Stock transfers' },
  'stock-transfer-items':      { model: 'StockTransferItem', description: 'Stock transfer lines' },
  'stock-counts':              { model: 'StockCount', description: 'Stock counts' },
  'stock-count-items':         { model: 'StockCountItem', description: 'Stock count lines' },
  'inventory-exceptions':      { model: 'InventoryException', description: 'Inventory exceptions' },
  'crew-requests':             { model: 'CrewRequest', description: 'Crew requests' },
  'crew-request-items':        { model: 'CrewRequestItem', description: 'Crew request lines' },
  // Onboard POS / bar
  'cashier-sales':             { model: 'CashierSale', description: 'Onboard POS sales' },
  'cashier-sale-items':        { model: 'CashierSaleItem', description: 'Onboard POS sale lines' },
  'pos-categories':            { model: 'PosCategory', description: 'POS categories' },
  'pos-menu-items':            { model: 'PosMenuItem', description: 'POS menu items' },
  'pos-packages':              { model: 'PosPackage', description: 'POS packages' },
  'pos-package-items':         { model: 'PosPackageItem', description: 'POS package lines' },
  'pos-recipes':               { model: 'PosRecipe', description: 'POS recipes' },
  'pos-recipe-lines':          { model: 'PosRecipeLine', description: 'POS recipe ingredients' },
  'pos-discounts':             { model: 'PosDiscount', description: 'POS discounts' },
  // Hotel / fixed-asset inventory
  'inventory-rooms':           { model: 'InventoryRoom', description: 'Inventory rooms' },
  'inventory-categories':      { model: 'InventoryCategory', description: 'Inventory categories' },
  'inventory-items':           { model: 'InventoryItem', description: 'Inventory items' },
  'inventory-opnames':         { model: 'InventoryOpname', description: 'Inventory opname sessions' },
  'inventory-opname-entries':  { model: 'InventoryOpnameEntry', description: 'Inventory opname entries' },
  // Marketing
  'campaigns':                 { model: 'Campaign', description: 'Marketing campaigns' },
  'email-campaigns':           { model: 'EmailCampaign', description: 'Email campaigns & stats' },
}

type DmmfField = { name: string; kind: string; type: string }

function modelFields(model: string): DmmfField[] {
  const m = Prisma.dmmf.datamodel.models.find(x => x.name === model)
  return (m?.fields ?? []) as unknown as DmmfField[]
}

/** Safe scalar columns of a model — relations are never included. */
export function botSafeFields(model: string): DmmfField[] {
  return modelFields(model).filter(f => (f.kind === 'scalar' || f.kind === 'enum') && !isSensitiveField(model, f.name))
}

export function botSelect(model: string): Record<string, true> {
  return Object.fromEntries(botSafeFields(model).map(f => [f.name, true]))
}

/** Prisma client delegate name: model name with the first letter lower-cased. */
export function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

/**
 * Last line of defence on everything /api/bot returns: drops any key that looks sensitive,
 * at any depth (e.g. inside Json columns), even if a whitelisted model grows a new column.
 */
export function sanitizeForBot<T>(value: T, model = ''): T {
  if (Array.isArray(value)) return value.map(v => sanitizeForBot(v, model)) as T
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveField(model, k)) continue
      out[k] = sanitizeForBot(v, model)
    }
    return out as T
  }
  return value
}
