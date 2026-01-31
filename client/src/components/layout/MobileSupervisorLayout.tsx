import { type Component } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { LayoutDashboard, CheckCircle2, Users, BarChart3 } from 'lucide-solid';

const MobileSupervisorLayout: Component<{ children: any }> = (props) => {
    const location = useLocation();

    const activeClass = (path: string, exact = false) => {
        const isActive = exact
            ? location.pathname === path
            : location.pathname === path || location.pathname.startsWith(path + '/');
        return isActive
            ? 'text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]'
            : 'text-slate-500 hover:text-slate-400';
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-20">
            <main>
                {props.children}
            </main>

            <nav class="fixed bottom-0 left-0 right-0 h-16 bg-slate-900/80 backdrop-blur-md border-t border-slate-800/50 flex items-center justify-around px-2 z-50 pb-safe">
                <A href="/supervisor" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/supervisor', true)}`}>
                    <LayoutDashboard size={22} />
                    <span class="text-[10px] font-medium">Overview</span>
                </A>

                <A href="/supervisor/approvals" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/supervisor/approvals')}`}>
                    <CheckCircle2 size={22} />
                    <span class="text-[10px] font-medium">Approvals</span>
                </A>

                <A href="/supervisor/team" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/supervisor/team')}`}>
                    <Users size={22} />
                    <span class="text-[10px] font-medium">Team</span>
                </A>

                <A href="/supervisor/insights" class={`flex flex-col items-center gap-1 p-2 transition-all ${activeClass('/supervisor/insights')}`}>
                    <BarChart3 size={22} />
                    <span class="text-[10px] font-medium">Insights</span>
                </A>
            </nav>
        </div>
    );
};

export default MobileSupervisorLayout;
