import React, { Component, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import {
  buildVariantPreviews,
  fitTemplateScale,
  nodesForTemplatePreview,
  PREVIEW_BATCH_SIZE,
} from '../services/generatorVisualPreview';
import type { GeneratorPreviewPayload, TemplatePreviewDescriptor } from '../services/generatorVisualPreview';
import { ReadOnlyPagePreview } from './canvas/ReadOnlyPagePreview';

export interface GeneratorVisualPreviewModalProps {
  payload: GeneratorPreviewPayload;
  currentProjectName: string;
  onBack: () => void;
  onReplace: () => boolean;
  onCreateProject: (name: string) => boolean;
}

interface PreviewErrorBoundaryProps {
  templateName: string;
  children: ReactNode;
}

interface PreviewErrorBoundaryState {
  error: Error | null;
}

class PreviewErrorBoundary extends Component<PreviewErrorBoundaryProps, PreviewErrorBoundaryState> {
  state: PreviewErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PreviewErrorBoundaryState {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Error state is rendered locally so one template cannot block project actions.
  }

  render() {
    if (this.state.error) {
      return <div role="status">Could not render {this.props.templateName}</div>;
    }
    return this.props.children;
  }
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const trapFocus = (event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) => {
  if (event.key !== 'Tab' || !container) return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(element => element.getAttribute('aria-hidden') !== 'true' && !element.hasAttribute('hidden'));
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === container)) {
    event.preventDefault();
    first.focus();
  }
};

const countLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`;
const usageLabel = (count: number) => `${count} ${count === 1 ? 'use' : 'uses'}`;

export const GeneratorVisualPreviewModal: React.FC<GeneratorVisualPreviewModalProps> = ({
  payload,
  currentProjectName,
  onBack,
  onReplace,
  onCreateProject,
}) => {
  const descriptors = useMemo(() => buildVariantPreviews(payload.project), [payload.project]);
  const domIdPrefix = useId();
  const variantDomIds = useMemo(() => new Map(descriptors.map((variant, index) => [variant.variantId, {
    tab: `${domIdPrefix}-variant-tab-${index}`,
    panel: `${domIdPrefix}-variant-panel-${index}`,
  }])), [descriptors, domIdPrefix]);
  const [selectedVariantId, setSelectedVariantId] = useState(payload.project.activeVariantId);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>(() => ({
    [payload.project.activeVariantId]: PREVIEW_BATCH_SIZE,
  }));
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(`${currentProjectName} – Generated`);
  const [nameError, setNameError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const namingRef = useRef<HTMLDivElement>(null);
  const namingInputRef = useRef<HTMLInputElement>(null);
  const namingTriggerRef = useRef<HTMLButtonElement>(null);
  const lightboxTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreLightboxFocusRef = useRef(false);
  const restoreNamingFocusRef = useRef(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const selectedVariant = descriptors.find(variant => variant.variantId === selectedVariantId) ?? descriptors[0];
  const selectedVariantDomIds = selectedVariant ? variantDomIds.get(selectedVariant.variantId) : undefined;
  const selectedTemplates = selectedVariant?.templates ?? [];
  const visibleCount = visibleCounts[selectedVariantId] ?? PREVIEW_BATCH_SIZE;
  const visibleTemplates = selectedTemplates.slice(0, visibleCount);
  const lightboxDescriptor = lightboxIndex === null ? null : selectedTemplates[lightboxIndex];

  useLayoutEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useLayoutEffect(() => {
    if (lightboxIndex !== null) {
      lightboxRef.current?.focus();
    } else if (restoreLightboxFocusRef.current) {
      restoreLightboxFocusRef.current = false;
      lightboxTriggerRef.current?.focus();
    }
  }, [lightboxIndex]);

  useLayoutEffect(() => {
    if (naming) {
      namingInputRef.current?.focus();
    } else if (restoreNamingFocusRef.current) {
      restoreNamingFocusRef.current = false;
      namingTriggerRef.current?.focus();
    }
  }, [naming]);

  const selectVariant = (variantId: string) => {
    setSelectedVariantId(variantId);
    setVisibleCounts(current => ({ ...current, [variantId]: PREVIEW_BATCH_SIZE }));
    setLightboxIndex(null);
  };

  const handleVariantArrowKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = descriptors.findIndex(variant => variant.variantId === selectedVariantId);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % descriptors.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + descriptors.length) % descriptors.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = descriptors.length - 1;
    const next = descriptors[nextIndex];
    if (!next) return;
    selectVariant(next.variantId);
    tabRefs.current[next.variantId]?.focus();
  };

  const openLightbox = (index: number, trigger: HTMLButtonElement) => {
    lightboxTriggerRef.current = trigger;
    setLightboxIndex(index);
  };

  const closeLightbox = () => {
    restoreLightboxFocusRef.current = true;
    setLightboxIndex(null);
  };

  const moveLightbox = (offset: number) => {
    setLightboxIndex(current => {
      if (current === null) return null;
      return Math.max(0, Math.min(selectedTemplates.length - 1, current + offset));
    });
  };

  const handleLightboxKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLightbox();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveLightbox(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveLightbox(1);
      return;
    }
    trapFocus(event, lightboxRef.current);
  };

  const closeNaming = () => {
    restoreNamingFocusRef.current = true;
    setNaming(false);
    setNameError(null);
  };

  const handleNamingKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeNaming();
      return;
    }
    trapFocus(event, namingRef.current);
  };

  const submitName = () => {
    const trimmed = name.trim();
    if (!trimmed) return setNameError('Project name is required.');
    if (trimmed.length > 100) return setNameError('Project name must be 100 characters or fewer.');
    if (onCreateProject(trimmed)) return;
    setNameError('Could not create project. Try again.');
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onBack();
      return;
    }
    trapFocus(event, dialogRef.current);
  };

  const renderPreview = (descriptor: TemplatePreviewDescriptor, scale: number) => (
    <PreviewErrorBoundary key={`${descriptor.variantId}-${descriptor.templateId}`} templateName={descriptor.template.name}>
      <ReadOnlyPagePreview
        template={descriptor.template}
        nodes={nodesForTemplatePreview(payload.project.nodes, descriptor)}
        currentNodeId={descriptor.nodeId}
        scale={scale}
      />
    </PreviewErrorBoundary>
  );

  const lightboxScale = lightboxDescriptor
    ? fitTemplateScale(
      lightboxDescriptor.template,
      Math.max(220, (typeof window === 'undefined' ? 1024 : window.innerWidth) - 160),
      Math.max(240, (typeof window === 'undefined' ? 768 : window.innerHeight) - 260),
    )
    : 1;
  const nestedModalOpen = lightboxDescriptor !== null || naming;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="generator-preview-title"
        aria-hidden={nestedModalOpen || undefined}
        inert={nestedModalOpen}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-slate-50 shadow-2xl outline-none"
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 id="generator-preview-title" className="text-xl font-bold text-slate-900">Generated Project Preview</h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <span>{selectedVariant?.variantName} variant</span>
              <span>{countLabel(payload.summary.variantCount, 'variant')}</span>
              <span>{countLabel(payload.summary.templateCount, 'template')}</span>
              <span>{countLabel(payload.summary.nodeCount, 'node')}</span>
              <span>{countLabel(payload.summary.estimatedPageCount, 'estimated page')}</span>
            </div>
          </div>
          <button type="button" onClick={onBack} className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Close preview
          </button>
        </header>

        <div className="border-b border-slate-200 bg-white px-6 pt-3">
          <div role="tablist" aria-label="Generated variants" className="flex gap-1 overflow-x-auto">
            {descriptors.map(variant => {
              const domIds = variantDomIds.get(variant.variantId)!;
              return (
                <button
                  key={variant.variantId}
                  ref={element => { tabRefs.current[variant.variantId] = element; }}
                  type="button"
                  role="tab"
                  aria-selected={selectedVariantId === variant.variantId}
                  aria-controls={domIds.panel}
                  id={domIds.tab}
                  tabIndex={selectedVariantId === variant.variantId ? 0 : -1}
                  onClick={() => selectVariant(variant.variantId)}
                  onKeyDown={handleVariantArrowKey}
                  className={`border-b-2 px-4 py-2 text-sm font-medium ${selectedVariantId === variant.variantId ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                  {variant.variantName}
                </button>
              );
            })}
          </div>
        </div>

        {selectedVariant && selectedVariantDomIds && (
          <div
            role="tabpanel"
            id={selectedVariantDomIds.panel}
            aria-labelledby={selectedVariantDomIds.tab}
            className="min-h-0 flex-1 overflow-y-auto p-6"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-5">
              {visibleTemplates.map((descriptor, index) => {
                const usage = descriptor.unused ? 'unused' : usageLabel(descriptor.usageCount);
                return (
                  <button
                    key={descriptor.templateId}
                    type="button"
                    aria-label={`${descriptor.template.name}, ${descriptor.variantName}, ${usage}`}
                    onClick={event => openLightbox(index, event.currentTarget)}
                    className="flex min-h-[330px] flex-col items-center rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <div className="flex min-h-[240px] w-full items-center justify-center overflow-hidden rounded bg-slate-100">
                      {renderPreview(descriptor, fitTemplateScale(descriptor.template, 220, 240))}
                    </div>
                    <div className="mt-3 w-full">
                      <div className="font-semibold text-slate-900">{descriptor.template.name}</div>
                      {descriptor.unused ? (
                        <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Unused</span>
                      ) : (
                        <div className="mt-1 flex items-center justify-between gap-2 text-sm text-slate-600">
                          <span className="truncate">{descriptor.nodeTitle}</span>
                          <span className="shrink-0">{usageLabel(descriptor.usageCount)}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {visibleCount < selectedTemplates.length && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCounts(current => ({
                    ...current,
                    [selectedVariantId]: Math.min(selectedTemplates.length, visibleCount + PREVIEW_BATCH_SIZE),
                  }))}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        )}

        <footer className="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button type="button" onClick={onBack} className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Back to Scripts
          </button>
          <button
            ref={namingTriggerRef}
            type="button"
            onClick={() => setNaming(true)}
            className="rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            Create As New Project
          </button>
          <button type="button" onClick={onReplace} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Replace Current Project
          </button>
        </footer>
      </div>

      {lightboxDescriptor && lightboxIndex !== null && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 p-6">
            <div
              ref={lightboxRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="generator-lightbox-title"
              tabIndex={-1}
              onKeyDown={handleLightboxKeyDown}
              className="flex max-h-full max-w-full flex-col rounded-xl bg-white p-5 shadow-2xl outline-none"
            >
              <div className="mb-4 flex items-start justify-between gap-8">
                <div>
                  <h3 id="generator-lightbox-title" className="text-lg font-bold text-slate-900">{lightboxDescriptor.template.name} preview</h3>
                  <p className="text-sm text-slate-600">
                    <span>{lightboxDescriptor.unused ? 'Unused template' : lightboxDescriptor.nodeTitle}</span>
                    {' · '}<span>{usageLabel(lightboxDescriptor.usageCount)}</span>{' · '}<span>{lightboxDescriptor.variantName}</span>
                  </p>
                </div>
                <button type="button" onClick={closeLightbox} className="rounded px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Close</button>
              </div>
              <div className="min-h-0 overflow-auto bg-slate-100">
                {renderPreview(lightboxDescriptor, lightboxScale)}
              </div>
              <div className="mt-4 flex justify-between gap-3">
                <button type="button" disabled={lightboxIndex === 0} onClick={() => moveLightbox(-1)} className="rounded-md border px-4 py-2 text-sm disabled:opacity-40">Previous</button>
                <button type="button" disabled={lightboxIndex === selectedTemplates.length - 1} onClick={() => moveLightbox(1)} className="rounded-md border px-4 py-2 text-sm disabled:opacity-40">Next</button>
              </div>
            </div>
        </div>
      )}

      {naming && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 p-4">
            <div
              ref={namingRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="generator-name-title"
              tabIndex={-1}
              onKeyDown={handleNamingKeyDown}
              className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl outline-none"
            >
              <h3 id="generator-name-title" className="text-lg font-bold text-slate-900">Create Generated Project</h3>
              <form
                className="mt-4"
                onSubmit={event => {
                  event.preventDefault();
                  submitName();
                }}
              >
                <label htmlFor="generated-project-name" className="block text-sm font-medium text-slate-700">Project name</label>
                <input
                  ref={namingInputRef}
                  id="generated-project-name"
                  value={name}
                  aria-describedby={nameError ? 'generated-project-name-error' : undefined}
                  onChange={event => {
                    setName(event.target.value);
                    setNameError(null);
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                {nameError && <p id="generated-project-name-error" role="alert" className="mt-2 text-sm text-red-700">{nameError}</p>}
                <div className="mt-5 flex justify-end gap-3">
                  <button type="button" onClick={closeNaming} className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Cancel</button>
                  <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Create Project</button>
                </div>
              </form>
            </div>
        </div>
      )}
    </div>
  );
};
