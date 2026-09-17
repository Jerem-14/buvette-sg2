export type Role = 'ADMIN' | 'MEMBER';
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
}
export interface Dated {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export interface Participant extends Dated {
  name: string;
  archived: boolean;
}
export interface Contribution extends Dated {
  participantId: string;
  amountCents: number;
  date: string;
  note: string;
}
export interface Product extends Dated {
  name: string;
  category: string;
  purchasePriceCents: number;
  lowStockThreshold: number;
  archived: boolean;
}
export interface EntryItem {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
}
export interface StockEntry extends Dated {
  date: string;
  note: string;
  sequence: number;
  items: EntryItem[];
}
export interface EventLine extends Dated {
  productId: string;
  quantityOut: number;
  quantityReturned: number;
  sequence: number;
}
export interface BuvetteEvent extends Dated {
  name: string;
  date: string;
  note: string;
  status: 'OPEN' | 'CLOSED';
  closeSequence: number | null;
  lines: EventLine[];
}
export interface Audit {
  id: string;
  date: string;
  actorId: string;
  actorName: string;
  type: string;
  entityId: string;
  note: string;
  before: unknown;
  after: unknown;
  productIds: string[];
  participantId?: string;
  eventId?: string;
}
export interface Register {
  schemaVersion: 1;
  revision: number;
  nextSequence: number;
  users: User[];
  participants: Participant[];
  contributions: Contribution[];
  products: Product[];
  entries: StockEntry[];
  events: BuvetteEvent[];
  audit: Audit[];
}
export interface Allocation {
  lotId: string;
  productId: string;
  sequence: number;
  quantity: number;
  valueCents: number;
}
export interface Movement {
  id: string;
  date: string;
  type: string;
  label: string;
  productId?: string;
  participantId?: string;
  eventId?: string;
  quantity?: number;
  amountCents?: number;
  note: string;
}
export interface Projection {
  stock: Record<string, { quantity: number; valueCents: number }>;
  lines: Record<string, { outCents: number; consumedCents: number; returnedCents: number }>;
  fundsCents: number;
  purchasesCents: number;
  consumedCents: number;
  reservedCents: number;
  stockCents: number;
  balanceCents: number;
  purchaseBalanceCents: number;
  contributors: number;
  closedEvents: number;
  averageCents: number;
  movements: Movement[];
}
export interface Snapshot {
  revision: number;
  participants: Participant[];
  contributions: Contribution[];
  products: Product[];
  entries: StockEntry[];
  events: BuvetteEvent[];
  audit: Audit[];
  projection: Projection;
  user: Omit<User, 'passwordHash'>;
  demo: boolean;
}
