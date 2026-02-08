// Unified Order Types for all order management pages

export interface BaseOrder {
  id: string;
  orderNumber: string;
  totalAmount: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

export interface AdminOrder extends BaseOrder {
  customer: { name: string; code: string } | null;
  salesRep: { name: string } | null;
  paidAmount: string;
}

export interface SalesOrder extends BaseOrder {
  customerName: string;
  itemCount: number;
}

export interface CustomerOrder extends BaseOrder {
  itemCount: number;
}

export interface ProcurementOrder {
  id: string;
  poNumber: string;
  supplierName: string;
  totalAmount: string;
  status: string;
  createdAt: string;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  customerName?: string;
  customer?: { name: string; code: string } | null;
  salesRep?: { name: string } | null;
  totalAmount: string;
  paidAmount?: string;
  status: string;
  paymentStatus: string;
  itemCount?: number;
  createdAt: string;
}

// API Response Types
export interface OrderApiResponse<T = OrderListItem> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// Component Props
export interface OrderTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
}

export interface OrderTableProps {
  orders: OrderListItem[];
  columns?: OrderTableColumn[];
  onRowClick?: (order: OrderListItem) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export interface OrderPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

export interface OrderEmptyStateProps {
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}