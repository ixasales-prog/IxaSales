import { type Component } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { Truck, Package, User } from 'lucide-solid';
import AutoStartTracking from '../gps-tracking/AutoStartTracking';

const MobileDriverLayout: Component<{ children: any }> = (props) => {
    const location = useLocation();

    const activeClass = (path: string) =>
        location.pathname === path
            ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]'
            : 'text-slate-500 hover:text-slate-400';

    return (
        <div class="min-h-screen bg-slate-950 pb-20">
            <AutoStartTracking />
            <main>
                {props.children}
            </main>

            {/* Bottom Navigation */}
            <nav class="fixed bottom-0 left-0 right-0 h-16 bg-slate-900/80 backdrop-blur-md border-t border-slate-800/50 flex items-center justify-around px-2 z-50 pb-safe">
                <A href="/driver" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/driver')}`}>
                    <Truck size={24} />
                    <span class="text-[10px] font-medium">Trips</span>
                </A>

                <A href="/driver/deliveries" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/driver/deliveries')}`}>
                    <Package size={24} />
                    <span class="text-[10px] font-medium">Deliveries</span>
                </A>

                <A href="/driver/profile" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/driver/profile')}`}>
                    <User size={24} />
                    <span class="text-[10px] font-medium">Profile</span>
                </A>
            </nav>
        </div>
    );
};

export default MobileDriverLayout;
