// Unified Order Status Configuration
export interface OrderStatusConfig {
  bg: string;
  text: string;
  border?: string;
  icon: any;
  stripColor?: string;
}

// Consolidated status configurations for all order types
export const ORDER_STATUS_CONFIGS: Record<string, OrderStatusConfig> = {
  // Standard order statuses
  pending: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/20',
    icon: 'Clock',
    stripColor: 'bg-amber-500'
  },
  confirmed: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
    icon: 'CheckCircle2',
    stripColor: 'bg-blue-500'
  },
  approved: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    border: 'border-green-500/20',
    icon: 'CheckCircle2',
    stripColor: 'bg-green-500'
  },
  picking: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
    icon: 'Package',
    stripColor: 'bg-purple-500'
  },
  picked: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
    icon: 'Package',
    stripColor: 'bg-purple-500'
  },
  loaded: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'border-indigo-500/20',
    icon: 'Truck',
    stripColor: 'bg-indigo-500'
  },
  delivering: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/20',
    icon: 'Truck',
    stripColor: 'bg-orange-500'
  },
  in_transit: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/20',
    icon: 'Truck',
    stripColor: 'bg-cyan-500'
  },
  delivered: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    icon: 'CheckCircle2',
    stripColor: 'bg-emerald-500'
  },
  completed: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    icon: 'CheckCircle2',
    stripColor: 'bg-emerald-500'
  },
  cancelled: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/20',
    icon: 'XCircle',
    stripColor: 'bg-red-600'
  },
  returned: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/20',
    icon: 'XCircle',
    stripColor: 'bg-rose-600'
  },
  partial: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
    icon: 'Package',
    stripColor: 'bg-amber-500'
  },

  // Payment statuses
  paid: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    icon: 'DollarSign',
    stripColor: 'bg-emerald-600'
  },
  unpaid: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30',
    icon: 'AlertCircle',
    stripColor: 'bg-red-500'
  },

  // Procurement statuses
  received: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-400/20',
    icon: 'CheckCircle2',
    stripColor: 'bg-emerald-500'
  },
  ordered: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-400/20',
    icon: 'ShoppingBag',
    stripColor: 'bg-blue-500'
  },
  draft: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-400/20',
    icon: 'File',
    stripColor: 'bg-slate-500'
  },
  // Trip/Delivery statuses
  planned: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
    icon: 'Calendar',
    stripColor: 'bg-blue-500'
  },
  loading: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/20',
    icon: 'Package',
    stripColor: 'bg-orange-500'
  },
  in_progress: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    icon: 'Play',
    stripColor: 'bg-emerald-500'
  }
  // Note: 'completed' and 'cancelled' already defined above for orders, same styling works for trips
};

// Status groups for filtering
export const ORDER_STATUS_GROUPS = {
  all: ['pending', 'confirmed', 'picked', 'loaded', 'in_transit', 'delivered', 'completed', 'cancelled', 'returned'],
  active: ['pending', 'confirmed', 'picked', 'loaded', 'in_transit'],
  completed: ['delivered', 'completed'],
  cancelled: ['cancelled', 'returned']
};

// Utility functions
export const getOrderStatusConfig = (status: string): OrderStatusConfig => {
  return ORDER_STATUS_CONFIGS[status] || ORDER_STATUS_CONFIGS.pending;
};

export const getOrderStatusColor = (status: string): string => {
  return getOrderStatusConfig(status).stripColor || 'bg-slate-500';
};

export const getOrderStatusBg = (status: string): string => {
  return getOrderStatusConfig(status).bg;
};

export const getOrderStatusText = (status: string): string => {
  return getOrderStatusConfig(status).text;
};

// Payment status helper with label
export interface PaymentStatusConfig extends OrderStatusConfig {
  label: string;
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  partial: 'Partial',
  unpaid: 'Unpaid',
};

export const getPaymentStatusConfig = (paymentStatus: string): PaymentStatusConfig => {
  const config = ORDER_STATUS_CONFIGS[paymentStatus] || ORDER_STATUS_CONFIGS.unpaid;
  return {
    ...config,
    label: PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1),
  };
};

// Trip status labels for driver portal
export const TRIP_STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  loading: 'Loading',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  pending: 'Pending',
};

export interface TripStatusConfig extends OrderStatusConfig {
  label: string;
}

export const getTripStatusConfig = (status: string): TripStatusConfig => {
  const config = ORDER_STATUS_CONFIGS[status] || ORDER_STATUS_CONFIGS.pending;
  return {
    ...config,
    label: TRIP_STATUS_LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
  };
};