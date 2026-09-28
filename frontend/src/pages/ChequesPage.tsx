import React, { useState, useEffect } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonContent,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/react';
import {
  CreditCard,
  Plus,
  Search,
  RefreshCw,
  ArrowRight,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { chequesService } from '../services/cheques.service';
import type { Cheque, ChequeStats } from '../services/cheques.service';
import { useNotification } from '../context/NotificationContext';
import { NewChequeModal } from '../components/cheques/NewChequeModal';
import { ChequeDetailModal } from '../components/cheques/ChequeDetailModal';
import { formatToman } from '../lib/format';

export const ChequesPage: React.FC = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [stats, setStats] = useState<ChequeStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<
    'all' | 'received' | 'paid' | 'dueSoon' | 'bounced' | 'passed'
  >('all');

  const [selectedCheque, setSelectedCheque] = useState<Cheque | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newChequeDefaultType, setNewChequeDefaultType] = useState<'received' | 'paid'>('received');

  const loadData = async () => {
    try {
      setLoading(true);
      const [list, st] = await Promise.all([
        chequesService.getAll({
          dueSoon: activeTab === 'dueSoon' ? 'true' : undefined,
          type: activeTab === 'received' || activeTab === 'paid' ? activeTab : undefined,
          status: activeTab === 'bounced' || activeTab === 'passed' ? activeTab : undefined,
        }),
        chequesService.getStats(),
      ]);
      setCheques(list);
      setStats(st);
    } catch {
      showNotification({
        title: 'خطا در بارگذاری چک‌ها',
        message: 'امکان اتصال به سرور وجود ندارد.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleRefresh = async (event: CustomEvent) => {
    await loadData();
    event.detail.complete();
  };

  const getDaysRemaining = (dueDateIso: string) => {
    const due = new Date(dueDateIso).getTime();
    const today = new Date().setHours(0, 0, 0, 0);
    return Math.ceil((due - today) / (1000 * 3600 * 24));
  };

  const filteredCheques = cheques.filter((c) => {
    if (activeTab === 'received' && c.type !== 'received') return false;
    if (activeTab === 'paid' && c.type !== 'paid') return false;
    if (activeTab === 'bounced' && c.status !== 'bounced') return false;
    if (activeTab === 'passed' && c.status !== 'passed') return false;

    if (search.trim()) {
      const s = search.toLowerCase();
      return (
        c.chequeNumber.toLowerCase().includes(s) ||
        (c.sayadNumber && c.sayadNumber.includes(s)) ||
        c.partyName.toLowerCase().includes(s) ||
        c.bankName.toLowerCase().includes(s) ||
        (c.drawerName && c.drawerName.toLowerCase().includes(s))
      );
    }
    return true;
  });

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-4 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-2xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition active:scale-95"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-sm font-semibold text-slate-800">مدیریت چک‌های صیادی</h1>
                <p className="text-[10px] text-slate-400 font-normal">
                  ثبت چک‌های دریافتی، پرداختی و هشدار سررسید
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={loadData}
                className="p-2 rounded-2xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition active:scale-95"
                title="تازه‌سازی"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => {
                  setNewChequeDefaultType(activeTab === 'paid' ? 'paid' : 'received');
                  setIsNewModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-md shadow-purple-500/20 active:scale-95 transition"
              >
                <Plus className="w-4 h-4" />
                <span>ثبت چک جدید</span>
              </button>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="p-3 space-y-3 max-w-lg mx-auto pb-8">
          {/* Summary Dashboard Cards */}
          {stats && (
            <div className="grid grid-cols-2 gap-2.5">
              {/* Received Pending */}
              <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-3 text-white shadow-md shadow-purple-500/20 space-y-1">
                <div className="flex items-center justify-between text-purple-200">
                  <span className="text-[11px] font-medium">چک‌های دریافتی</span>
                  <ArrowDownLeft className="w-4 h-4 text-purple-200" />
                </div>
                <div className="text-base font-bold font-mono">
                  {formatToman(stats.pendingReceivedAmount)}
                </div>
                <div className="flex items-center justify-between text-[10px] text-purple-200 pt-1 border-t border-white/20">
                  <span>در جریان وصول</span>
                  <span>{stats.pendingReceivedCount} فقره چک</span>
                </div>
              </div>

              {/* Paid Pending */}
              <div className="bg-gradient-to-br from-amber-600 to-orange-700 rounded-2xl p-3 text-white shadow-md shadow-amber-500/20 space-y-1">
                <div className="flex items-center justify-between text-amber-200">
                  <span className="text-[11px] font-medium">چک‌های پرداختی</span>
                  <ArrowUpRight className="w-4 h-4 text-amber-200" />
                </div>
                <div className="text-base font-bold font-mono">
                  {formatToman(stats.pendingPaidAmount)}
                </div>
                <div className="flex items-center justify-between text-[10px] text-amber-200 pt-1 border-t border-white/20">
                  <span>تعهدات پرداختی</span>
                  <span>{stats.pendingPaidCount} فقره چک</span>
                </div>
              </div>

              {/* Due Soon Alert Banner */}
              {stats.dueSoonCount > 0 && (
                <div className="col-span-2 bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-center justify-between text-rose-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold block">
                        {stats.dueSoonCount} فقره چک نزدیک به سررسید (طی ۷ روز آینده)
                      </span>
                      <span className="text-[11px] text-rose-600">
                        مجموع مبلغ: {formatToman(stats.dueSoonAmount)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('dueSoon')}
                    className="px-2.5 py-1 rounded-xl bg-rose-600 text-white text-[11px] font-semibold active:scale-95 transition"
                  >
                    مشاهده
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Search Box */}
          <div className="relative flex items-center">
            <div className="absolute right-3.5 text-slate-400 pointer-events-none">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی سریال چک، صیادی، نام طرف حساب یا بانک..."
              className="w-full pl-4 pr-10 py-2.5 text-xs rounded-2xl bg-white border border-purple-100 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition text-slate-800 shadow-sm"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            {[
              { id: 'all', label: `همه چک‌ها (${cheques.length})` },
              { id: 'received', label: 'دریافتی از مشتری' },
              { id: 'paid', label: 'پرداختی به تامین‌کننده' },
              { id: 'dueSoon', label: 'سررسید نزدیک ⚡' },
              { id: 'passed', label: 'وصول شده' },
              { id: 'bounced', label: 'برگشتی' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-medium transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Cheque Cards List */}
          <div className="space-y-3">
            {filteredCheques.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center border border-slate-200/60 shadow-sm space-y-2">
                <CreditCard className="w-8 h-8 mx-auto text-slate-300" />
                <h3 className="text-xs font-semibold text-slate-700">هیچ چکی در این دسته یافت نشد</h3>
                <p className="text-[11px] text-slate-400">
                  برای ثبت اولین چک صیادی، دکمه «ثبت چک جدید» را لمس کنید.
                </p>
              </div>
            ) : (
              filteredCheques.map((c) => {
                const daysLeft = getDaysRemaining(c.dueDate);

                return (
                  <div
                    key={c._id}
                    onClick={() => setSelectedCheque(c)}
                    className="bg-white rounded-2xl p-3 border border-purple-100/70 hover:border-purple-300 shadow-sm hover:shadow transition cursor-pointer space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-2xl flex items-center justify-center ${
                            c.type === 'received'
                              ? 'bg-purple-50 text-purple-600'
                              : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          <CreditCard className="w-4 h-4" />
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-slate-800" dir="ltr">
                              {c.chequeNumber}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                              بانک {c.bankName}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                c.type === 'received'
                                  ? 'bg-purple-50 text-purple-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {c.type === 'received' ? 'دریافتی' : 'پرداختی'}
                            </span>
                          </div>

                          <h4 className="text-xs font-semibold text-slate-800 mt-1">{c.partyName}</h4>
                        </div>
                      </div>

                      <div className="text-left">
                        <div className="text-sm font-bold font-mono text-purple-700">
                          {c.amount.toLocaleString('fa-IR')}
                        </div>
                        <span className="text-[10px] text-slate-400">تومان</span>
                      </div>
                    </div>

                    {/* Bottom Status & Due Date */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>سررسید: {new Date(c.dueDate).toLocaleDateString('fa-IR')}</span>
                        {c.status === 'pending' && (
                          <span
                            className={`mr-1 px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                              daysLeft < 0
                                ? 'bg-rose-100 text-rose-800'
                                : daysLeft <= 3
                                ? 'bg-amber-100 text-amber-800'
                                : 'text-slate-400'
                            }`}
                          >
                            {daysLeft < 0
                              ? `${Math.abs(daysLeft)} روز گذشته`
                              : daysLeft === 0
                              ? 'امروز'
                              : `${daysLeft} روز مانده`}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            c.status === 'passed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : c.status === 'bounced'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : c.status === 'endorsed'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {c.status === 'passed' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>وصول شد</span>
                            </>
                          ) : c.status === 'bounced' ? (
                            <>
                              <AlertTriangle className="w-3 h-3" />
                              <span>برگشتی</span>
                            </>
                          ) : c.status === 'endorsed' ? (
                            <>
                              <Clock className="w-3 h-3" />
                              <span>خرج شده</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" />
                              <span>در جریان</span>
                            </>
                          )}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCheque(c);
                          }}
                          className="p-1.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* New Cheque Modal */}
        <NewChequeModal
          isOpen={isNewModalOpen}
          defaultType={newChequeDefaultType}
          onClose={() => setIsNewModalOpen(false)}
          onChequeCreated={() => {
            loadData();
          }}
        />

        {/* Cheque Detail Modal */}
        <ChequeDetailModal
          isOpen={!!selectedCheque}
          cheque={selectedCheque}
          onClose={() => setSelectedCheque(null)}
          onChequeUpdated={(updated) => {
            setSelectedCheque(updated);
            loadData();
          }}
          onChequeDeleted={() => {
            setSelectedCheque(null);
            loadData();
          }}
        />
      </IonContent>
    </IonPage>
  );
};
