/**
 * Customer Portal Routes - Main Entry Point
 * 
 * Combines all customer portal sub-routes with /customer-portal prefix.
 * Split from monolithic file for better maintainability.
 */

import { Elysia } from 'elysia';
import { authRoutes } from './auth';
import { profileRoutes } from './profile';
import { ordersRoutes } from './orders';
import { productsRoutes } from './products';
import { favoritesRoutes } from './favorites';
import { addressesRoutes } from './addresses';
import { cartRoutes } from './cart';
import { paymentsRoutes } from './payments';
import { brandingRoutes } from './branding';
import { reorderRoutes } from './reorder';
import { discountRoutes } from './discounts';
import { reviewsRoutes } from './reviews';
import { customerPortalLoggerPlugin } from '../../lib/request-logger';

export const customerPortalRoutes = new Elysia({ prefix: '/customer-portal' })
    .use(customerPortalLoggerPlugin)
    .use(authRoutes)
    .use(profileRoutes)
    .use(ordersRoutes)
    .use(productsRoutes)
    .use(favoritesRoutes)
    .use(addressesRoutes)
    .use(cartRoutes)
    .use(paymentsRoutes)
    .use(brandingRoutes)
    .use(reorderRoutes)
    .use(discountRoutes)
    .use(reviewsRoutes);
