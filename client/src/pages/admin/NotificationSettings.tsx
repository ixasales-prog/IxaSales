import { type Component, createSignal, createResource, Show, createEffect, For } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import {
    Save,
    Loader2,
    ArrowLeft,
    Bell,
    ShoppingCart,
    CreditCard,
    Truck,
    RotateCcw,
    Package,
    Clock,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Users,
    Send
} from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';

interface TenantNotificationSettings {
    telegramEnabledByAdmin: boolean;
    // Admin notifications
    notifyNewOrder: boolean;
    notifyOrderApproved: boolean;
    notifyOrderCancelled: boolean;
    notifyOrderDelivered: boolean;
    notifyOrderPartialDelivery: boolean;
    notifyOrderReturned: boolean;
    notifyOrderPartialReturn: boolean;
    notifyOrderCompleted: boolean;
    notifyPaymentReceived: boolean;
    notifyPaymentPartial: boolean;
    notifyPaymentComplete: boolean;
    notifyLowStock: boolean;
    notifyDueDebt: boolean;
    // Customer notifications
    customerNotifyOrderConfirmed: boolean;
    customerNotifyOrderApproved: boolean;
    customerNotifyOrderCancelled: boolean;
    customerNotifyOutForDelivery: boolean;
    customerNotifyDelivered: boolean;
    customerNotifyPartialDelivery: boolean;
    customerNotifyReturned: boolean;
    customerNotifyPaymentReceived: boolean;
    customerNotifyPaymentDue: boolean;
    // Thresholds
    lowStockThreshold: number;
    dueDebtDaysThreshold: number;
}

interface NotificationItem {
    key: keyof TenantNotificationSettings;
    label: string;
    description: string;
    icon: any;
    color: string;
    hasThreshold?: boolean;
    thresholdKey?: keyof TenantNotificationSettings;
    thresholdLabel?: string;
}

const ADMIN_NOTIFICATIONS: NotificationItem[] = [
    {
        key: 'notifyNewOrder',
        label: 'New Orders',
        description: 'When a new order is placed',
        icon: ShoppingCart,
        color: 'blue',
    },
    {
        key: 'notifyOrderApproved',
        label: 'Order Approved',
        description: 'When an order is approved',
        icon: CheckCircle,
        color: 'emerald',
    },
    {
        key: 'notifyOrderCancelled',
        label: 'Order Cancelled',
        description: 'When an order is cancelled',
        icon: XCircle,
        color: 'red',
    },
    {
        key: 'notifyOrderDelivered',
        label: 'Order Delivered',
        description: 'When an order is fully delivered',
        icon: Truck,
        color: 'indigo',
    },
    {
        key: 'notifyOrderPartialDelivery',
        label: 'Partial Delivery',
        description: 'When an order is partially delivered',
        icon: Package,
        color: 'amber',
    },
    {
        key: 'notifyOrderCompleted',
        label: 'Order Completed',
        description: 'When order is delivered AND fully paid',
        icon: CheckCircle,
        color: 'emerald',
    },
    {
        key: 'notifyPaymentReceived',
        label: 'Payment Received',
        description: 'When a payment is collected',
        icon: CreditCard,
        color: 'green',
    },
    {
        key: 'notifyOrderReturned',
        label: 'Return Processed',
        description: 'When a return is processed',
        icon: RotateCcw,
        color: 'orange',
    },
    {
        key: 'notifyLowStock',
        label: 'Low Stock Alerts',
        description: 'When product stock falls below threshold',
        icon: Package,
        color: 'red',
        hasThreshold: true,
        thresholdKey: 'lowStockThreshold',
        thresholdLabel: 'Stock threshold',
    },
    {
        key: 'notifyDueDebt',
        label: 'Overdue Debt Alerts',
        description: 'Daily summary of overdue customer debts',
        icon: Clock,
        color: 'purple',
        hasThreshold: true,
        thresholdKey: 'dueDebtDaysThreshold',
        thresholdLabel: 'Days overdue',
    },
];

const CUSTOMER_NOTIFICATIONS: NotificationItem[] = [
    {
        key: 'customerNotifyOrderConfirmed',
        label: 'Order Confirmed',
        description: 'When customer\'s order is confirmed',
        icon: CheckCircle,
        color: 'blue',
    },
    {
        key: 'customerNotifyOrderApproved',
        label: 'Order Approved',
        description: 'When customer\'s order is approved',
        icon: CheckCircle,
        color: 'emerald',
    },
    {
        key: 'customerNotifyOrderCancelled',
        label: 'Order Cancelled',
        description: 'When customer\'s order is cancelled',
        icon: XCircle,
        color: 'red',
    },
    {
        key: 'customerNotifyOutForDelivery',
        label: 'Out for Delivery',
        description: 'When order is out for delivery',
        icon: Truck,
        color: 'indigo',
    },
    {
        key: 'customerNotifyDelivered',
        label: 'Order Delivered',
        description: 'When order is delivered',
        icon: Package,
        color: 'emerald',
    },
    {
        key: 'customerNotifyPartialDelivery',
        label: 'Partial Delivery',
        description: 'When order is partially delivered',
        icon: Package,
        color: 'amber',
    },
    {
        key: 'customerNotifyReturned',
        label: 'Return Processed',
        description: 'When return is processed',
        icon: RotateCcw,
        color: 'orange',
    },
    {
        key: 'customerNotifyPaymentReceived',
        label: 'Payment Confirmed',
        description: 'When payment is received',
        icon: CreditCard,
        color: 'green',
    },
    {
        key: 'customerNotifyPaymentDue',
        label: 'Payment Reminders',
        description: 'Reminders for overdue payments',
        icon: Clock,
        color: 'purple',
    },
];

const colorStyles: Record<string, { bg: string; text: string; border: string }> = {
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
    indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
};

const NotificationSettings: Component = () => {
    const [submitting, setSubmitting] = createSignal(false);
    const [activeTab, setActiveTab] = createSignal<'admin' | 'customer'>('admin');

    const [data, { refetch }] = createResource(async () => {
        return api<TenantNotificationSettings>('/notifications/tenant-settings');
    });

    const [form, setForm] = createStore<TenantNotificationSettings>({
        telegramEnabledByAdmin: false,
        // Admin notifications
        notifyNewOrder: true,
        notifyOrderApproved: true,
        notifyOrderCancelled: true,
        notifyOrderDelivered: true,
        notifyOrderPartialDelivery: true,
        notifyOrderReturned: true,
        notifyOrderPartialReturn: true,
        notifyOrderCompleted: true,
        notifyPaymentReceived: true,
        notifyPaymentPartial: true,
        notifyPaymentComplete: true,
        notifyLowStock: true,
        notifyDueDebt: false,
        // Customer notifications
        customerNotifyOrderConfirmed: true,
        customerNotifyOrderApproved: true,
        customerNotifyOrderCancelled: true,
        customerNotifyOutForDelivery: true,
        customerNotifyDelivered: true,
        customerNotifyPartialDelivery: true,
        customerNotifyReturned: false,
        customerNotifyPaymentReceived: true,
        customerNotifyPaymentDue: true,
        // Thresholds
        lowStockThreshold: 10,
        dueDebtDaysThreshold: 7,
    });

    createEffect(() => {
        const d = data();
        if (d) {
            setForm(d);
        }
    });

    const handleSave = async () => {
        setSubmitting(true);
        try {
            await api('/notifications/tenant-settings', {
                method: 'PUT',
                body: JSON.stringify(form)
            });
            toast.success('Notification settings saved!');
            await refetch();
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const toggleNotification = (key: keyof TenantNotificationSettings) => {
        setForm(key, !form[key] as any);
    };

    const renderNotificationCard = (notif: NotificationItem) => {
        const styles = colorStyles[notif.color];
        const isEnabled = form[notif.key] as boolean;

        return (
            <div
                class={`p-4 rounded-xl border transition-all ${isEnabled
                    ? `${styles.bg} ${styles.border}`
                    : 'bg-slate-900/60 border-slate-800/50'
                    } ${!form.telegramEnabledByAdmin ? 'opacity-50 pointer-events-none' : ''}`}
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class={`w-10 h-10 rounded-lg ${styles.bg} flex items-center justify-center`}>
                            <notif.icon class={`w-5 h-5 ${styles.text}`} />
                        </div>
                        <div>
                            <div class="text-white font-medium">{notif.label}</div>
                            <div class="text-slate-400 text-sm">{notif.description}</div>
                        </div>
                    </div>
                    <button
                        onClick={() => toggleNotification(notif.key)}
                        class={`relative w-12 h-6 rounded-full transition-colors ${isEnabled ? 'bg-blue-600' : 'bg-slate-700'
                            }`}
                    >
                        <span class={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isEnabled ? 'left-7' : 'left-1'
                            }`} />
                    </button>
                </div>

                {/* Threshold Input */}
                <Show when={notif.hasThreshold && isEnabled}>
                    <div class="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-4">
                        <label class="text-slate-400 text-sm">{notif.thresholdLabel}:</label>
                        <input
                            type="number"
                            min="1"
                            value={(form as any)[notif.thresholdKey!]}
                            onInput={(e) => setForm(notif.thresholdKey!, parseInt(e.currentTarget.value) || 1)}
                            class="w-20 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-center focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </Show>
            </div>
        );
    };

    return (
        <div class="p-6 pt-6 lg:p-8 lg:pt-8 max-w-4xl">
            <A href="/admin/settings" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
                <ArrowLeft class="w-4 h-4" /> Back to Settings
            </A>

            <div class="flex items-center gap-3 mb-2">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <Bell class="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-white">Telegram Notifications</h1>
                    <p class="text-slate-400">Configure which notifications to send via Telegram.</p>
                </div>
            </div>

            <Show when={data.loading}>
                <div class="flex justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-500 animate-spin" />
                </div>
            </Show>

            <Show when={!data.loading}>
                {/* Master Status Banner */}
                <Show when={!form.telegramEnabledByAdmin}>
                    <div class="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                        <AlertTriangle class="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                            <p class="text-amber-400 font-medium">Telegram Not Enabled</p>
                            <p class="text-slate-400 text-sm mt-1">
                                Telegram notifications are disabled for your organization.
                                Please contact your platform administrator to enable this feature.
                            </p>
                        </div>
                    </div>
                </Show>

                <Show when={form.telegramEnabledByAdmin}>
                    <div class="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                        <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <p class="text-emerald-400 text-sm font-medium">Telegram notifications are enabled for your organization</p>
                    </div>
                </Show>

                {/* Tabs */}
                <div class="mt-8 flex gap-2 border-b border-slate-800">
                    <button
                        onClick={() => setActiveTab('admin')}
                        class={`px-4 py-2.5 font-medium text-sm transition-colors relative ${activeTab() === 'admin'
                            ? 'text-blue-400'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <div class="flex items-center gap-2">
                            <Send class="w-4 h-4" />
                            Admin Notifications
                        </div>
                        <Show when={activeTab() === 'admin'}>
                            <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
                        </Show>
                    </button>
                    <button
                        onClick={() => setActiveTab('customer')}
                        class={`px-4 py-2.5 font-medium text-sm transition-colors relative ${activeTab() === 'customer'
                            ? 'text-purple-400'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <div class="flex items-center gap-2">
                            <Users class="w-4 h-4" />
                            Customer Notifications
                        </div>
                        <Show when={activeTab() === 'customer'}>
                            <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 rounded-full" />
                        </Show>
                    </button>
                </div>

                {/* Admin Notifications */}
                <Show when={activeTab() === 'admin'}>
                    <div class="mt-6">
                        <p class="text-slate-400 text-sm mb-4">
                            Notifications sent to admin users who have linked their Telegram.
                        </p>
                        <div class="space-y-3">
                            <For each={ADMIN_NOTIFICATIONS}>
                                {(notif) => renderNotificationCard(notif)}
                            </For>
                        </div>
                    </div>
                </Show>

                {/* Customer Notifications */}
                <Show when={activeTab() === 'customer'}>
                    <div class="mt-6">
                        <p class="text-slate-400 text-sm mb-4">
                            Notifications sent to customers who have linked their Telegram via your bot.
                        </p>
                        <div class="space-y-3">
                            <For each={CUSTOMER_NOTIFICATIONS}>
                                {(notif) => renderNotificationCard(notif)}
                            </For>
                        </div>
                    </div>
                </Show>

                {/* Save Button */}
                <div class="mt-8 sticky bottom-4">
                    <button
                        onClick={handleSave}
                        disabled={submitting() || !form.telegramEnabledByAdmin}
                        class="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                    >
                        <Show when={submitting()} fallback={<Save class="w-5 h-5" />}>
                            <Loader2 class="w-5 h-5 animate-spin" />
                        </Show>
                        Save All Settings
                    </button>
                </div>
            </Show>
        </div>
    );
};

export default NotificationSettings;

