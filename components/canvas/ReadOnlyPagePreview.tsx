import React, { forwardRef } from 'react';
import clsx from 'clsx';
import type { AppNode, PageTemplate, TemplateElement } from '../../types';
import { sortElementsForRender } from '../../services/layers';
import { CanvasElement } from './CanvasElement';

export interface ReadOnlyPagePreviewProps {
  template: PageTemplate;
  elements?: TemplateElement[];
  nodes: Record<string, AppNode>;
  currentNodeId: string;
  scale: number;
  greyscalePreview?: boolean;
  backgroundOverlay?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  testId?: string;
  interactive?: boolean;
  renderElement?: (element: TemplateElement) => React.ReactNode;
}

export const ReadOnlyPagePreview = forwardRef<HTMLDivElement, ReadOnlyPagePreviewProps>(function ReadOnlyPagePreview({
  template,
  elements = template.elements,
  nodes,
  currentNodeId,
  scale,
  greyscalePreview,
  backgroundOverlay,
  children,
  className,
  testId,
  interactive = false,
  renderElement,
}, ref) {
  return (
    <div
      ref={ref}
      data-testid={testId}
      className={clsx('bg-white relative overflow-hidden', className)}
      style={{ width: template.width * scale, height: template.height * scale }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: template.width,
          height: template.height,
          pointerEvents: interactive ? undefined : 'none',
        }}
      >
        {backgroundOverlay}
        <div style={{ isolation: 'isolate', filter: greyscalePreview ? 'grayscale(1)' : undefined }}>
          {sortElementsForRender(elements, template.layers).map(element => (
            renderElement ? renderElement(element) : (
              <CanvasElement
                key={element.id}
                element={element}
                selected={false}
                nodes={nodes}
                currentNodeId={currentNodeId}
                tool="select"
                showHandles={false}
                isEditing={false}
              />
            )
          ))}
        </div>
        {children}
      </div>
    </div>
  );
});
