/**
 * Empty State Component
 * 
 * Reusable empty state with illustration, message, and CTA button.
 */

import { type Component, type JSX, Show } from 'solid-js';
import { Package, Heart, CreditCard, ShoppingCart, MapPin, Search } from 'lucide-solid';

interface EmptyStateProps {
    type: 'orders' | 'favorites' | 'payments' | 'cart' | 'addresses' | 'products';
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
}

const EmptyState: Component<EmptyStateProps> = (props) => {
    const getIcon = (): JSX.Element => {
        switch (props.type) {
            case 'orders':
                return <Package size={64} />;
            case 'favorites':
                return <Heart size={64} />;
            case 'payments':
                return <CreditCard size={64} />;
            case 'cart':
                return <ShoppingCart size={64} />;
            case 'addresses':
                return <MapPin size={64} />;
            case 'products':
                return <Search size={64} />;
            default:
                return <Package size={64} />;
        }
    };

    const getGradient = (): string => {
        switch (props.type) {
            case 'orders':
                return 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';
            case 'favorites':
                return 'linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)';
            case 'payments':
                return 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)';
            case 'cart':
                return 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)';
            case 'addresses':
                return 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)';
            case 'products':
                return 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)';
            default:
                return 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';
        }
    };

    return (
        <div class="empty-state-enhanced">
            <div class="empty-state-icon" style={{ background: getGradient() }}>
                {getIcon()}
            </div>
            <h3 class="empty-state-title">{props.title}</h3>
            <Show when={props.description}>
                <p class="empty-state-description">{props.description}</p>
            </Show>
            <Show when={props.actionLabel && props.onAction}>
                <button class="empty-state-action" onClick={props.onAction}>
                    {props.actionLabel}
                </button>
            </Show>
        </div>
    );
};

export default EmptyState;
