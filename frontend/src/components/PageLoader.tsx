import React from 'react';
import { IonContent, IonPage } from '@ionic/react';

export const PageLoader: React.FC = () => (
  <IonPage>
    <IonContent>
      <div role="status" className="min-h-full flex items-center justify-center gap-3 text-sm text-sky-700">
        <span className="w-5 h-5 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
        در حال باز کردن صفحه…
      </div>
    </IonContent>
  </IonPage>
);

/** A failed chunk download must offer recovery, rather than leave a blank screen. */
export class PageLoadBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <IonPage><IonContent>
      <div role="alert" className="p-8 flex flex-col items-center justify-center min-h-full gap-4 text-center text-sm text-slate-600">
        <p>صفحه باز نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.</p>
        <button onClick={() => window.location.reload()} className="rounded-xl bg-sky-600 text-white px-5 py-3">بارگذاری دوباره</button>
      </div>
    </IonContent></IonPage>;
  }
}
