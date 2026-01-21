import { type Component, createResource, Show } from 'solid-js';
import { Info, AlertTriangle, AlertOctagon } from 'lucide-solid';
import { currentUser } from '../../stores/auth';

interface AnnouncementSettings {
    enabled: boolean;
    message: string;
    type: 'info' | 'warning' | 'critical';
    targetRoles?: string[];
}

const AnnouncementBanner: Component = () => {
    const [announcement] = createResource(async () => {
        try {
            const response = await fetch('/api/announcement');
            if (!response.ok) return null;
            const data = await response.json();
            return data.data as AnnouncementSettings | null;
        } catch {
            return null;
        }
    });

    // ... existing typeConfig ...

    const typeConfig = {
        info: {
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/30',
            text: 'text-blue-400',
            Icon: Info
        },
        warning: {
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/30',
            text: 'text-amber-400',
            Icon: AlertTriangle
        },
        critical: {
            bg: 'bg-red-500/10',
            border: 'border-red-500/30',
            text: 'text-red-400',
            Icon: AlertOctagon
        },
    };

    const ann = () => announcement();

    // Check visibility based on role
    const isVisible = () => {
        const a = ann();
        if (!a || !a.enabled || !a.message) return false;

        // If no specific roles targeted, show to everyone
        if (!a.targetRoles || a.targetRoles.length === 0) return true;

        // Otherwise check if current user has one of the target roles
        const user = currentUser();
        if (!user) return false; // Guest can't see role-restricted announcements

        return a.targetRoles.includes(user.role);
    };

    const getConfig = () => {
        const a = ann();
        if (!a) return typeConfig.info;
        return typeConfig[a.type] || typeConfig.info;
    };

    return (
        <Show when={isVisible()}>
            <div class={`px-4 py-2 ${getConfig().bg} ${getConfig().border} border-b`}>
                <div class={`flex items-center gap-2 ${getConfig().text} text-sm`}>
                    {(() => { const Config = getConfig(); return <Config.Icon class="w-4 h-4 flex-shrink-0" />; })()}
                    <span class="flex-1">{ann()?.message}</span>
                </div>
            </div>
        </Show>
    );
};

export default AnnouncementBanner;
