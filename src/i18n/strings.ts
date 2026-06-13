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
    'هادي نسخة تجريبية. باش تشوف الفيديو التجريبي، فعّل وضع التجربة من الصفحة الرئيسية بالزر *6.',
  goUnlock: 'سير فعّل وضع التجربة',

  // Test mode
  testModeButton: '∗6 وضع التجربة',
  testModeOn: 'وضع التجربة خدّام ✅ — المحتوى التجريبي محلول',
  testModeOff: 'وضع التجربة مسدود — برك 6 مرات على الزر باش تحلو',
  testModeTapsLeft: (n: number) => `باقي ليك ${n} ${n === 1 ? 'بركة' : 'بركات'} باش يتفعّل`,
  testModeUnlocked: 'مبروك! وضع التجربة تفعّل 🎉',
  testModeDisabled: 'وضع التجربة تسدّ',

  // Player
  playerTitle: 'البث التجريبي',
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
