/**
 * Address Modal Component
 * 
 * Modal for adding or editing addresses.
 */

import { type Component, createSignal, Show, onMount } from 'solid-js';
import { X, MapPin, Save, Loader2 } from 'lucide-solid';
import type { Address } from '../types/customer-portal';
import { useI18n } from '../i18n';

interface AddressModalProps {
    address?: Address | null;  // If provided, we're editing
    onSave: (address: { name: string; address: string; isDefault: boolean }) => Promise<void>;
    onClose: () => void;
}

const AddressModal: Component<AddressModalProps> = (props) => {
    const { t } = useI18n();
    const [name, setName] = createSignal('');
    const [address, setAddress] = createSignal('');
    const [isDefault, setIsDefault] = createSignal(false);
    const [saving, setSaving] = createSignal(false);

    const isEditing = () => !!props.address;

    onMount(() => {
        if (props.address) {
            setName(props.address.name);
            setAddress(props.address.address);
            setIsDefault(props.address.isDefault);
        }
    });

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!name().trim() || !address().trim()) return;

        setSaving(true);
        try {
            await props.onSave({
                name: name().trim(),
                address: address().trim(),
                isDefault: isDefault()
            });
            props.onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div class="modal-overlay" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
            <div class="address-modal">
                <div class="address-modal-header">
                    <div class="address-modal-icon">
                        <MapPin size={24} />
                    </div>
                    <h2>{isEditing() ? t('profile.editAddress') : t('profile.addAddress')}</h2>
                    <button class="btn-icon" onClick={props.onClose}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} class="address-modal-form">
                    <div class="form-group">
                        <label>{t('modals.addressName')}</label>
                        <input
                            type="text"
                            value={name()}
                            onInput={(e) => setName(e.currentTarget.value)}
                            placeholder={t('modals.addressNamePlaceholder') as string}
                            required
                        />
                    </div>

                    <div class="form-group">
                        <label>{t('modals.fullAddress')}</label>
                        <textarea
                            value={address()}
                            onInput={(e) => setAddress(e.currentTarget.value)}
                            placeholder={t('modals.addressPlaceholder') as string}
                            rows={3}
                            required
                        />
                    </div>

                    <label class="checkbox-label">
                        <input
                            type="checkbox"
                            checked={isDefault()}
                            onChange={(e) => setIsDefault(e.currentTarget.checked)}
                        />
                        <span>{t('modals.setAsDefault')}</span>
                    </label>

                    <div class="address-modal-actions">
                        <button type="button" class="btn-secondary" onClick={props.onClose}>
                            {t('profile.cancel')}
                        </button>
                        <button type="submit" class="btn-primary" disabled={saving() || !name().trim() || !address().trim()}>
                            <Show when={saving()} fallback={<><Save size={18} /> {t('profile.save')}</>}>
                                <Loader2 size={18} class="spin" />
                            </Show>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddressModal;
