# Order Management Refactoring Plan - Detailed Implementation Guide

## Current State Analysis

### Exact Duplicated Code Locations:

**1. Status Badge Logic (4 duplications):**

**File: `client/src/pages/admin/Orders.tsx` (Lines 66-77)**
```typescript
const getStatusConfig = (status: string) => {
    const configs: Record<string, { bg: string; text: string; icon: any }> = {
        pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: Clock },
        confirmed: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: CheckCircle2 },
        picked: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: Package },
        loaded: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', icon: Truck },
        in_transit: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', icon: Truck },
        delivered: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle2 },
        cancelled: { bg: 'bg-red-500/10', text: 'text-red-400', icon: XCircle },
    };
    return configs[status] || configs.pending;
};
```

**File: `client/src/pages/sales/Orders.tsx` (Lines 60-69)**
```typescript
const getStatusStripColor = (status: string) => {
    switch (status) {
        case 'pending': return 'bg-amber-500';
        case 'delivered':
        case 'completed': return 'bg-emerald-500';
        case 'returned': return 'bg-red-600';
        case 'paid': return 'bg-emerald-600';
        default: return 'bg-slate-500';
    }
};

const getPaymentBadge = (status: string) => {
    switch (status) {
        case 'paid': return 'bg-emerald-500/20 text-emerald-400';
        case 'partial': return 'bg-amber-500/20 text-amber-400';
        case 'unpaid': return 'bg-red-500/20 text-red-400';
        default: return 'bg-slate-500/20 text-slate-400';
    }
};
```

**File: `client/src/utils/constants.ts` (imported in OrdersTab)**
```typescript
export const getOrderStatusColor = (status: string): string => {
    // Implementation varies by status
};
```

**File: `client/src/pages/admin/Procurement.tsx` (embedded)**
```typescript
const getStatusColor = (status: string) => {
    switch (status) {
        case 'received': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
        case 'ordered': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        case 'draft': return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
        case 'cancelled': return 'text-red-400 bg-red-400/10 border-red-400/20';
        default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
};
```

**2. Filter Logic (3+ duplications):**

Similar search/filter patterns in:
- Admin Orders (lines 92-114)
- Sales Orders (lines 92-116) 
- Customer Orders Tab (uses pill filters)

## Refactoring Steps

### Phase 1: Create Shared Components (Completed ✅)
Files created in `client/src/components/shared/order/`:
- `constants.ts` - Unified status configurations
- `OrderStatusBadge.tsx` - Reusable status badge component
- `OrderFilters.tsx` - Reusable filter component
- `types.ts` - Shared TypeScript interfaces
- `index.ts` - Barrel export file

### Phase 2: Refactor Admin Orders Page

**Before (current code):**
```typescript
// Lines 1-17 imports + interface definition
// Lines 30-77: getStatusConfig function
// Lines 92-114: Manual filter implementation
// Lines 142-151, 190-200: Manual status badge rendering
```

**After (refactored):**
```typescript
// Replace imports:
import { OrderStatusBadge, OrderFilters } from '../../components/shared/order';
import type { OrderListItem } from '../../components/shared/order/types';

// Remove getStatusConfig function entirely

// Replace manual filters with:
<OrderFilters
  onSearchChange={(value) => { setSearch(value); setPage(1); }}
  onStatusChange={(value) => { setStatusFilter(value); setPage(1); }}
  searchPlaceholder="Search orders..."
  statusOptions={statusOptions}
  currentSearch={search()}
  currentStatus={statusFilter()}
/>

// Replace manual status badges with:
<OrderStatusBadge 
  status={order.status} 
  variant="badge"
  size="sm"
/>
```

### Phase 3: Refactor Sales Orders Page

**Replace:**
```typescript
// Lines 51-69: getStatusStripColor and getPaymentBadge functions
// Lines 92-116: Manual search implementation
```

**With:**
```typescript
import { OrderStatusBadge, OrderFilters } from '../../components/shared/order';

// Remove both status functions

<OrderFilters
  onSearchChange={setSearch}
  onStatusChange={setStatusFilter}
  searchPlaceholder="Search order number..."
  statusOptions={[
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    // ... other options
  ]}
  currentSearch={search()}
  currentStatus={statusFilter()}
  compact={true}
/>

// Replace status strip:
<OrderStatusBadge 
  status={order.status} 
  variant="strip"
  className="absolute left-0 top-0 bottom-0"
/>

// Replace payment badge:
<OrderStatusBadge 
  status={order.paymentStatus} 
  variant="pill"
  size="xs"
  className={getPaymentBadge(order.paymentStatus)}
/>
```

### Phase 4: Update Customer Orders Tab

**Current:**
```typescript
import { getOrderStatusColor } from '../../../utils/constants';

// Line 96: Manual strip rendering
<div class="order-status-stripe" style={{ background: getOrderStatusColor(order.status) }} />

// Line 108-116: Manual badge rendering
<span
  class="order-status-badge"
  style={{
    background: `${getOrderStatusColor(order.status)}15`,
    color: getOrderStatusColor(order.status)
  }}
>
  {t(`orders.status.${order.status}` as any)}
</span>
```

**After:**
```typescript
import { OrderStatusBadge } from '../../../components/shared/order';

// Replace strip:
<OrderStatusBadge 
  status={order.status} 
  variant="strip"
  className="order-status-stripe"
/>

// Replace badge:
<OrderStatusBadge 
  status={order.status} 
  variant="pill"
  className="order-status-badge"
/>
```

### Phase 5: Update Procurement Orders

**Replace embedded status function with:**
```typescript
import { OrderStatusBadge } from '../../components/shared/order';

<OrderStatusBadge 
  status={order.status} 
  variant="badge"
  className={getStatusColor(order.status)}
/>
```

## Migration Impact Matrix

| File | Changes Required | Risk Level | Estimated Time |
|------|------------------|------------|----------------|
| `admin/Orders.tsx` | Medium (remove 47 lines, add 15) | Medium | 2 hours |
| `sales/Orders.tsx` | Medium (remove 35 lines, add 20) | Medium | 1.5 hours |
| `customer/tabs/OrdersTab.tsx` | Low (remove 2 imports, add 2) | Low | 30 minutes |
| `admin/Procurement.tsx` | Low (remove 15 lines, add 5) | Low | 45 minutes |
| **Total** | **~127 lines removed, ~40 added** | **Medium** | **4.25 hours** |

## Testing Plan

### Critical Paths to Test:
1. Admin orders list filtering and pagination
2. Sales orders search and status filtering
3. Customer order status display
4. Procurement order status colors
5. Mobile responsiveness of shared components

### Rollback Strategy:
- Each page can be rolled back individually
- Git commits should be atomic per page
- Shared components can remain unused if rollback needed

## Success Metrics

**Before Refactoring:**
- 4 separate status configuration implementations
- 3+ filter implementations
- ~200 lines of duplicated logic
- Inconsistent styling across pages

**After Refactoring:**
- 1 unified status configuration
- 1 shared filter component
- ~80 lines of shared logic
- Consistent styling and behavior
- Easier maintenance and updates