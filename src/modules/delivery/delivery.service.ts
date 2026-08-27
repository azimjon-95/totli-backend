import { env } from '../../config/env.js';
import { ValidationError } from '../../shared/errors.js';

/** Default distance bands (km) → price UZS — replaceable by admin zones later */
const DEFAULT_ZONES = [
  { name: 'near', minKm: 0, maxKm: 3, price: 15000 },
  { name: 'mid', minKm: 3, maxKm: 5, price: 20000 },
  { name: 'far', minKm: 5, maxKm: 10, price: 30000 },
];

export const DeliveryService = {
  validateCoordinates(lat?: number, lng?: number) {
    if (lat === undefined && lng === undefined) return;
    if (lat === undefined || lng === undefined) {
      throw new ValidationError('Both latitude and longitude required');
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new ValidationError('Invalid coordinates');
    }
  },

  /**
   * Calculate delivery fee. Distance optional — if missing uses base price.
   * Free delivery when order subtotal >= DELIVERY_FREE_FROM.
   */
  calculatePrice(params: {
    subtotal: number;
    distanceKm?: number;
  }): { deliveryFee: number; zone?: string; freeDelivery: boolean } {
    if (params.subtotal >= env.DELIVERY_FREE_FROM) {
      return { deliveryFee: 0, freeDelivery: true };
    }

    if (params.distanceKm == null || Number.isNaN(params.distanceKm)) {
      return {
        deliveryFee: env.DELIVERY_BASE_PRICE,
        zone: 'default',
        freeDelivery: false,
      };
    }

    const d = Math.max(0, params.distanceKm);
    const zone = DEFAULT_ZONES.find((z) => d >= z.minKm && d < z.maxKm);
    if (zone) {
      return { deliveryFee: zone.price, zone: zone.name, freeDelivery: false };
    }
    // Beyond max zone
    return {
      deliveryFee: DEFAULT_ZONES[DEFAULT_ZONES.length - 1].price + 10000,
      zone: 'outside',
      freeDelivery: false,
    };
  },

  getZones() {
    return DEFAULT_ZONES.map((z) => ({ ...z, isActive: true }));
  },
};
