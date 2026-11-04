import React from 'react';
import { IonContent, IonHeader, IonPage, IonToolbar } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { CatalogSharePanel } from '../components/products/CatalogShareSheet';

export const CatalogManagePage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/90 backdrop-blur-md px-3 py-2 border-b border-sky-100">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-2 rounded-2xl bg-sky-50 text-sky-700" title="بازگشت">
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-slate-800">کاتالوگ</h1>
              <p className="text-[10px] text-slate-400">لینک، کپی و پیامک لیست قیمت</p>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent className="bg-slate-50">
        <div className="p-3 max-w-md mx-auto">
          <CatalogSharePanel />
        </div>
      </IonContent>
    </IonPage>
  );
};
