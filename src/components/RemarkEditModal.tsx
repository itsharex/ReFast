import React from "react";

interface RemarkEditModalProps {
  isOpen: boolean;
  editingRemarkUrl: string | null;
  remarkText: string;
  setRemarkText: (text: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function RemarkEditModal({
  isOpen,
  editingRemarkUrl,
  remarkText,
  setRemarkText,
  onClose,
  onSave,
}: RemarkEditModalProps) {
  if (!isOpen || !editingRemarkUrl) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-4 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-3">修改备注</h2>
        <div className="mb-3">
          <div className="text-xs text-gray-600 mb-1">URL:</div>
          <div className="text-xs text-gray-800 break-all mb-3">{editingRemarkUrl}</div>
          <label className="block text-xs font-medium text-gray-700 mb-1">备注:</label>
          <textarea
            value={remarkText}
            onChange={(e) => setRemarkText(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
            rows={3}
            placeholder="输入备注信息..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                onSave();
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
