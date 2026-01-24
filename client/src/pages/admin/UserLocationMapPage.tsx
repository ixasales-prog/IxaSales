/**
 * User Location Map Page
 * 
 * Full-page map view showing all tracked users for supervisors/admins.
 */

import { type Component } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowLeft } from 'lucide-solid';
import UserLocationMap from '../../components/gps-tracking/UserLocationMap';

const UserLocationMapPage: Component = () => {
    return (
        <div class="min-h-screen bg-slate-950 text-white">
            {/* Header */}
            <div class="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-6 py-4">
                <div class="flex items-center gap-4">
                    <A href="/admin/gps-tracking" class="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                        <ArrowLeft class="w-5 h-5" />
                    </A>
                    <div>
                        <h1 class="text-xl font-bold">User Locations</h1>
                        <p class="text-slate-400 text-sm">Real-time GPS tracking map</p>
                    </div>
                </div>
            </div>

            {/* Map */}
            <div class="h-[calc(100vh-80px)]">
                <UserLocationMap />
            </div>
        </div>
    );
};

export default UserLocationMapPage;
