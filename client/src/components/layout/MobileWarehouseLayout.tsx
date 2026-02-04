import { type Component } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { LayoutDashboard, ClipboardList, Boxes, Truck } from 'lucide-solid';
import { useI18n } from '../../i18n';

const MobileWarehouseLayout: Component<{ children: any }> = (props) => {
    const location = useLocation();
    const { t } = useI18n();

    const activeClass = (path: string, exact = false) => {
        const isActive = exact
            ? location.pathname === path
            : location.pathname === path || location.pathname.startsWith(path + '/');
        return isActive
            ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]'
            : 'text-slate-500 hover:text-slate-400';
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-20">
            <main>
                {props.children}
            </main>

            <nav class="fixed bottom-0 left-0 right-0 h-16 bg-slate-900/80 backdrop-blur-md border-t border-slate-800/50 flex items-center justify-around px-2 z-50 pb-safe">
                <A href="/warehouse" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/warehouse', true)}`}>
                    <LayoutDashboard size={22} />
                    <span class="text-[10px] font-medium">{t('warehouseApp.nav.overview')}</span>
                </A>

                <A href="/warehouse/tasks" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/warehouse/tasks')}`}>
                    <ClipboardList size={22} />
                    <span class="text-[10px] font-medium">{t('warehouseApp.nav.tasks')}</span>
                </A>

                <A href="/warehouse/inventory" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/warehouse/inventory')}`}>
                    <Boxes size={22} />
                    <span class="text-[10px] font-medium">{t('warehouseApp.nav.inventory')}</span>
                </A>

                <A href="/warehouse/receiving" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/warehouse/receiving')}`}>
                    <Truck size={22} />
                    <span class="text-[10px] font-medium">{t('warehouseApp.nav.receiving')}</span>
                </A>
            </nav>
        </div>
    );
};

export default MobileWarehouseLayout;
