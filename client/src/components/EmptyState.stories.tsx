import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import EmptyState from './EmptyState';

/**
 * EmptyState Component Stories
 * 
 * The EmptyState component is used to display a friendly message when
 * no data is available. It includes an icon, title, and optional description.
 * 
 * ## Best Practices
 * - Use clear, actionable titles
 * - Provide helpful descriptions when needed
 * - Choose appropriate icons for the context
 * - Consider adding a call-to-action button
 * 
 * ## Accessibility
 * - Title is rendered as h3 for proper heading hierarchy
 * - Icon is decorative (aria-hidden)
 * - Color contrast meets WCAG AA standards
 */
const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['orders', 'favorites', 'payments', 'cart', 'addresses', 'products'],
      description: 'Type of empty state (determines icon and gradient)',
    },
    title: {
      control: 'text',
      description: 'Main heading text',
    },
    description: {
      control: 'text',
      description: 'Optional description text',
    },
    actionLabel: {
      control: 'text',
      description: 'Optional CTA button label',
    },
    onAction: {
      action: 'clicked',
      description: 'Callback when CTA button is clicked',
    },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default empty state for orders
 */
export const Orders: Story = {
  args: {
    type: 'orders',
    title: 'No orders yet',
  },
};

/**
 * Empty state with description
 */
export const WithDescription: Story = {
  args: {
    type: 'products',
    title: 'No products found',
    description: 'Try adjusting your search terms or filters to find what you\'re looking for.',
  },
};

/**
 * Empty state with call-to-action button
 */
export const WithAction: Story = {
  args: {
    type: 'favorites',
    title: 'No favorites yet',
    description: 'Save your favorite items for quick access later.',
    actionLabel: 'Browse Products',
    onAction: () => console.log('Action clicked'),
  },
};

/**
 * Empty state for cart
 */
export const EmptyCart: Story = {
  args: {
    type: 'cart',
    title: 'Your cart is empty',
    description: 'Add some products to get started with your order.',
    actionLabel: 'Start Shopping',
    onAction: () => console.log('Start shopping clicked'),
  },
};

/**
 * Empty state for addresses
 */
export const NoAddresses: Story = {
  args: {
    type: 'addresses',
    title: 'No addresses saved',
    description: 'Add a delivery address to speed up checkout.',
    actionLabel: 'Add Address',
    onAction: () => console.log('Add address clicked'),
  },
};

/**
 * Empty state for payments
 */
export const NoPayments: Story = {
  args: {
    type: 'payments',
    title: 'No payment methods',
    description: 'Add a payment method to complete your purchases faster.',
    actionLabel: 'Add Payment Method',
    onAction: () => console.log('Add payment clicked'),
  },
};
