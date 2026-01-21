import { type Component, Show } from 'solid-js';
import {
    LogOut,
    Mail,
    Phone,
    Building2
} from 'lucide-solid';
import { logout, currentUser } from '../../stores/auth';
import { useBranding } from '../../stores/branding';
import { useI18n } from '../../i18n';

const Menu: Component = () => {
    const { t } = useI18n();
    const user = currentUser();
    const branding = useBranding();

    const handleLogout = () => {
        logout();
    };

    // Generate user initials for avatar
    const getInitials = () => {
        const name = user?.name || 'User';
        return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    };

    // Get role display name
    const getRoleDisplay = () => {
        const role = user?.role || 'sales_rep';
        switch (role) {
            case 'sales_rep': return 'Sales Representative';
            case 'supervisor': return 'Supervisor';
            case 'tenant_admin': return 'Administrator';
            default: return role;
        }
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            {/* Header */}
            <div class="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50 pt-safe-top">
                <div class="px-4 h-16 flex items-center justify-between">
                    <h1 class="text-xl font-bold text-white">{t('salesApp.menu.title')}</h1>
                </div>
            </div>

            <div class="p-4 space-y-6">
                {/* User Profile Card */}
                <div class="bg-gradient-to-br from-slate-900 to-slate-900/50 border border-slate-800 rounded-2xl p-5">
                    <div class="flex items-center gap-4 mb-4">
                        <div class="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-xl shrink-0">
                            {getInitials()}
                        </div>
                        <div class="flex-1 min-w-0">
                            <h2 class="text-lg font-bold text-white truncate">{user?.name || 'User'}</h2>
                            <div class="mt-1">
                                <span class="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20 uppercase">
                                    {getRoleDisplay()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div class="space-y-2 pt-3 border-t border-slate-800/50">
                        <Show when={user?.email}>
                            <div class="flex items-center gap-3 text-sm">
                                <Mail class="w-4 h-4 text-slate-500" />
                                <span class="text-slate-400 truncate">{user?.email}</span>
                            </div>
                        </Show>
                        <Show when={user?.phone}>
                            <div class="flex items-center gap-3 text-sm">
                                <Phone class="w-4 h-4 text-slate-500" />
                                <span class="text-slate-400">{user?.phone}</span>
                            </div>
                        </Show>
                        <Show when={branding.platformName}>
                            <div class="flex items-center gap-3 text-sm">
                                <Building2 class="w-4 h-4 text-slate-500" />
                                <span class="text-slate-400">{branding.platformName}</span>
                            </div>
                        </Show>
                    </div>
                </div>

                {/* Logout Button */}
                <button
                    onClick={handleLogout}
                    class="w-full bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 border border-red-500/20 text-red-500 p-4 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2"
                >
                    <LogOut class="w-5 h-5" />
                    {t('salesApp.menu.signOut')}
                </button>

                {/* App Version */}
                <div class="text-center space-y-1 py-4">
                    <p class="text-slate-600 text-xs font-medium">
                        {branding.platformName} {t('salesApp.menu.forSales')}
                    </p>
                    <p class="text-slate-700 text-[10px]">
                        {t('salesApp.menu.version')} 1.0.0
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Menu;
