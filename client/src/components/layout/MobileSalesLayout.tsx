import { type Component, onMount } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { Home, ShoppingBag, Users, Menu, MapPin } from 'lucide-solid';
import { initSettings } from '../../stores/settings';
import { useI18n } from '../../i18n';

const MobileSalesLayout: Component<{ children: any }> = (props) => {
    const { t } = useI18n();
    const location = useLocation();

    // Initialize tenant settings on mount (for already logged-in users)
    onMount(() => {
        initSettings();
    });

    // Fix: Match path prefix for child routes
    const activeClass = (path: string, exact = false) => {
        const isActive = exact
            ? location.pathname === path
            : location.pathname === path || location.pathname.startsWith(path + '/');
        return isActive
            ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]'
            : 'text-slate-500 hover:text-slate-400';
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-20">
            <main>
                {props.children}
            </main>

            {/* Bottom Navigation */}
            <nav class="fixed bottom-0 left-0 right-0 h-16 bg-slate-900/80 backdrop-blur-md border-t border-slate-800/50 flex items-center justify-around px-2 z-50 pb-safe">
                <A href="/sales" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/sales', true)}`}>
                    <Home size={22} />
                    <span class="text-[10px] font-medium">{t('salesApp.nav.home')}</span>
                </A>

                <A href="/sales/visits" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/sales/visits')}`}>
                    <MapPin size={22} />
                    <span class="text-[10px] font-medium">{t('salesApp.visits.title')}</span>
                </A>

                <A href="/sales/catalog" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/sales/catalog')}`}>
                    <ShoppingBag size={22} />
                    <span class="text-[10px] font-medium">{t('salesApp.nav.catalog')}</span>
                </A>

                <A href="/sales/customers" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/sales/customers')}`}>
                    <Users size={22} />
                    <span class="text-[10px] font-medium">{t('salesApp.nav.customers')}</span>
                </A>

                <A href="/sales/menu" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/sales/menu')}`}>
                    <Menu size={22} />
                    <span class="text-[10px] font-medium">{t('salesApp.nav.menu')}</span>
                </A>
            </nav>
        </div>
    );
};

export default MobileSalesLayout;
