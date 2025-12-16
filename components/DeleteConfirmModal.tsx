import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  nodeTitle: string;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ isOpen, onClose, onConfirm, nodeTitle }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-red-50 p-4 border-b border-red-100 flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-red-900">Delete Page?</h2>
            <button onClick={onClose} className="ml-auto p-1 text-red-400 hover:bg-red-100 rounded-full transition-colors">
                <X size={20} />
            </button>
        </div>
        
        <div className="p-6">
            <p className="text-slate-600 mb-4">
                Are you sure you want to delete <span className="font-semibold text-slate-800">"{nodeTitle}"</span>?
            </p>
            <div className="bg-slate-50 p-3 rounded text-sm text-slate-500 border border-slate-200">
                <p>This action will also delete:</p>
                <ul className="list-disc list-inside mt-1 ml-1 space-y-1">
                    <li>All child pages within this section</li>
                    <li>Any references pointing to these pages</li>
                </ul>
            </div>
        </div>

        <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-sm transition-colors"
          >
            Delete Everything
          </button>
        </div>
      </div>
    </div>
  );
};