import { type Component, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  File,
  Package,
  Play,
  ShoppingBag,
  Truck,
  XCircle,
} from 'lucide-solid';
import { getOrderStatusConfig } from './constants';

interface OrderStatusBadgeProps {
  status: string;
  variant?: 'badge' | 'strip' | 'pill';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const OrderStatusBadge: Component<OrderStatusBadgeProps> = (props) => {
  const statusConfig = () => getOrderStatusConfig(props.status);
  const variant = () => props.variant || 'badge';
  const size = () => props.size || 'md';
  const showIcon = () => props.showIcon !== false;
  const statusIcons = {
    AlertCircle,
    Calendar,
    CheckCircle2,
    Clock,
    DollarSign,
    File,
    Package,
    Play,
    ShoppingBag,
    Truck,
    XCircle,
  } as const;
  const StatusIcon = () => statusIcons[statusConfig().icon as keyof typeof statusIcons] || Clock;

  // Size classes
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  // Variant renderers
  const renderBadge = () => (
    <span 
      class={`${statusConfig().bg} ${statusConfig().text} ${sizeClasses[size()]} rounded-full font-medium inline-flex items-center gap-1.5 ${props.className || ''}`}
    >
      <Show when={showIcon()}>
        <Dynamic component={StatusIcon()} class="w-3.5 h-3.5" />
      </Show>
      {props.status.replace('_', ' ')}
    </span>
  );

  const renderStrip = () => (
    <div 
      class={`${statusConfig().stripColor} ${props.className || ''}`}
      title={props.status}
    />
  );

  const renderPill = () => (
    <span 
      class={`${statusConfig().bg} ${statusConfig().text} ${sizeClasses[size()]} rounded-full font-medium ${props.className || ''}`}
    >
      {props.status.replace('_', ' ')}
    </span>
  );

  // Render based on variant
  return (
    <Show when={variant() === 'badge'} fallback={
      <Show when={variant() === 'strip'} fallback={renderPill()}>
        {renderStrip()}
      </Show>
    }>
      {renderBadge()}
    </Show>
  );
};

export default OrderStatusBadge;
