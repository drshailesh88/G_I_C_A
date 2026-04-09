'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateCertificateTemplate } from '@/lib/actions/certificate';
import type { Template as PdfmeTemplate } from '@pdfme/common';

type Props = {
  eventId: string;
  templateId: string;
  templateName: string;
  certificateType: string;
  templateJson: Record<string, unknown>;
  pageSize: string;
  orientation: string;
  allowedVariables: string[];
  status: string;
  versionNo: number;
};

// Default blank A4 landscape template for pdfme
function getBlankTemplate(orientation: string): PdfmeTemplate {
  const isLandscape = orientation === 'landscape';
  return {
    basePdf: {
      width: isLandscape ? 297 : 210,
      height: isLandscape ? 210 : 297,
      padding: [10, 10, 10, 10],
    },
    schemas: [[]],
  };
}

function isValidPdfmeTemplate(json: Record<string, unknown>): json is PdfmeTemplate {
  if (json === null || typeof json !== 'object') return false;
  if (!('schemas' in json) || !Array.isArray(json.schemas)) return false;
  if (!('basePdf' in json)) return false;

  // basePdf must be a string (data URI / URL), ArrayBuffer, Uint8Array, or a BlankPdf object
  const basePdf = json.basePdf;
  if (typeof basePdf === 'string' || basePdf instanceof ArrayBuffer || basePdf instanceof Uint8Array) {
    return true;
  }
  // BlankPdf object: must have numeric width and height
  if (typeof basePdf === 'object' && basePdf !== null) {
    const bp = basePdf as Record<string, unknown>;
    return typeof bp.width === 'number' && typeof bp.height === 'number';
  }
  return false;
}

export function CertificateEditorClient({
  eventId,
  templateId,
  templateName,
  certificateType,
  templateJson,
  pageSize,
  orientation,
  allowedVariables,
  status,
  versionNo,
}: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<InstanceType<typeof import('@pdfme/ui').Designer> | null>(null);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Determine initial template
  const initialTemplate = isValidPdfmeTemplate(templateJson)
    ? templateJson
    : getBlankTemplate(orientation);

  // Dynamically import and initialize pdfme Designer (client-only, no SSR)
  useEffect(() => {
    let cancelled = false;

    async function initDesigner() {
      if (!containerRef.current) return;

      const [{ Designer }, { text, image, line, rectangle, ellipse, barcodes }] =
        await Promise.all([
          import('@pdfme/ui'),
          import('@pdfme/schemas'),
        ]);

      if (cancelled || !containerRef.current) return;

      const designer = new Designer({
        domContainer: containerRef.current,
        template: initialTemplate as PdfmeTemplate,
        plugins: { text, image, line, rectangle, ellipse, ...barcodes },
      });

      designer.onChangeTemplate(() => {
        setHasChanges(true);
        setSaveSuccess(false);
      });

      designerRef.current = designer;
      setLoaded(true);
    }

    initDesigner();

    return () => {
      cancelled = true;
      if (designerRef.current) {
        // pdfme Designer has a destroy method to clean up event listeners and DOM
        (designerRef.current as unknown as { destroy?: () => void }).destroy?.();
        designerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save template to DB
  const handleSave = useCallback(() => {
    if (!designerRef.current || status === 'archived') return;
    setError(null);
    setSaveSuccess(false);

    const currentTemplate = designerRef.current.getTemplate();

    startSaving(async () => {
      try {
        await updateCertificateTemplate(eventId, {
          templateId,
          templateJson: currentTemplate as Record<string, unknown>,
        });
        setSaveSuccess(true);
        setHasChanges(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save template');
      }
    });
  }, [eventId, templateId, status]);

  // Preview: generate a sample PDF with placeholder values
  const handlePreview = useCallback(async () => {
    if (!designerRef.current) return;
    setError(null);

    try {
      const { generate } = await import('@pdfme/generator');
      const { text, image, line, rectangle, ellipse, barcodes } = await import('@pdfme/schemas');

      const currentTemplate = designerRef.current.getTemplate();

      // Build sample inputs from allowed variables
      const sampleInput: Record<string, string> = {};
      for (const varName of allowedVariables) {
        sampleInput[varName] = `{${varName}}`;
      }
      // Also fill any schema fields that exist
      for (const page of currentTemplate.schemas) {
        for (const schema of page) {
          if (schema.name && !(schema.name in sampleInput)) {
            sampleInput[schema.name] = `{${schema.name}}`;
          }
        }
      }

      const pdf = await generate({
        template: currentTemplate,
        inputs: [sampleInput],
        plugins: { text, image, line, rectangle, ellipse, ...barcodes },
      });

      const blob = new Blob([pdf.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Clean up after a delay
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview generation failed');
    }
  }, [allowedVariables]);

  // Keyboard shortcut: Ctrl/Cmd + S to save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const isReadOnly = status === 'archived';

  return (
    <div className="flex h-screen flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/events/${eventId}/certificates`)}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            &larr; Back
          </button>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">{templateName}</h1>
            <p className="text-xs text-gray-500">
              {certificateType.replace(/_/g, ' ')} &middot; {pageSize} &middot; v{versionNo}
              {status !== 'draft' && (
                <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {status}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dynamic field reference */}
          {allowedVariables.length > 0 && (
            <div className="hidden items-center gap-1 text-xs text-gray-400 lg:flex">
              <span>Fields:</span>
              {allowedVariables.slice(0, 5).map((v) => (
                <code key={v} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px]">
                  {`{${v}}`}
                </code>
              ))}
              {allowedVariables.length > 5 && (
                <span>+{allowedVariables.length - 5} more</span>
              )}
            </div>
          )}

          {error && (
            <span className="text-xs text-red-600">{error}</span>
          )}
          {saveSuccess && (
            <span className="text-xs text-green-600">Saved</span>
          )}

          <button
            onClick={handlePreview}
            disabled={!loaded}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Preview PDF
          </button>

          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving || !loaded}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : hasChanges ? 'Save *' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {!loaded && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-500">Loading designer...</p>
        </div>
      )}

      {/* Archived warning */}
      {isReadOnly && (
        <div className="bg-yellow-50 px-4 py-2 text-center text-sm text-yellow-700">
          This template is archived and cannot be edited. Revert to draft to make changes.
        </div>
      )}

      {/* pdfme Designer container */}
      <div
        ref={containerRef}
        className={`flex-1 ${!loaded ? 'hidden' : ''}`}
        data-testid="pdfme-designer-container"
      />
    </div>
  );
}
