'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Trash2, Eye } from 'lucide-react';
import Link from 'next/link';
import { FormGrid } from '@/components/responsive/form-grid';
import { ResponsiveImage } from '@/components/responsive/responsive-image';
import {
  updateEventBranding,
  uploadBrandingImage,
  deleteBrandingImage,
} from '@/lib/actions/branding';
import type { EventBranding } from '@/lib/validations/branding';
import { BRANDING_IMAGE_MIME_TYPES, BRANDING_IMAGE_MAX_SIZE } from '@/lib/validations/branding';
import { useRole } from '@/hooks/use-role';

interface BrandingFormClientProps {
  eventId: string;
  eventName: string;
  initialBranding: EventBranding;
  initialImageUrls: {
    logoUrl: string | null;
    headerImageUrl: string | null;
  };
  canWriteOverride?: boolean;
}

export function BrandingFormClient({
  eventId,
  eventName,
  initialBranding,
  initialImageUrls,
  canWriteOverride,
}: BrandingFormClientProps) {
  const router = useRouter();
  const { canWrite } = useRole();
  const effectiveCanWrite = canWriteOverride ?? canWrite;
  const [isPending, startTransition] = useTransition();
  const [isHydrated, setIsHydrated] = useState(false);

  // Form state
  const [primaryColor, setPrimaryColor] = useState(initialBranding.primaryColor || '#1E40AF');
  const [secondaryColor, setSecondaryColor] = useState(initialBranding.secondaryColor || '#9333EA');
  const [emailSenderName, setEmailSenderName] = useState(initialBranding.emailSenderName || '');
  const [emailFooterText, setEmailFooterText] = useState(initialBranding.emailFooterText || '');
  const [whatsappPrefix, setWhatsappPrefix] = useState(initialBranding.whatsappPrefix || '');

  // Image state
  const [logoUrl, setLogoUrl] = useState(initialImageUrls.logoUrl);
  const [headerImageUrl, setHeaderImageUrl] = useState(initialImageUrls.headerImageUrl);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'header' | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  function handleSave() {
    if (!isHydrated || !effectiveCanWrite) return;
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      try {
        await updateEventBranding(eventId, {
          primaryColor,
          secondaryColor,
          emailSenderName,
          emailFooterText,
          whatsappPrefix,
        });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save branding');
      }
    });
  }

  async function handleImageUpload(imageType: 'logo' | 'header', file: File) {
    if (!isHydrated || !effectiveCanWrite) return;

    // Client-side validation
    if (!BRANDING_IMAGE_MIME_TYPES.includes(file.type as (typeof BRANDING_IMAGE_MIME_TYPES)[number])) {
      setError(`Invalid file type. Allowed: PNG, JPEG, WebP, SVG`);
      return;
    }
    if (file.size > BRANDING_IMAGE_MAX_SIZE) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 5MB`);
      return;
    }

    setUploading(imageType);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await uploadBrandingImage(eventId, imageType, formData);

      if (imageType === 'logo') {
        setLogoUrl(result.signedUrl);
      } else {
        setHeaderImageUrl(result.signedUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  async function handleImageDelete(imageType: 'logo' | 'header') {
    if (!isHydrated || !effectiveCanWrite) return;

    setError(null);
    try {
      await deleteBrandingImage(eventId, imageType);
      if (imageType === 'logo') setLogoUrl(null);
      else setHeaderImageUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/events/${eventId}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-border/30"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Branding</h1>
            <p className="text-sm text-muted-foreground">{eventName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-border/30"
          >
            <Eye className="h-4 w-4" />
            {showPreview ? 'Hide Preview' : 'Preview'}
          </button>
          {effectiveCanWrite && (
            <button
              onClick={handleSave}
              disabled={!isHydrated || isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Branding saved successfully
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column: Form */}
        <div className="space-y-6">
          {/* Logo — full-width in FormGrid */}
          <section className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">Event Logo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              PNG, JPEG, WebP, or SVG. Max 5MB.
            </p>
            <div className="mt-4">
              {logoUrl ? (
                <div className="flex items-center gap-4">
                  <ResponsiveImage
                    src={logoUrl}
                    alt="Event logo"
                    context="thumbnail"
                    aspectRatio="1/1"
                    className="h-16 w-16 rounded-lg border"
                  />
                  {effectiveCanWrite && (
                    <button
                      onClick={() => handleImageDelete('logo')}
                      className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </div>
              ) : (
                <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 hover:bg-border/20 ${(!isHydrated || !effectiveCanWrite) ? 'pointer-events-none opacity-50' : ''}`}>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {uploading === 'logo' ? 'Uploading...' : 'Click to upload logo'}
                  </span>
                  <input
                    type="file"
                    accept={BRANDING_IMAGE_MIME_TYPES.join(',')}
                    className="hidden"
                    disabled={!isHydrated || !effectiveCanWrite || uploading !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload('logo', file);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          </section>

          {/* Header Image — full-width in FormGrid */}
          <section className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">Header Image</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Appears at the top of emails and certificates. Recommended: 600x200px.
            </p>
            <div className="mt-4">
              {headerImageUrl ? (
                <div className="space-y-3">
                  <ResponsiveImage
                    src={headerImageUrl}
                    alt="Header image"
                    context="full-width"
                    aspectRatio="3/1"
                    className="w-full rounded-lg border"
                  />
                  {effectiveCanWrite && (
                    <button
                      onClick={() => handleImageDelete('header')}
                      className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </div>
              ) : (
                <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 hover:bg-border/20 ${(!isHydrated || !effectiveCanWrite) ? 'pointer-events-none opacity-50' : ''}`}>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {uploading === 'header' ? 'Uploading...' : 'Click to upload header image'}
                  </span>
                  <input
                    type="file"
                    accept={BRANDING_IMAGE_MIME_TYPES.join(',')}
                    className="hidden"
                    disabled={!isHydrated || !effectiveCanWrite || uploading !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload('header', file);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          </section>

          {/* Colors — side-by-side via FormGrid */}
          <section className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">Brand Colors</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Used in emails, certificates, and the public event page.
            </p>
            <div className="mt-4">
              <FormGrid columns={2}>
                <div>
                  <label className="block text-sm font-medium">Primary Color</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      disabled={!isHydrated || !effectiveCanWrite}
                      className="h-10 w-10 cursor-pointer rounded border"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      disabled={!isHydrated || !effectiveCanWrite}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                      placeholder="#1E40AF"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium">Secondary Color</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      disabled={!isHydrated || !effectiveCanWrite}
                      className="h-10 w-10 cursor-pointer rounded border"
                    />
                    <input
                      type="text"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      disabled={!isHydrated || !effectiveCanWrite}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                      placeholder="#9333EA"
                    />
                  </div>
                </div>
              </FormGrid>
            </div>
          </section>

          {/* Communication Settings — full-width fields */}
          <section className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">Communication Branding</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Customize how notifications appear to recipients.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium">Email Sender Name</label>
                <input
                  type="text"
                  value={emailSenderName}
                  onChange={(e) => setEmailSenderName(e.target.value)}
                  disabled={!isHydrated || !effectiveCanWrite}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                  placeholder="e.g., GEM India 2026"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Email Footer Text</label>
                <textarea
                  value={emailFooterText}
                  onChange={(e) => setEmailFooterText(e.target.value)}
                  disabled={!isHydrated || !effectiveCanWrite}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                  placeholder="e.g., Organized by GEM India Foundation..."
                  rows={3}
                  maxLength={500}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">WhatsApp Message Prefix</label>
                <input
                  type="text"
                  value={whatsappPrefix}
                  onChange={(e) => setWhatsappPrefix(e.target.value)}
                  disabled={!isHydrated || !effectiveCanWrite}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                  placeholder="e.g., [GEM India 2026]"
                  maxLength={200}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right column: Preview */}
        {showPreview && (
          <div className="space-y-6">
            <section className="rounded-lg border bg-card p-6">
              <h2 className="text-lg font-semibold">Email Preview</h2>
              <div className="mt-4 overflow-hidden rounded-lg border">
                {/* Email mock */}
                <div
                  className="p-4"
                  style={{ backgroundColor: primaryColor }}
                >
                  <div className="flex items-center gap-3">
                    {logoUrl && (
                      <ResponsiveImage
                        src={logoUrl}
                        alt="Logo"
                        context="thumbnail"
                        aspectRatio="1/1"
                        className="h-10 w-10 rounded bg-white p-1"
                      />
                    )}
                    <span className="text-lg font-bold text-white">
                      {emailSenderName || eventName}
                    </span>
                  </div>
                </div>
                {headerImageUrl && (
                  <ResponsiveImage
                    src={headerImageUrl}
                    alt="Header"
                    context="full-width"
                    aspectRatio="3/1"
                    className="aspect-[3/1] max-h-48 w-full"
                  />
                )}
                <div className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Dear Dr. Example,
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your registration has been confirmed. Please find your details below...
                  </p>
                  <div
                    className="mt-4 inline-block rounded-md px-4 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: secondaryColor }}
                  >
                    View Registration
                  </div>
                </div>
                {emailFooterText && (
                  <div className="border-t bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">{emailFooterText}</p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-lg border bg-card p-6">
              <h2 className="text-lg font-semibold">WhatsApp Preview</h2>
              <div className="mt-4 rounded-lg bg-[#E5DDD5] p-4">
                <div className="max-w-xs rounded-lg bg-white p-3 shadow-sm">
                  <p className="text-sm">
                    {whatsappPrefix && <strong>{whatsappPrefix} </strong>}
                    Dear Dr. Example, your registration for {eventName} has been confirmed.
                  </p>
                  <p className="mt-1 text-right text-xs text-gray-400">10:30 AM</p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
