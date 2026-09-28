export interface PasswordRequest {
  title: string;
  error?: string;
  resolve: (password: string) => void;
  reject: (reason: unknown) => void;
}

type Handler = (req: PasswordRequest) => void;

let handler: Handler | null = null;

/** The mounted <DeletePasswordPrompt/> registers itself here. */
export function registerPasswordPrompt(h: Handler) {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

/** Shaped like an axios error so `apiErrorMessage` shows a readable message. */
export const cancelledError = () => ({
  cancelledByUser: true,
  message: 'حذف لغو شد',
  response: { status: 0, data: { message: 'حذف لغو شد — رمز عبور وارد نشد' } },
});

export function askPassword(title: string, error?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!handler) {
      const typed = window.prompt(`${error ? `${error}\n` : ''}${title}\nرمز عبور خود را وارد کنید:`);
      return typed ? resolve(typed) : reject(cancelledError());
    }
    handler({ title, error, resolve, reject });
  });
}

const RESOURCE_LABELS: [RegExp, string][] = [
  [/^\/?customers\/transactions/, 'حذف تراکنش مشتری'],
  [/^\/?customers/, 'حذف مشتری'],
  [/^\/?products\/[^/]+\/image/, 'حذف عکس کالا'],
  [/^\/?products/, 'حذف کالا'],
  [/^\/?cheques/, 'حذف چک'],
  [/^\/?expenses/, 'حذف هزینه'],
  [/^\/?suppliers\/companies/, 'حذف شرکت تأمین‌کننده'],
  [/^\/?suppliers\/payments/, 'حذف پرداخت به تأمین‌کننده'],
  [/^\/?notes\/done/, 'حذف یادداشت‌های انجام‌شده'],
  [/^\/?notes/, 'حذف یادداشت'],
  [/^\/?shares/, 'حذف لینک اشتراک'],
  [/^\/?backup/, 'حذف فایل پشتیبان'],
];

export const deleteTitle = (url = '') => RESOURCE_LABELS.find(([rx]) => rx.test(url))?.[1] ?? 'تأیید حذف';
