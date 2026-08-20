/**
 * Build the audit sales-sheet preview (Places + optional Playwright shots).
 * The `/admin/sales-sheet` page paints a skeleton first, then hydrates from
 * `GET /api/admin/sales-sheet` so the dashboard link is not a blank wait.
 */
import { getCompanyConfig } from './companyConfig';
import { getTemplate, fillTemplate, renderFilledDocumentHtml } from './documentTemplates';
import {
  applyPlacesMissToSalesSheet,
  applySalesSheetParamOverrides,
  auditOnePagerSlug,
  fillAuditOnePager,
  injectAuditDisclaimerIntoFooter,
  listAuditCompanies,
  parseSalesSheetOrientation,
  renderAuditDisclaimerHtml,
  salesSheetAuditUrl,
  salesSheetWantsGoogleShot,
  salesSheetInputFromReportCard,
  salesSheetInputFromSearchParams,
  type AuditCompanyOption,
  type SalesSheetOrientation,
} from './auditSalesSheet';
import { extractPortal, getContact, type ContactRecord } from './contactApi';
import { buildAuditReportCard } from './auditReportCard';
import { googlePlacesListedForContact } from './auditPlacesListing';
import { isSafeWorkSlug, storeListWork, storeReadWork } from './workStore';
import { fetchSalesSheetPlaces } from './salesSheetPlaces';
import { screenshotGoogleSearchResults, screenshotPlacesPhoneMock } from './salesSheetPlacesShot';
import {
  injectAuditQrIntoHeader,
  injectPhoneIntoFirstColumn,
  placesPhoneShotImg,
  renderPlacesPhoneMockHtml,
  renderSalesSheetQrHtml,
  resolveIphoneFrameSrc,
  shortPlaceFromAddress,
} from './salesSheetPlacesView';
import { qrCodeDataUrl } from './qrCode';
import { companyBrandMarkHtml } from './documentPrintLayout';
import { storeGetMediaBySlug } from './mediaLibrary';
import { renderSalesSheetBackHtml, salesSheetStackLogos } from './salesSheetBack';
import { formStateFromInput, type SalesSheetFormState } from './salesSheetSkeleton';

export type { SalesSheetFormState } from './salesSheetSkeleton';
export {
  renderSalesSheetSkeletonHtml,
  salesSheetShellFromParams,
} from './salesSheetSkeleton';

export type SalesSheetView = {
  orientation: SalesSheetOrientation;
  runSlug: string;
  companies: AuditCompanyOption[];
  selectedSlug: string;
  sourceNote: string;
  placesNote: string;
  shotNote: string;
  notListed: boolean;
  wantGoogleShot: boolean;
  near: string;
  category: string;
  listedParam: string;
  auditUrl: string;
  error: string;
  sheetHtml: string;
  backHtml: string;
  form: SalesSheetFormState;
};

async function inlineMediaSrc(src: string, slugHint = ''): Promise<string> {
  const fromUrl = src.match(/\/api\/media\/([^/?#]+)/)?.[1] || '';
  const slug = decodeURIComponent(slugHint || fromUrl).trim();
  if (!slug) return src;
  try {
    const rec = await storeGetMediaBySlug(slug);
    if (rec?.dataBase64 && rec.mediaType) {
      return `data:${rec.mediaType};base64,${rec.dataBase64}`;
    }
  } catch {
    /* keep the public URL */
  }
  return src;
}

export async function listSalesSheetCompanies(): Promise<AuditCompanyOption[]> {
  return listAuditCompanies(await storeListWork());
}

export async function buildSalesSheetView(opts: {
  params: URLSearchParams;
  origin: string;
  request: Request;
}): Promise<SalesSheetView> {
  const { params, origin, request } = opts;
  const orientation = parseSalesSheetOrientation(params.get('orientation'));
  const runSlug = (params.get('run') || '').trim();
  const companies = await listSalesSheetCompanies();
  const selectedAudit = companies.find((c) => c.slug === runSlug) || null;

  let input = salesSheetInputFromSearchParams(params);
  let sourceNote = 'Dummy fixture';

  if (selectedAudit && isSafeWorkSlug(selectedAudit.slug)) {
    const doc = await storeReadWork(selectedAudit.slug);
    if (doc) {
      let contact: ContactRecord = {
        uid: doc.contact_uid || 'preview',
        name: doc.contact_name || selectedAudit.contactName || selectedAudit.company,
        company: selectedAudit.company,
      };
      if (doc.contact_uid) {
        try {
          const res = await getContact(doc.contact_uid);
          if (res.ok) {
            contact = {
              ...res.data,
              company: res.data.company || selectedAudit.company || res.data.name,
            };
          }
        } catch {
          /* keep job-derived contact */
        }
      }
      const listedFlag = await googlePlacesListedForContact(doc.contact_uid);
      const portal = extractPortal(contact);
      const contactWebsite =
        portal?.website?.trim() ||
        portal?.fields?.find((f) => /^(website|site) url$/i.test(f.label || ''))?.value?.trim() ||
        '';
      const card = buildAuditReportCard({
        tags: doc.tags,
        source: doc.source,
        title: doc.title,
        body: doc.body || '',
        clientName: contact.company || contact.name,
        googlePlacesListed: listedFlag,
        website: contactWebsite,
      });
      if (card && !card.inProgress) {
        input = applySalesSheetParamOverrides(
          salesSheetInputFromReportCard(card, contact, {
            googlePlacesListed: listedFlag,
            body: doc.body || '',
          }),
          params,
        );
        sourceNote = `Live audit · ${selectedAudit.company}`;
      } else {
        sourceNote = card?.inProgress
          ? `Audit still running for ${selectedAudit.company} — showing dummy until it finishes.`
          : `Could not parse the audit for ${selectedAudit.company} — showing dummy.`;
      }
    }
  }

  const company = await getCompanyConfig(request);
  const slug = auditOnePagerSlug(orientation);
  const tmpl = getTemplate(slug);

  const skipPlaces = params.get('places') === '0';
  const skipShot = params.get('shot') !== '1';
  const googleParam = params.get('google');
  const wantGoogleShot = salesSheetWantsGoogleShot(googleParam);
  const listedParam = (params.get('listed') || '').trim();
  const forceNotListed = listedParam === '0';
  const forceListed = listedParam === '1';
  const contactPortal = extractPortal(input.contact);
  const near =
    (params.get('near') || '').trim() ||
    shortPlaceFromAddress(contactPortal?.address || '');
  const category = (params.get('category') || '').trim();
  const placesQuery = (input.contact.company || input.contact.name || '').trim();

  const places = await fetchSalesSheetPlaces({
    query: placesQuery,
    near,
    category,
    forceNotListed,
    skipNetwork: skipPlaces,
  });

  const frameSrc = await resolveIphoneFrameSrc();
  let screenSrc = '';
  let shotNote = '';
  let serpListed: boolean | null = null;

  if (wantGoogleShot) {
    const serp = await screenshotGoogleSearchResults({
      query: placesQuery,
      near,
      lat: contactPortal?.geo?.lat,
      lng: contactPortal?.geo?.lng,
    });
    if (serp.ok) {
      screenSrc = `data:image/png;base64,${serp.pngBase64}`;
      serpListed = serp.listed;
      shotNote = serp.listed
        ? 'Playwright screenshot of google.com/maps — this search opens their listing.'
        : 'Playwright screenshot of google.com Places/Maps results in the iPhone frame.';
    } else {
      shotNote = `Google screenshot failed (${serp.error}) — showing live Places neighbors, not a mock listing.`;
    }
  } else if (skipShot) {
    shotNote = 'iPhone 17 frame from the media library (live HTML).';
  }

  const notListed = forceListed
    ? false
    : forceNotListed
      ? true
      : serpListed === true
        ? false
        : !places.listed;
  input = applyPlacesMissToSalesSheet(input, notListed);

  const phoneHtml = renderPlacesPhoneMockHtml(
    { ...places, near, listed: !notListed },
    { frameSrc, screenSrc },
  );
  let phoneEmbed = phoneHtml;

  if (!skipShot) {
    const shot = await screenshotPlacesPhoneMock({ ...places, listed: !notListed }, { frameSrc, screenSrc });
    if (shot.ok) {
      phoneEmbed = placesPhoneShotImg(shot.pngBase64);
      shotNote = screenSrc
        ? 'Playwright screenshot of the iPhone frame over a live google.com Places page.'
        : 'Playwright screenshot of the iPhone frame mock-up.';
    } else {
      shotNote = `${shotNote} Frame rasterize failed (${shot.error}) — using the live iPhone frame.`.trim();
    }
  }

  const auditUrl = selectedAudit?.contactUid
    ? salesSheetAuditUrl(
        new URLSearchParams({ uid: selectedAudit.contactUid, project: selectedAudit.slug }),
        origin,
      )
    : salesSheetAuditUrl(params, origin);
  let qrHtml = '';
  try {
    const qrSrc = await qrCodeDataUrl(auditUrl, 160);
    qrHtml = renderSalesSheetQrHtml(qrSrc, auditUrl);
  } catch (e) {
    shotNote = `${shotNote} QR failed (${e instanceof Error ? e.message : String(e)}).`.trim();
  }

  const backStackLogos = await Promise.all(
    salesSheetStackLogos().map(async (logo) => ({
      ...logo,
      src: await inlineMediaSrc(logo.src, logo.slug?.startsWith('stack-') ? logo.slug : ''),
    })),
  );
  const backHtml = renderSalesSheetBackHtml({
    company,
    orientation,
    stackLogos: backStackLogos,
    iconHtml: companyBrandMarkHtml('icon', company, { size: 'xl', idPrefix: 'ss-back-icon' }),
  });

  let error = '';
  let sheetHtml = '';

  if (!tmpl) {
    error = `Template ${slug} is missing.`;
  } else {
    try {
      const source = fillAuditOnePager(tmpl.markdown, input);
      const filled = fillTemplate(source, input.contact, company);
      const rendered = await renderFilledDocumentHtml(filled, company, slug, input.contact);
      sheetHtml = injectAuditDisclaimerIntoFooter(
        injectAuditQrIntoHeader(injectPhoneIntoFirstColumn(rendered, phoneEmbed), qrHtml),
        renderAuditDisclaimerHtml(input.findings),
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const placesNote = places.error
    ? `${places.source === 'places' ? 'Places' : 'Places lookup'} — ${places.error}`
    : places.source === 'places'
      ? `Google Places · ${places.competitors.length} nearby results`
      : 'No Places neighbors for this search';

  return {
    orientation,
    runSlug,
    companies,
    selectedSlug: selectedAudit?.slug || '',
    sourceNote,
    placesNote,
    shotNote,
    notListed,
    wantGoogleShot,
    near,
    category,
    listedParam,
    auditUrl,
    error,
    sheetHtml,
    backHtml,
    form: formStateFromInput(input, auditUrl),
  };
}
