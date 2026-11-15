import React from 'react';
import { useDeviceCapabilities } from '../../hooks/useDeviceCapabilities';
import type { CapabilityGroup } from '../../types/capabilities';

const GROUP_TITLE: Record<CapabilityGroup, string> = {
  device: 'سخت‌افزار',
  media: 'رسانه',
  files: 'فایل‌ها',
  network: 'شبکه',
  platform: 'مرورگر و سیستم',
};

/** Read-only audit of what this device and browser can do. Never prompts. */
export const DeviceCapabilities: React.FC = () => {
  const { capabilities, environment } = useDeviceCapabilities();
  const groups = Object.keys(GROUP_TITLE) as CapabilityGroup[];
  const supported = capabilities.filter((item) => item.supported).length;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] text-slate-500 leading-5">
          {environment.platform} · {environment.browser}
          {environment.native ? ' · اپ نصب‌شده' : environment.standalone ? ' · نصب‌شده روی صفحه' : ''}
          {environment.secureContext ? '' : ' · بدون HTTPS'}
          {' — '}
          {supported} از {capabilities.length} قابلیت
        </p>
      </div>

      {groups.map((group) => {
        const items = capabilities.filter((item) => item.group === group);
        if (!items.length) return null;
        return (
          <div key={group} className="space-y-1.5">
            <h4 className="text-[10px] font-bold text-slate-400">{GROUP_TITLE[group]}</h4>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item.key} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-700">{item.label}</p>
                    {item.note && <p className="text-[10px] text-slate-400 mt-0.5">{item.note}</p>}
                  </div>
                  <span
                    className={`text-[10px] font-bold shrink-0 ${item.supported ? 'text-emerald-700' : 'text-slate-400'}`}
                  >
                    {item.supported ? 'پشتیبانی می‌شود' : 'پشتیبانی نمی‌شود'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};
