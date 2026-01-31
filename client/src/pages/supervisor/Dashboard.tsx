import { type Component } from 'solid-js';
import { CheckCircle2, Users, AlertTriangle, BarChart3 } from 'lucide-solid';

const SupervisorDashboard: Component = () => (
    <div class="min-h-screen bg-slate-950 pb-24">
        <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
            <h1 class="text-xl font-bold text-white">Supervisor Overview</h1>
            <p class="text-slate-500 text-sm">Approvals, team activity, and risk alerts</p>
        </div>

        <div class="px-4 pt-4 space-y-4">
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3">
                    <div class="flex items-center gap-2 text-slate-400 text-xs">
                        <CheckCircle2 class="w-4 h-4 text-emerald-400" /> Pending Approvals
                    </div>
                    <div class="text-2xl font-semibold text-white mt-2">12</div>
                </div>
                <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3">
                    <div class="flex items-center gap-2 text-slate-400 text-xs">
                        <Users class="w-4 h-4 text-indigo-400" /> Active Reps
                    </div>
                    <div class="text-2xl font-semibold text-white mt-2">18</div>
                </div>
            </div>

            <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                <div class="flex items-center gap-2 mb-3">
                    <AlertTriangle class="w-5 h-5 text-amber-400" />
                    <h2 class="text-white font-semibold">Risk Alerts</h2>
                </div>
                <div class="space-y-2 text-sm text-slate-400">
                    <div class="flex justify-between">
                        <span>Overdue visits</span>
                        <span class="text-amber-400 font-semibold">7</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Rejected discounts</span>
                        <span class="text-amber-400 font-semibold">3</span>
                    </div>
                </div>
            </div>

            <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                <div class="flex items-center gap-2 mb-3">
                    <BarChart3 class="w-5 h-5 text-indigo-400" />
                    <h2 class="text-white font-semibold">Today’s Performance</h2>
                </div>
                <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="bg-slate-800/60 rounded-xl p-3">
                        <div class="text-slate-400">Orders</div>
                        <div class="text-lg font-semibold text-white">86</div>
                    </div>
                    <div class="bg-slate-800/60 rounded-xl p-3">
                        <div class="text-slate-400">Revenue</div>
                        <div class="text-lg font-semibold text-white">$24.6k</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

export default SupervisorDashboard;
