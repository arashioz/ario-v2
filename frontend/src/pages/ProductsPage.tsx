import React, { useState, useEffect, useCallback } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  useIonViewWillEnter,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { productsService } from '../services/products.service';
import type { Product, ProductStats } from '../services/products.service';
import { UpdatePriceModal } from '../components/products/UpdatePriceModal';
import { UpdateStockModal } from '../components/products/UpdateStockModal';
import { NewProductModal } from '../components/products/NewProductModal';
import { BulkPriceModal } from '../components/products/BulkPriceModal';
import {
  Search,
  Plus,
  Tag,
  Boxes,
  AlertTriangle,
  RefreshCw,
  Barcode,
  ArrowRight,
  TrendingUp,
  Sliders,
  Edit2,
  Trash2,
  BookOpen,
} from 'lucide-react';
import { formatToman, num, weight } from '../lib/format';
import { PriceTiers, ProductPhoto, StockAmount } from '../components/products/ProductPriceInfo';
import { CatalogShareSheet } from '../components/products/CatalogShareSheet';
import { kgPerUnit, pricePerKg, tierPrice } from '../components/pos/cart';

export const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [lowStockFilter, setLowStockFilter] = useState<boolean>(false);

  // Modals state
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [selectedProductForPrice, setSelectedProductForPrice] = useState<Product | null>(null);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

  const [selectedProductForStock, setSelectedProductForStock] = useState<Product | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);

  const [isBulkPriceOpen, setIsBulkPriceOpen] = useState(false);
  const [priceBy, setPriceBy] = useState<'unit' | 'kg'>('unit');
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  const replaceProduct = (updated: Product) =>
    setProducts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));

  const loadData = useCallback(async () => {
    try {
      const [list, statsData] = await Promise.all([
        productsService.getProducts({
          search,
          category: selectedCategory,
          lowStockOnly: lowStockFilter,
        }),
        productsService.getProductStats(),
      ]);
      setProducts(list);
      setStats(statsData);
    } catch {
      showNotification({
        title: 'خطا در بارگذاری',
        message: 'امکان دریافت لیست محصولات وجود ندارد',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory, lowStockFilter, showNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);
  useIonViewWillEnter(() => {
    loadData();
  });

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await loadData();
    e.detail.complete();
  };

  const handleProductSaved = () => {
    loadData();
    setEditingProduct(null);
  };

  const handlePriceUpdated = (updated: Product) => {
    setProducts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
    loadData();
  };

  const handleStockUpdated = (updated: Product) => {
    setProducts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
    loadData();
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`آیا از حذف کالای «${product.name}» مطمئن هستید؟`)) {
      return;
    }

    try {
      await productsService.deleteProduct(product._id);
      showNotification({
        title: 'حذف شد',
        message: 'کالا با موفقیت از سیستم حذف گردید',
        type: 'info',
      });
      loadData();
    } catch {
      showNotification({
        title: 'خطا در حذف',
        message: 'عملیات با خطا مواجه شد',
        type: 'error',
      });
    }
  };

  const openPriceModal = (product: Product) => {
    setSelectedProductForPrice(product);
    setIsPriceModalOpen(true);
  };

  const openStockModal = (product: Product) => {
    setSelectedProductForStock(product);
    setIsStockModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setIsNewProductOpen(true);
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/90 backdrop-blur-md px-3 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-2xl bg-sky-50 text-sky-700 hover:bg-sky-100 transition active:scale-95"
                title="بازگشت"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-sm font-bold text-slate-800">کالاها</h1>
                <p className="text-[10px] text-slate-400 font-normal">ویرایش، قیمت و موجودی</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => loadData()}
                className="p-2 rounded-2xl bg-sky-50 text-sky-600 hover:bg-sky-100 transition active:scale-95"
                title="به‌روزرسانی"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => {
                  setEditingProduct(null);
                  setIsNewProductOpen(true);
                }}
                className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-md shadow-sky-400/20 active:scale-95 transition"
              >
                <Plus className="w-4 h-4" />
                <span>کالای جدید</span>
              </button>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3 space-y-3 max-w-md mx-auto pb-8">
          {/* Top Inventory & Price Stats Banner */}
          <div className="bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 rounded-2xl p-3 text-white shadow-xl shadow-sky-400/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-sky-100 block">ارزش فروش کل انبار:</span>
                <span className="text-base font-bold block mt-0.5">
                  {stats ? formatToman(stats.inventorySellValue) : '...'}
                </span>
              </div>

              <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-2xl text-center">
                <span className="text-[10px] text-sky-100 block">تعداد اقلام</span>
                <span className="text-sm font-bold">{stats ? stats.totalProducts : 0} کالا</span>
              </div>
            </div>

            <div className="pt-2 border-t border-white/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 text-sky-100">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>
                  کل موجودی: {stats ? num(stats.totalStockUnits) : 0} واحد
                  {stats && stats.totalWeightKg > 0 && ` · ${weight(stats.totalWeightKg)}`}
                </span>
              </div>

              {stats && stats.lowStockCount > 0 && (
                <button
                  onClick={() => setLowStockFilter(!lowStockFilter)}
                  className="flex items-center gap-1 bg-amber-400 text-amber-950 px-2.5 py-0.5 rounded-full font-bold text-[11px] shadow-sm animate-pulse"
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>{stats.lowStockCount} قلم رو به اتمام!</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setIsCatalogOpen(true)}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-white border border-emerald-100 text-emerald-800 text-xs font-bold active:scale-[0.98]"
            >
              <BookOpen className="w-4 h-4" />
              کاتالوگ
            </button>
            <button
              onClick={() => setIsBulkPriceOpen(true)}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-white border border-violet-100 text-violet-800 text-xs font-bold active:scale-[0.98]"
            >
              <Sliders className="w-4 h-4" />
              قیمت گروهی
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 p-1 bg-white rounded-2xl border border-slate-200">
            {(
              [
                ['unit', 'قیمت بسته'],
                ['kg', 'قیمت کیلو'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPriceBy(id)}
                className={`py-2 rounded-xl text-[11px] font-bold ${priceBy === id ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative flex items-center">
            <div className="absolute right-3.5 text-slate-400 pointer-events-none">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نام، بارکد یا دسته کالا..."
              className="w-full pl-4 pr-10 py-2.5 text-xs rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition text-slate-800 shadow-sm"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => {
                setSelectedCategory('all');
                setLowStockFilter(false);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                selectedCategory === 'all' && !lowStockFilter
                  ? 'bg-sky-500 text-white shadow-sm shadow-sky-400/30'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              همه ({stats ? stats.totalProducts : products.length})
            </button>

            <button
              onClick={() => setLowStockFilter(!lowStockFilter)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 whitespace-nowrap ${
                lowStockFilter
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-400/30'
                  : 'bg-white text-amber-700 border border-amber-200'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>کسری انبار ({stats ? stats.lowStockCount : 0})</span>
            </button>

            {stats?.categories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  setLowStockFilter(false);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  selectedCategory === cat && !lowStockFilter
                    ? 'bg-sky-500 text-white shadow-sm shadow-sky-400/30'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Products List */}
          {loading && products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
              <div className="w-8 h-8 border-3 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
              <span className="text-xs">در حال بارگذاری لیست محصولات...</span>
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center border border-dashed border-sky-200 space-y-3">
              <Boxes className="w-10 h-10 text-sky-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">کالایی یافت نشد</h3>
              <p className="text-xs text-slate-400">
                می‌توانید محصول جدیدی با دکمه زیر به انبار اضافه فرمایید.
              </p>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setIsNewProductOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-400/20"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف کالای جدید</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {products.map((product) => {
                const isLowStock = product.stock <= (product.minStockAlert ?? 5);
                const margin = tierPrice(product, 'retail') - (product.buyPrice || 0);

                return (
                  <div
                    key={product._id}
                    className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-3"
                  >
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2">
                      <ProductPhoto product={product} size="w-20 h-20" editable onChanged={replaceProduct} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-100">
                            {product.category || 'عمومی'}
                          </span>
                          {product.barcode && (
                            <span
                              className="text-[10px] font-mono text-slate-400 flex items-center gap-0.5"
                              dir="ltr"
                            >
                              <Barcode className="w-3 h-3 text-slate-400" />
                              {product.barcode}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-slate-800 mt-1 leading-snug">
                          {product.name}
                        </h3>
                      </div>

                      <button
                        onClick={() => handleDelete(product)}
                        className="p-2 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                        title="حذف کالا"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Prices and Stock Grid */}
                    <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-100 space-y-2">
                      <PriceTiers product={product} by={priceBy} />
                      {kgPerUnit(product) > 0 && product.unit !== 'کیلوگرم' && (
                        <p className="text-[10px] text-slate-400">
                          هر {product.unit} {num(kgPerUnit(product), 2)} کیلوگرم
                        </p>
                      )}
                      <div className="flex items-end justify-between pt-2 border-t border-slate-200/80">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-normal">موجودی انبار:</span>
                          <span
                            className={`text-sm mt-0.5 inline-flex items-center gap-1 ${
                              isLowStock ? 'text-amber-600' : 'text-slate-800'
                            }`}
                          >
                            <StockAmount product={product} />
                            {isLowStock && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                          </span>
                        </div>
                        {product.buyPrice > 0 && (
                          <span className="text-[10px] text-emerald-600 font-normal text-left">
                            سود هر {product.unit}: {formatToman(margin)}
                            {kgPerUnit(product) > 0 && (
                              <span className="block">هر کیلو: {formatToman(pricePerKg(margin, product))}</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons Footer */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100">
                      <button
                        onClick={() => openEditModal(product)}
                        className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-slate-50 text-slate-700 text-[11px] font-bold active:scale-95 border border-slate-100"
                      >
                        <Edit2 className="w-4 h-4 text-slate-500" />
                        ویرایش
                      </button>
                      <button
                        onClick={() => openPriceModal(product)}
                        className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-sky-600 text-white text-[11px] font-bold active:scale-95"
                      >
                        <Tag className="w-4 h-4" />
                        قیمت
                      </button>
                      <button
                        onClick={() => openStockModal(product)}
                        className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-slate-50 text-slate-700 text-[11px] font-bold active:scale-95 border border-slate-100"
                      >
                        <Boxes className="w-4 h-4 text-slate-500" />
                        موجودی
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modals */}
        <UpdatePriceModal
          isOpen={isPriceModalOpen}
          product={selectedProductForPrice}
          onClose={() => {
            setIsPriceModalOpen(false);
            setSelectedProductForPrice(null);
          }}
          onPriceUpdated={handlePriceUpdated}
        />

        <UpdateStockModal
          isOpen={isStockModalOpen}
          product={selectedProductForStock}
          onClose={() => {
            setIsStockModalOpen(false);
            setSelectedProductForStock(null);
          }}
          onStockUpdated={handleStockUpdated}
        />

        <NewProductModal
          isOpen={isNewProductOpen}
          editProduct={editingProduct}
          categories={stats?.categories || []}
          onClose={() => {
            setIsNewProductOpen(false);
            setEditingProduct(null);
          }}
          onProductSaved={handleProductSaved}
        />

        <BulkPriceModal
          isOpen={isBulkPriceOpen}
          categories={stats?.categories || []}
          onClose={() => setIsBulkPriceOpen(false)}
          onSuccess={() => loadData()}
        />

        <CatalogShareSheet open={isCatalogOpen} onClose={() => setIsCatalogOpen(false)} />
      </IonContent>
    </IonPage>
  );
};
