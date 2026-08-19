export type CourtKind = 'bankruptcy' | 'district' | 'state' | 'trustee' | 'ust';

export type CourtVenue = {
  id: string;
  name: string;
  kind: CourtKind;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  phone?: string;
  fax?: string;
  email?: string;
  hours?: string;
  counties: string[];
  notes?: string;
  staff?: Array<{ role: string; name: string; phone?: string; email?: string }>;
};

/** Counties we can gate on (Massachusetts first; add other states the same way). */
export const DIRECTORY_COUNTIES = [
  'Barnstable',
  'Berkshire',
  'Bristol',
  'Dukes',
  'Essex',
  'Franklin',
  'Hampden',
  'Hampshire',
  'Middlesex',
  'Nantucket',
  'Norfolk',
  'Plymouth',
  'Suffolk',
  'Worcester',
] as const;

const ESSEX_EAST = [
  'Essex — Beverly, Salem, Peabody, Lynn, Gloucester, Marblehead, and all Essex towns except the Worcester carve-out',
];

/**
 * Public court / trustee locations. Coordinates are building centroids.
 * Phones from mab.uscourts.gov, mass.gov, and justice.gov (compiled Aug 2026).
 */
export const COURT_DIRECTORY: CourtVenue[] = [
  {
    id: 'mab-boston',
    name: 'U.S. Bankruptcy Court — Eastern Division',
    kind: 'bankruptcy',
    address: 'John W. McCormack Post Office and Courthouse, 5 Post Office Square, Suite 1150',
    city: 'Boston',
    state: 'MA',
    lat: 42.3578,
    lng: -71.0534,
    phone: '(617) 748-5300',
    fax: '(617) 748-5315',
    hours: 'Clerk 8:30 a.m.–5:00 p.m.; filings 8:30 a.m.–4:30 p.m. business days',
    counties: ['Essex', 'Suffolk', 'Middlesex', 'Norfolk', 'Plymouth', 'Bristol', 'Barnstable', 'Dukes', 'Nantucket'],
    notes:
      'Emergency filings (617) 748-5317. Closing line 866-419-5695. Essex carve-out (Andover, Bradford, Haverhill, Lawrence, Methuen, North Andover) files in Worcester. Judge Janet E. Bostwick chambers (617) 748-5327 / jeb@mab.uscourts.gov. Visiting: Chief Judge Peter G. Cary (D. Maine), designated Aug 2025 for Eastern Division; calendar clerk Lisa Belanger (617) 748-5326, Lisa_Belanger@mab.uscourts.gov.',
    staff: [
      { role: 'Judge', name: 'Janet E. Bostwick', phone: '(617) 748-5327', email: 'jeb@mab.uscourts.gov' },
      { role: 'Courtroom deputy', name: 'Lisa Belanger', phone: '(617) 748-5326', email: 'Lisa_Belanger@mab.uscourts.gov' },
      { role: 'Case admin supervisor', name: 'Stefanie', phone: '(617) 748-5319' },
    ],
  },
  {
    id: 'mab-worcester',
    name: 'U.S. Bankruptcy Court — Central Division',
    kind: 'bankruptcy',
    address: 'Donohue Federal Building, 595 Main Street, Room 311',
    city: 'Worcester',
    state: 'MA',
    lat: 42.2626,
    lng: -71.8019,
    phone: '(508) 770-8900',
    fax: '(508) 770-8975',
    hours: 'Clerk 8:30 a.m.–5:00 p.m.; filings 8:30 a.m.–4:30 p.m. business days',
    counties: ['Worcester', 'Middlesex', 'Essex', 'Norfolk'],
    notes:
      'Essex towns Andover, Bradford, Haverhill, Lawrence, Methuen, North Andover. Judge Christopher J. Panos chambers (508) 770-8927 / cjp@mab.uscourts.gov.',
    staff: [
      { role: 'Judge', name: 'Christopher J. Panos', phone: '(508) 770-8927', email: 'cjp@mab.uscourts.gov' },
      { role: 'Courtroom deputy', name: 'Alberto Barrera', phone: '(508) 770-8927', email: 'Alberto_Barrera@mab.uscourts.gov' },
    ],
  },
  {
    id: 'mab-springfield',
    name: 'U.S. Bankruptcy Court — Western Division',
    kind: 'bankruptcy',
    address: 'United States Courthouse, 300 State Street',
    city: 'Springfield',
    state: 'MA',
    lat: 42.1015,
    lng: -72.5898,
    phone: '(413) 785-6900',
    fax: '(413) 785-6917',
    hours: 'Clerk 8:30 a.m.–5:00 p.m.; filings 8:30 a.m.–4:30 p.m. business days',
    counties: ['Berkshire', 'Franklin', 'Hampden', 'Hampshire'],
    notes: 'Chief Judge Elizabeth D. Katz chambers (413) 785-6909 / edk@mab.uscourts.gov.',
    staff: [
      { role: 'Chief Judge', name: 'Elizabeth D. Katz', phone: '(413) 785-6909', email: 'edk@mab.uscourts.gov' },
      { role: 'Courtroom deputy', name: 'Sophia Howard', phone: '(413) 785-6909', email: 'Sophia_Howard@mab.uscourts.gov' },
    ],
  },
  {
    id: 'ust-boston',
    name: 'U.S. Trustee Program — Region 1',
    kind: 'ust',
    address: '5 Post Office Square, Suite 1000',
    city: 'Boston',
    state: 'MA',
    lat: 42.3576,
    lng: -71.0536,
    phone: '(617) 788-0400',
    fax: '(617) 565-6368',
    email: 'USTP.Region01@usdoj.gov',
    counties: ['Essex', 'Suffolk', 'Middlesex', 'Norfolk', 'Plymouth', 'Bristol', 'Barnstable', 'Dukes', 'Nantucket', 'Worcester', 'Berkshire', 'Franklin', 'Hampden', 'Hampshire'],
    notes: 'Assistant U.S. Trustee Richard T. King. Also the in-person alternate § 341 site for Eastern Division.',
    staff: [{ role: 'Assistant U.S. Trustee', name: 'Richard T. King' }],
  },
  {
    id: 'ch13-boston',
    name: 'Chapter 13 Standing Trustee — Eastern Division',
    kind: 'trustee',
    address: 'Correspondence: P.O. Box 8250 (plan payments: P.O. Box 1131, Memphis, TN 38101)',
    city: 'Boston',
    state: 'MA',
    lat: 42.3584,
    lng: -71.0598,
    phone: '(617) 723-1313',
    fax: '(617) 723-2998',
    email: '13trustee@ch13boston.com',
    counties: ['Essex', 'Suffolk', 'Middlesex', 'Norfolk', 'Plymouth', 'Bristol', 'Barnstable', 'Dukes', 'Nantucket'],
    notes: 'Carolyn A. Bankowski. 341 docs: taxes@ch13boston.com. Site ch13boston.com. Zoom 341s — confirm on Form 309.',
    staff: [{ role: 'Standing trustee', name: 'Carolyn A. Bankowski', phone: '(617) 723-1313', email: '13trustee@ch13boston.com' }],
  },
  {
    id: 'mad-boston',
    name: 'U.S. District Court — Eastern Division',
    kind: 'district',
    address: 'John Joseph Moakley U.S. Courthouse, 1 Courthouse Way, Suite 2300',
    city: 'Boston',
    state: 'MA',
    lat: 42.3538,
    lng: -71.0474,
    phone: '(617) 748-9152',
    email: 'ECFhelp@mad.uscourts.gov',
    hours: 'Public counter 8:30 a.m.–4:30 p.m. weekdays',
    counties: ['Essex', 'Suffolk', 'Middlesex', 'Norfolk', 'Plymouth', 'Bristol', 'Barnstable', 'Dukes', 'Nantucket'],
  },
  {
    id: 'essex-superior-salem',
    name: 'Essex County Superior Court',
    kind: 'state',
    address: '56 Federal Street',
    city: 'Salem',
    state: 'MA',
    lat: 42.5218,
    lng: -70.896,
    phone: '(978) 744-5500',
    fax: '(978) 741-0691',
    hours: 'Monday–Friday 8:00 a.m.–4:30 p.m.',
    counties: ['Essex'],
    notes: 'Clerk of Courts Thomas H. Driscoll, Jr. Sessions also in Lawrence and Newburyport.',
  },
  {
    id: 'salem-district',
    name: 'Salem District Court',
    kind: 'state',
    address: '56 Federal Street',
    city: 'Salem',
    state: 'MA',
    lat: 42.5216,
    lng: -70.8958,
    phone: '(978) 744-1167',
    hours: 'Monday–Friday 8:30 a.m.–4:30 p.m.',
    counties: ['Essex'],
    notes: 'Serves Beverly, Danvers, Manchester-by-the-Sea, Middleton, and Salem. No separate Beverly courthouse.',
  },
  {
    id: 'lawrence-district',
    name: 'Lawrence District Court',
    kind: 'state',
    address: 'Fenton Judicial Center, 2 Appleton Street',
    city: 'Lawrence',
    state: 'MA',
    lat: 42.7071,
    lng: -71.1634,
    phone: '(978) 687-7184',
    hours: 'Monday–Friday 8:00 a.m.–4:30 p.m.',
    counties: ['Essex'],
    notes: 'Serves Andover, Lawrence, Methuen, North Andover — those towns file bankruptcy in Worcester.',
  },
  {
    id: 'newburyport-district',
    name: 'Newburyport District Court',
    kind: 'state',
    address: '188 State Street',
    city: 'Newburyport',
    state: 'MA',
    lat: 42.8116,
    lng: -70.8708,
    phone: '(978) 462-2652',
    hours: 'Monday–Friday 8:30 a.m.–4:30 p.m.',
    counties: ['Essex'],
    notes: 'Serves Amesbury, Merrimac, Newbury, Newburyport, Rowley, Salisbury, West Newbury.',
  },
  {
    id: 'ne-housing-salem',
    name: 'Northeast Housing Court — Salem session',
    kind: 'state',
    address: '56 Federal Street',
    city: 'Salem',
    state: 'MA',
    lat: 42.5215,
    lng: -70.8962,
    phone: '(978) 825-4920',
    hours: 'Monday–Friday 8:30 a.m.–4:30 p.m.',
    counties: ['Essex'],
    notes: 'Lynn / Nahant / Saugus session is also heard here.',
  },
  {
    id: 'essex-probate-salem',
    name: 'Essex Probate and Family Court',
    kind: 'state',
    address: '36 Federal Street',
    city: 'Salem',
    state: 'MA',
    lat: 42.5222,
    lng: -70.8964,
    phone: '(978) 744-1020',
    hours: 'Monday–Friday 8:00 a.m.–4:30 p.m.',
    counties: ['Essex'],
    notes: 'First Justice Hon. Frances Giordano. Register Pamela A. Casey O’Brien.',
    staff: [{ role: 'First Justice', name: 'Hon. Frances Giordano' }],
  },
];

void ESSEX_EAST;
