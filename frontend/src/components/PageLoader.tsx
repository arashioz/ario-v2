import React, { useLayoutEffect } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { SplashScreen } from './SplashScreen';
import { pageActivity } from '../services/pageActivity';

export const PageLoader: React.FC = () => {
  useLayoutEffect(() => pageActivity.begin(), []);
  return <IonPage><SplashScreen /></IonPage>;
};

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
