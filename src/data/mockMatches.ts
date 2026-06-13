export type MatchStatus = 'upcoming' | 'live' | 'finished';

export interface Team {
  code: string;
  nameAr: string;
  flag: string;
}

export interface Match {
  id: string;
  group: string;
  home: Team;
  away: Team;
  /** Kickoff time as ISO-8601 (UTC) */
  kickoffISO: string;
  stadium: string;
  city: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
}

const T = {
  MAR: { code: 'MAR', nameAr: 'المغرب', flag: '🇲🇦' },
  BRA: { code: 'BRA', nameAr: 'البرازيل', flag: '🇧🇷' },
  ARG: { code: 'ARG', nameAr: 'الأرجنتين', flag: '🇦🇷' },
  FRA: { code: 'FRA', nameAr: 'فرنسا', flag: '🇫🇷' },
  ESP: { code: 'ESP', nameAr: 'إسبانيا', flag: '🇪🇸' },
  GER: { code: 'GER', nameAr: 'ألمانيا', flag: '🇩🇪' },
  ENG: { code: 'ENG', nameAr: 'إنجلترا', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  POR: { code: 'POR', nameAr: 'البرتغال', flag: '🇵🇹' },
  SEN: { code: 'SEN', nameAr: 'السنغال', flag: '🇸🇳' },
  EGY: { code: 'EGY', nameAr: 'مصر', flag: '🇪🇬' },
  TUN: { code: 'TUN', nameAr: 'تونس', flag: '🇹🇳' },
  ALG: { code: 'ALG', nameAr: 'الجزائر', flag: '🇩🇿' },
  JPN: { code: 'JPN', nameAr: 'اليابان', flag: '🇯🇵' },
  USA: { code: 'USA', nameAr: 'أمريكا', flag: '🇺🇸' },
  MEX: { code: 'MEX', nameAr: 'المكسيك', flag: '🇲🇽' },
  NED: { code: 'NED', nameAr: 'هولندا', flag: '🇳🇱' },
} satisfies Record<string, Team>;

/**
 * Mock fixtures only — teams, times and venues are invented for testing.
 * Dates are spread around "now" so the demo always shows live/upcoming games.
 */
function daysFromNow(days: number, hourUTC: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUTC, 0, 0, 0);
  return d.toISOString();
}

export const MOCK_MATCHES: Match[] = [
  // Yesterday — finished
  {
    id: 'm01',
    group: 'أ',
    home: T.MEX,
    away: T.SEN,
    kickoffISO: daysFromNow(-1, 17),
    stadium: 'ملعب أزتيكا',
    city: 'مكسيكو سيتي',
    status: 'finished',
    homeScore: 1,
    awayScore: 1,
  },
  {
    id: 'm02',
    group: 'ب',
    home: T.ESP,
    away: T.JPN,
    kickoffISO: daysFromNow(-1, 20),
    stadium: 'ملعب سوفي',
    city: 'لوس أنجلس',
    status: 'finished',
    homeScore: 2,
    awayScore: 1,
  },

  // Today — one live, one upcoming
  {
    id: 'm03',
    group: 'ج',
    home: T.MAR,
    away: T.BRA,
    kickoffISO: daysFromNow(0, 18),
    stadium: 'ملعب ميتلايف',
    city: 'نيويورك',
    status: 'live',
    homeScore: 2,
    awayScore: 0,
  },
  {
    id: 'm04',
    group: 'د',
    home: T.FRA,
    away: T.EGY,
    kickoffISO: daysFromNow(0, 21),
    stadium: 'ملعب هارد روك',
    city: 'ميامي',
    status: 'upcoming',
  },

  // Tomorrow
  {
    id: 'm05',
    group: 'أ',
    home: T.USA,
    away: T.TUN,
    kickoffISO: daysFromNow(1, 16),
    stadium: 'ملعب أت&ت',
    city: 'دالاس',
    status: 'upcoming',
  },
  {
    id: 'm06',
    group: 'ب',
    home: T.GER,
    away: T.ALG,
    kickoffISO: daysFromNow(1, 19),
    stadium: 'ملعب بي سي بلاس',
    city: 'فانكوفر',
    status: 'upcoming',
  },
  {
    id: 'm07',
    group: 'ج',
    home: T.ARG,
    away: T.NED,
    kickoffISO: daysFromNow(1, 22),
    stadium: 'ملعب مرسيدس بنز',
    city: 'أتلانتا',
    status: 'upcoming',
  },

  // Day after tomorrow
  {
    id: 'm08',
    group: 'د',
    home: T.ENG,
    away: T.MEX,
    kickoffISO: daysFromNow(2, 17),
    stadium: 'ملعب ليفايس',
    city: 'سان فرانسيسكو',
    status: 'upcoming',
  },
  {
    id: 'm09',
    group: 'أ',
    home: T.POR,
    away: T.JPN,
    kickoffISO: daysFromNow(2, 20),
    stadium: 'ملعب جيليت',
    city: 'بوسطن',
    status: 'upcoming',
  },

  // In three days
  {
    id: 'm10',
    group: 'ب',
    home: T.MAR,
    away: T.ESP,
    kickoffISO: daysFromNow(3, 18),
    stadium: 'ملعب أكور',
    city: 'تورونتو',
    status: 'upcoming',
  },
  {
    id: 'm11',
    group: 'ج',
    home: T.SEN,
    away: T.FRA,
    kickoffISO: daysFromNow(3, 21),
    stadium: 'ملعب لومن فيلد',
    city: 'سياتل',
    status: 'upcoming',
  },
  {
    id: 'm12',
    group: 'د',
    home: T.BRA,
    away: T.ARG,
    kickoffISO: daysFromNow(3, 23),
    stadium: 'ملعب روز بول',
    city: 'باسادينا',
    status: 'upcoming',
  },
];
