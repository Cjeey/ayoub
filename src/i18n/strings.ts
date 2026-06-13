/**
 * UI strings in Moroccan Darija / Arabic.
 * Kept in one place so the app can be translated easily later.
 */
export const t = {
  appName: 'كورة تيست',
  appTagline: 'تطبيق تجريبي للمشاهدة — غير للاختبار، ماشي بث حقيقي',

  // Home
  nextMatch: 'الماتش الجاي',
  upcomingMatches: 'الماتشات الجاية',
  seeAllMatches: 'شوف جميع الماتشات',
  offlineReady: 'البرنامج خدام حتى بلا انترنت — البيانات محفوظة فالتيليفون 📱',

  // Match list
  allMatchesTitle: 'جدول الماتشات',
  today: 'اليوم',
  tomorrow: 'غدا',
  pullToRefresh: 'جبد باش تجدد البيانات',
  lastSync: 'آخر تحديث',
  fromCache: 'البيانات من الذاكرة المحلية',

  // Match detail
  matchDetailTitle: 'تفاصيل الماتش',
  group: 'المجموعة',
  stadium: 'الملعب',
  city: 'المدينة',
  kickoff: 'وقت الانطلاق',
  watchDemo: '▶️ شوف البث التجريبي',
  contentLocked: 'المحتوى مسدود 🔒',
  contentLockedHint:
    'هادي نسخة تجريبية. باش تشوف الفيديو التجريبي، فعّل وضع التجربة بالزر *6 فالصفحة الرئيسية ولا دخل الكود *6 فالإعدادات.',
  goUnlock: 'سير فعّل وضع التجربة',

  // Test mode
  testModeButton: '∗6 وضع التجربة',
  testModeOn: 'وضع التجربة خدّام ✅ — المحتوى التجريبي محلول',
  testModeOff: 'وضع التجربة مسدود — برك 6 مرات على الزر باش تحلو',
  testModeTapsLeft: (n: number) => `باقي ليك ${n} ${n === 1 ? 'بركة' : 'بركات'} باش يتفعّل`,
  testModeUnlocked: 'مبروك! وضع التجربة تفعّل 🎉',
  testModeDisabled: 'وضع التجربة تسدّ',

  // Admin settings
  settingsButton: '⚙️ الإعدادات (الإدارة)',
  adminTitle: 'الإعدادات — الإدارة',
  codeSectionTitle: '☎️ كود التفعيل',
  codeHint: 'دخل الكود *6 باش تفعّل ولا تسد وضع التجربة.',
  codePlaceholder: '*6',
  codeApply: 'طبّق الكود',
  codeEnabled: 'وضع التجربة تفعّل بالكود *6 ✅',
  codeDisabled: 'وضع التجربة تسدّ بالكود *6',
  codeInvalid: 'الكود ماشي صحيح ❌',
  streamSectionTitle: '📡 إعدادات البث المرخص',
  streamHint:
    'منين توصل باتفاق رسمي مع صاحب الحقوق (مثلا beIN SPORTS)، حط هنا المعلومات اللي غادي يعطيوك: رابط البث والتوكن ديال الدخول.',
  providerLabel: 'المزود (صاحب الحقوق)',
  providerPlaceholder: 'beIN SPORTS',
  urlLabel: 'رابط البث (HLS .m3u8 أو MP4)',
  urlPlaceholder: 'https://...',
  tokenLabel: 'توكن / مفتاح الدخول (اختياري)',
  tokenPlaceholder: 'كيعطيه ليك المزود',
  notesLabel: 'ملاحظات (رقم العقد، جهة الاتصال...)',
  notesPlaceholder: 'مثلا: فالانتظار ديال الجواب من beIN',
  saveStream: '💾 سجّل الإعدادات',
  clearStream: '🗑️ مسح الإعدادات',
  streamSaved: 'تسجلات إعدادات البث ✅',
  streamCleared: 'تمسحات إعدادات البث',
  invalidUrl: 'الرابط خاصو يبدا بـ http:// ولا https://',
  streamConfiguredAs: (provider: string) => `البث المرخص واجد عبر: ${provider} ✅`,
  streamNotConfigured: 'حتى شي بث مرخص ماكاينش دابا — التطبيق غادي يقرا غير الفيديو التجريبي.',
  adminLegal:
    '⚖️ ما تزيدش هنا أي رابط بث بلا ترخيص رسمي مكتوب من صاحب الحقوق. البث بلا ترخيص ممنوع قانونيا.',

  // Player
  playerTitle: 'البث التجريبي',
  licensedBanner: (provider: string) => `📡 بث عبر المزود المرخص: ${provider}`,
  demoBanner: '⚠️ هذا فيديو تجريبي محلي — ماشي بث حقيقي ديال الماتش',
  videoError: 'وقع مشكل فقراءة الفيديو، عاود حاول',

  // Statuses
  statusLive: 'مباشر 🔴 (تجريبي)',
  statusUpcoming: 'ماجاش بعد',
  statusFinished: 'سالا',

  // Generic
  vs: 'ضد',
  demoTag: 'تجريبي',
  legalFooter: 'كل المحتوى فهاد التطبيق تجريبي ومحلي. ما كاينش شي بث حقيقي ديال الماتشات.',
};
