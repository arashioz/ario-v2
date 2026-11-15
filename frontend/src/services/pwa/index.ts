export type { InstallResult } from './installService';
export { canPromptInstall, isInstalled, isIosDevice, isStandalone, promptInstall, subscribeInstall } from './installService';
export {
  applyServiceWorkerUpdate,
  CACHE_PREFIX,
  canRegisterServiceWorker,
  getServiceWorkerState,
  registerServiceWorker,
  subscribeServiceWorker,
  type ServiceWorkerState,
} from './serviceWorker';
