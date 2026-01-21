/**
 * Profile Tab Component
 * 
 * Displays and allows editing of customer profile and addresses.
 */

import { type Component, Show, For, createSignal } from 'solid-js';
import { Edit3, Save, Plus, Trash2, Pencil, MessageCircle, Loader2 } from 'lucide-solid';
import type { CustomerProfile, Address } from '../../../types/customer-portal';
import { useI18n } from '../../../i18n';

interface ProfileTabProps {
    profile: CustomerProfile | null;
    addresses: Address[];
    onSaveProfile: (updates: { email: string; address: string }) => Promise<void>;
    onAddAddress: () => void;
    onEditAddress: (address: Address) => void;
    onSetDefaultAddress: (id: string) => void;
    onDeleteAddress: (id: string) => void;
}

const ProfileTab: Component<ProfileTabProps> = (props) => {
    const { t } = useI18n();
    const [editingProfile, setEditingProfile] = createSignal(false);
    const [editForm, setEditForm] = createSignal({
        email: props.profile?.email || '',
        address: props.profile?.address || ''
    });
    const [savingProfile, setSavingProfile] = createSignal(false);

    const handleSaveProfile = async () => {
        setSavingProfile(true);
        await props.onSaveProfile(editForm());
        setEditingProfile(false);
        setSavingProfile(false);
    };

    return (
        <>
            <div class="profile-card">
                <Show when={!editingProfile()}>
                    <div class="profile-row"><label>{t('profile.name')}</label><span>{props.profile?.name}</span></div>
                    <div class="profile-row"><label>{t('profile.phone')}</label><span>{props.profile?.phone}</span></div>
                    <Show when={props.profile?.email}>
                        <div class="profile-row"><label>{t('profile.email')}</label><span>{props.profile?.email}</span></div>
                    </Show>
                    <Show when={props.profile?.address}>
                        <div class="profile-row"><label>{t('profile.address')}</label><span>{props.profile?.address}</span></div>
                    </Show>
                    <button class="btn-primary mt-1" onClick={() => setEditingProfile(true)}>
                        <Edit3 size={18} /> {t('profile.edit')}
                    </button>
                </Show>
                <Show when={editingProfile()}>
                    <div class="profile-row editable">
                        <label>{t('profile.email')}</label>
                        <input type="email" value={editForm().email} onInput={(e) => setEditForm({ ...editForm(), email: e.currentTarget.value })} />
                    </div>
                    <div class="profile-row editable">
                        <label>{t('profile.address')}</label>
                        <input value={editForm().address} onInput={(e) => setEditForm({ ...editForm(), address: e.currentTarget.value })} />
                    </div>
                    <div class="btn-row">
                        <button class="btn-secondary flex-1" onClick={() => setEditingProfile(false)}>{t('profile.cancel')}</button>
                        <button class="btn-primary flex-1" onClick={handleSaveProfile} disabled={savingProfile()}>
                            <Show when={savingProfile()} fallback={<><Save size={18} /> {t('profile.save')}</>}>
                                <Loader2 size={18} class="spin" />
                            </Show>
                        </button>
                    </div>
                </Show>
            </div>

            <div class="address-book-section mt-1-5">
                <div class="section-header">
                    <h3 class="section-heading">{t('profile.addresses')}</h3>
                    <button class="btn-sm" onClick={props.onAddAddress}>
                        <Plus size={16} /> {t('profile.addAddress')}
                    </button>
                </div>

                <Show when={props.addresses.length === 0}>
                    <div class="empty-state-text">
                        <p>{t('profile.noAddresses')}</p>
                    </div>
                </Show>

                <div class="address-list">
                    <For each={props.addresses}>{(addr) => (
                        <div class="address-card">
                            <div class="address-card-header">
                                <strong>{addr.name}</strong>
                                <div class="address-card-actions">
                                    <button class="btn-edit-address" onClick={() => props.onEditAddress(addr)} title={t('profile.edit') as string}>
                                        <Pencil size={14} />
                                    </button>
                                    <Show when={!addr.isDefault}>
                                        <button
                                            class="btn-icon-sm text-success"
                                            onClick={() => props.onSetDefaultAddress(addr.id)}
                                            title={t('profile.setAsDefault') as string}
                                        >
                                            ★
                                        </button>
                                    </Show>
                                    <button class="btn-icon-sm" onClick={() => props.onDeleteAddress(addr.id)}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <p>{addr.address}</p>
                            <Show when={addr.isDefault}><span class="badge badge-success">{t('profile.default')}</span></Show>
                        </div>
                    )}</For>
                </div>
            </div>

            <div class="support-card mt-1-5">
                <h3><MessageCircle size={18} /> {t('profile.support')}</h3>
                <Show when={props.profile?.tenant?.telegramBotUsername}>
                    <a href={`https://t.me/${props.profile?.tenant?.telegramBotUsername}`} target="_blank" class="btn-telegram">
                        <MessageCircle size={18} /> Telegram Support
                    </a>
                </Show>
                <Show when={!props.profile?.tenant?.telegramBotUsername}>
                    <div class="text-muted">
                        <Show when={props.profile?.tenant?.phone}>
                            <p>📞 {props.profile?.tenant?.phone}</p>
                        </Show>
                        <Show when={props.profile?.tenant?.email}>
                            <p>📧 {props.profile?.tenant?.email}</p>
                        </Show>
                        <Show when={!props.profile?.tenant?.phone && !props.profile?.tenant?.email}>
                            <p>{t('profile.noContact')}</p>
                        </Show>
                    </div>
                </Show>
            </div>
        </>
    );
};

export default ProfileTab;
