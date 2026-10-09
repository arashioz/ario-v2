import { api } from './api';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/** Public URL of a stored product photo (no auth needed, so it works in <img> and the catalog). */
export const productImageUrl = (file?: string) =>
  file ? `${API_BASE_URL}/public/products/images/${encodeURIComponent(file)}` : '';

export type CatalogTier = 'retail' | 'supermarket' | 'wholesale';

export interface CatalogProduct {
  _id: string;
  name: string;
  category: string;
  subcategory: string;
  unit: string;
  weightPerUnitKg: number;
  price: number;
  pricePerKg: number;
  inStock: boolean;
  image: string;
  updatedAt: string;
}

export interface Catalog {
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  tier: CatalogTier;
  generatedAt: string;
  categoryOrder?: string[];
  products: CatalogProduct[];
}

export interface PriceHistoryItem {
  oldPrice: number;
  newPrice: number;
  reason: string;
  changedByName: string;
  date: string;
}

export interface Product {
  _id: string;
  name: string;
  barcode?: string;
  category: string;
  subcategory?: string;
  supplierName?: string;
  unit: string;
  hasDualUnit?: boolean;
  secondaryUnit?: string;
  unitRatio?: number;
  weightPerUnitKg?: number;
  sellBy?: 'stock' | 'kg' | 'other';
  saleUnit?: string;
  salePerStock?: number;
  buyPrice: number;
  sellPrice: number;
  priceRetail?: number;
  priceSupermarket?: number;
  priceWholesale?: number;
  stock: number;
  minStockAlert: number;
  priceHistory: PriceHistoryItem[];
  description?: string;
  image?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductStats {
  totalProducts: number;
  lowStockCount: number;
  totalStockUnits: number;
  inventoryBuyValue: number;
  inventorySellValue: number;
  totalWeightKg: number;
  totalTonnage: number;
  categories: string[];
}

export interface CreateProductInput {
  name: string;
  barcode?: string;
  category?: string;
  subcategory?: string;
  supplierName?: string;
  unit?: string;
  hasDualUnit?: boolean;
  secondaryUnit?: string;
  unitRatio?: number;
  weightPerUnitKg?: number;
  sellBy?: 'stock' | 'kg' | 'other';
  saleUnit?: string;
  salePerStock?: number;
  buyPrice?: number;
  sellPrice: number;
  priceRetail?: number;
  priceSupermarket?: number;
  priceWholesale?: number;
  stock?: number;
  minStockAlert?: number;
  description?: string;
}

export interface UpdatePriceInput {
  newSellPrice: number;
  newBuyPrice?: number;
  priceSupermarket?: number;
  priceWholesale?: number;
  reason?: string;
}

export interface UpdateStockInput {
  quantityChange: number;
  reason?: string;
}

export interface BulkPriceUpdateInput {
  category?: string;
  type: 'percentage' | 'fixed' | 'profit';
  value: number;
  reason?: string;
  preview?: boolean;
  /** 1 = exact toman, otherwise round to 10 / 100 / 1000 / 10000. */
  roundTo?: 1 | 10 | 100 | 1000 | 10000;
}

export interface BulkPricePreviewItem {
  name: string;
  unit: string;
  buy: number;
  stock: number;
  before: number;
  after: number;
  beforeSupermarket: number;
  afterSupermarket: number;
  beforeWholesale: number;
  afterWholesale: number;
  profitBefore: number;
  profitAfter: number;
  skipped?: string;
}

export const productsService = {
  async getProducts(params?: {
    search?: string;
    category?: string;
    lowStockOnly?: boolean;
  }): Promise<Product[]> {
    const res = await api.get('/products', { params });
    return res.data;
  },

  getAll(params?: {
    search?: string;
    category?: string;
    lowStockOnly?: boolean;
  }): Promise<Product[]> {
    return this.getProducts(params);
  },

  getStats(): Promise<ProductStats> {
    return this.getProductStats();
  },

  create(data: CreateProductInput): Promise<Product> {
    return this.createProduct(data);
  },

  update(id: string, data: Partial<CreateProductInput>): Promise<Product> {
    return this.updateProduct(id, data);
  },

  async getProductStats(): Promise<ProductStats> {
    const res = await api.get('/products/stats');
    return res.data;
  },

  async getProduct(id: string): Promise<Product> {
    const res = await api.get(`/products/${id}`);
    return res.data;
  },

  async createProduct(data: CreateProductInput): Promise<Product> {
    const res = await api.post('/products', data);
    return res.data;
  },

  async updateProduct(id: string, data: Partial<CreateProductInput>): Promise<Product> {
    const res = await api.patch(`/products/${id}`, data);
    return res.data;
  },

  async updatePrice(id: string, data: UpdatePriceInput): Promise<Product> {
    const res = await api.patch(`/products/${id}/price`, data);
    return res.data;
  },

  async updateStock(id: string, data: UpdateStockInput): Promise<Product> {
    const res = await api.patch(`/products/${id}/stock`, data);
    return res.data;
  },

  async bulkUpdatePrices(data: BulkPriceUpdateInput): Promise<{ modifiedCount: number; message: string }> {
    const res = await api.post('/products/bulk-price', data);
    return res.data;
  },

  async previewBulkPrices(data: BulkPriceUpdateInput): Promise<BulkPricePreviewItem[]> {
    const res = await api.post('/products/bulk-price', { ...data, preview: true });
    return res.data.items ?? [];
  },

  async renameCategory(from: string, to: string, level: 'category' | 'subcategory' = 'category', parent?: string): Promise<{ modified: number }> {
    const res = await api.patch('/products/categories/rename', { from, to, level, parent });
    return res.data;
  },

  async deleteProduct(id: string): Promise<{ message: string }> {
    const res = await api.delete(`/products/${id}`);
    return res.data;
  },

  async uploadImage(id: string, image: Blob): Promise<Product> {
    const form = new FormData();
    form.append('file', image, 'product.jpg');
    const res = await api.post(`/products/${id}/image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    return res.data;
  },

  async removeImage(id: string): Promise<Product> {
    const res = await api.delete(`/products/${id}/image`);
    return res.data;
  },

  async applyStockCount(lines: { productId: string; countedQty: number }[]): Promise<{
    changed: number;
    lines: { productId: string; name: string; unit: string; systemQty: number; countedQty: number; delta: number }[];
  }> {
    const res = await api.post('/products/stock-count', { lines });
    return res.data;
  },

  /** Public — no login needed. */
  async getCatalog(tier: CatalogTier = 'retail'): Promise<Catalog> {
    const res = await api.get('/public/catalog', { params: { tier } });
    return res.data;
  },
};
