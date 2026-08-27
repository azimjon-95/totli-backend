import { Router } from 'express';
import { getCart, addItem, updateItem, removeItem, clearCart } from './cart.controller.js';
import { requireCustomerAuth } from '../../middleware/auth.js';

const router = Router();
router.use(requireCustomerAuth);
router.get('/', getCart);
router.post('/items', addItem);
router.patch('/items/:productId', updateItem);
router.delete('/items/:productId', removeItem);
router.delete('/', clearCart);

export default router;
