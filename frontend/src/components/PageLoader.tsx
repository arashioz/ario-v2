import React from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { SplashScreen } from './SplashScreen';

/**
 * Suspense fallback for a lazily loaded page. It must NOT render an `IonPage`:
 * Ionic registers the first page element of a navigation inside the outlet and runs
 * the enter transition on it. A placeholder page would be replaced by the real page
 * as soon as the chunk resolves, and the replacement element stays hidden
 * (`ion-page-invisible`) because Ionic treats the repeat transition as a duplicate —
 * which is what turned cold starts (and slow chunk loads) into a white screen.
 * The splash is portalled to <body>, so it covers the outlet without being a page.
 */
export const PageLoader: React.FC = () => <SplashScreen message="در حال باز کردن صفحه…" />;

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
