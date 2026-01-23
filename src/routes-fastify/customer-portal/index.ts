/**
 * Customer Portal Routes - Main Entry Point (Fastify)
 * 
 * Combines all customer portal sub-routes with /customer-portal prefix.
 * Split from monolithic file for better maintainability.
 */

import { FastifyPluginAsync } from 'fastify';
import { customerAuthPlugin } from './middleware';
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

export const customerPortalRoutes: FastifyPluginAsync = async (fastify) => {
    // Register customer auth plugin first
    await fastify.register(customerAuthPlugin);

    // Register all route modules
    await fastify.register(authRoutes);
    await fastify.register(profileRoutes);
    await fastify.register(ordersRoutes);
    await fastify.register(productsRoutes);
    await fastify.register(favoritesRoutes);
    await fastify.register(addressesRoutes);
    await fastify.register(cartRoutes);
    await fastify.register(paymentsRoutes);
    await fastify.register(brandingRoutes);
    await fastify.register(reorderRoutes);
    await fastify.register(discountRoutes);
    await fastify.register(reviewsRoutes);
};
