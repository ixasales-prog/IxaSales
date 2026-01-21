/**
 * Product Review Component
 * 
 * Displays product reviews and allows customers to submit reviews.
 */

import { type Component, createSignal, Show, For } from 'solid-js';
import { Star, Send, Loader2 } from 'lucide-solid';
import { useI18n } from '../i18n';
import { formatDate } from '../stores/settings';

interface Review {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    customerName: string;
}

interface ReviewStats {
    avgRating: number;
    totalReviews: number;
    distribution: Record<number, number>;
}

interface ProductReviewsProps {
    productId: string;
    reviews: Review[];
    stats: ReviewStats;
    canReview: boolean;
    onSubmitReview: (rating: number, comment: string) => Promise<void>;
}

const ProductReviews: Component<ProductReviewsProps> = (props) => {
    const { t } = useI18n();
    const [showForm, setShowForm] = createSignal(false);
    const [rating, setRating] = createSignal(0);
    const [hoverRating, setHoverRating] = createSignal(0);
    const [comment, setComment] = createSignal('');
    const [submitting, setSubmitting] = createSignal(false);

    const displayRating = () => hoverRating() || rating();

    const handleSubmit = async () => {
        if (rating() === 0) return;

        setSubmitting(true);
        try {
            await props.onSubmitReview(rating(), comment());
            setShowForm(false);
            setRating(0);
            setComment('');
        } finally {
            setSubmitting(false);
        }
    };

    // Using shared formatDate from settings store

    const renderStars = (count: number, size: number = 16, filled: boolean = true) => {
        return (
            <div class="stars-row">
                {Array.from({ length: 5 }, (_, i) => (
                    <Star
                        size={size}
                        class={`star ${i < count ? (filled ? 'filled' : 'half') : 'empty'}`}
                        fill={i < count ? 'currentColor' : 'none'}
                    />
                ))}
            </div>
        );
    };

    return (
        <div class="product-reviews">
            {/* Rating Summary */}
            <div class="reviews-summary">
                <div class="rating-big">
                    <span class="rating-value">{props.stats.avgRating.toFixed(1)}</span>
                    {renderStars(Math.round(props.stats.avgRating), 20)}
                    <span class="rating-count">
                        ({props.stats.totalReviews} {t('reviews.reviewCount')})
                    </span>
                </div>

                {/* Rating Distribution */}
                <div class="rating-bars">
                    <For each={[5, 4, 3, 2, 1]}>{(star) => {
                        const count = props.stats.distribution[star] || 0;
                        const percentage = props.stats.totalReviews > 0
                            ? (count / props.stats.totalReviews) * 100
                            : 0;
                        return (
                            <div class="rating-bar">
                                <span class="bar-label">{star}</span>
                                <Star size={12} fill="currentColor" class="bar-star" />
                                <div class="bar-track">
                                    <div class="bar-fill" style={{ width: `${percentage}%` }} />
                                </div>
                                <span class="bar-count">{count}</span>
                            </div>
                        );
                    }}</For>
                </div>
            </div>

            {/* Write Review Button/Form */}
            <Show when={props.canReview}>
                <Show when={!showForm()} fallback={
                    <div class="review-form">
                        <h4>{t('reviews.writeReview')}</h4>

                        <div class="rating-picker">
                            <span>{t('reviews.yourRating')}:</span>
                            <div class="stars-interactive">
                                <For each={[1, 2, 3, 4, 5]}>{(star) => (
                                    <button
                                        type="button"
                                        class={`star-btn ${star <= displayRating() ? 'active' : ''}`}
                                        onClick={() => setRating(star)}
                                        onMouseEnter={() => setHoverRating(star)}
                                        onMouseLeave={() => setHoverRating(0)}
                                    >
                                        <Star size={28} fill={star <= displayRating() ? 'currentColor' : 'none'} />
                                    </button>
                                )}</For>
                            </div>
                        </div>

                        <textarea
                            class="review-textarea"
                            placeholder={t('reviews.commentPlaceholder') as string}
                            value={comment()}
                            onInput={(e) => setComment(e.currentTarget.value)}
                            rows={3}
                        />

                        <div class="review-form-actions">
                            <button type="button" class="btn-secondary" onClick={() => setShowForm(false)}>
                                {t('actions.cancel')}
                            </button>
                            <button
                                type="button"
                                class="btn-primary"
                                onClick={handleSubmit}
                                disabled={rating() === 0 || submitting()}
                            >
                                <Show when={submitting()} fallback={<><Send size={16} /> {t('reviews.submit')}</>}>
                                    <Loader2 size={16} class="spin" />
                                </Show>
                            </button>
                        </div>
                    </div>
                }>
                    <button class="btn-write-review" onClick={() => setShowForm(true)}>
                        <Star size={18} /> {t('reviews.writeReview')}
                    </button>
                </Show>
            </Show>

            {/* Reviews List */}
            <div class="reviews-list">
                <Show when={props.reviews.length === 0}>
                    <div class="no-reviews">
                        <Star size={24} />
                        <p>{t('reviews.noReviews')}</p>
                    </div>
                </Show>

                <For each={props.reviews}>{(review) => (
                    <div class="review-card">
                        <div class="review-header">
                            <div class="review-author">{review.customerName}</div>
                            <div class="review-date">{formatDate(review.createdAt)}</div>
                        </div>
                        <div class="review-rating">
                            {renderStars(review.rating, 14)}
                        </div>
                        <Show when={review.comment}>
                            <p class="review-comment">{review.comment}</p>
                        </Show>
                    </div>
                )}</For>
            </div>
        </div>
    );
};

export default ProductReviews;
