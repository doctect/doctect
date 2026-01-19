
import React from 'react';
import { TemplateElement } from '../../types';
import { RotateCw } from 'lucide-react';

export const SelectionHandles: React.FC<{ element: TemplateElement }> = ({ element }) => {
    return (
        <div className="pointer-events-auto">
            {/* Standard Resize Handles (Not for lines) */}
            {element.type !== 'line' && (
                <>
                    {/* Corner Handles (L-shapes) - Outset further for gap */}
                    <div data-resize-handle="ne" className="absolute -right-2 -top-2 w-3 h-3 border-t-2 border-r-2 border-blue-500 cursor-ne-resize z-20" />
                    <div data-resize-handle="sw" className="absolute -left-2 -bottom-2 w-3 h-3 border-b-2 border-l-2 border-blue-500 cursor-sw-resize z-20" />
                    <div data-resize-handle="nw" className="absolute -left-2 -top-2 w-3 h-3 border-t-2 border-l-2 border-blue-500 cursor-nw-resize z-20" />
                    <div data-resize-handle="se" className="absolute -right-2 -bottom-2 w-3 h-3 border-b-2 border-r-2 border-blue-500 cursor-se-resize z-20" />

                    {/* Center Handles (Flat Lines) - Thinner (2px) */}
                    <div data-resize-handle="n" className="absolute left-1/2 -top-2 w-3 h-0.5 bg-blue-500 cursor-n-resize z-20 -translate-x-1/2" />
                    <div data-resize-handle="s" className="absolute left-1/2 -bottom-2 w-3 h-0.5 bg-blue-500 cursor-s-resize z-20 -translate-x-1/2" />
                    <div data-resize-handle="w" className="absolute -left-2 top-1/2 w-0.5 h-3 bg-blue-500 cursor-w-resize z-20 -translate-y-1/2" />
                    <div data-resize-handle="e" className="absolute -right-2 top-1/2 w-0.5 h-3 bg-blue-500 cursor-e-resize z-20 -translate-y-1/2" />
                </>
            )}

            {/* Line Specific Handles (Start/End) */}
            {element.type === 'line' && (
                <>
                    <div
                        data-resize-handle="start"
                        className="absolute w-2.5 h-2.5 bg-blue-500 border border-white cursor-move z-20 shadow-sm"
                        style={{
                            left: -5,
                            top: element.flip ? 'calc(100% - 5px)' : -5
                        }}
                    />
                    <div
                        data-resize-handle="end"
                        className="absolute w-2.5 h-2.5 bg-blue-500 border border-white cursor-move z-20 shadow-sm"
                        style={{
                            right: -5,
                            top: element.flip ? -5 : 'calc(100% - 5px)'
                        }}
                    />
                </>
            )}

            {/* Rotation Handle with larger Hit Box */}
            <div
                data-rotate-handle
                className="absolute left-1/2 -top-11 w-8 h-8 cursor-pointer z-30 -translate-x-1/2 flex items-center justify-center group/rotate"
                title="Rotate"
            >
                <div className="w-6 h-6 bg-white border border-blue-500 rounded-full flex items-center justify-center shadow-sm group-hover/rotate:bg-blue-50">
                    <RotateCw size={12} className="text-blue-600" />
                </div>
            </div>
            {/* Connection Line to Rotate Handle */}
            <div className="absolute left-1/2 -top-10 h-10 w-px bg-blue-500 z-10 -translate-x-1/2 pointer-events-none" />
        </div>
    );
};
