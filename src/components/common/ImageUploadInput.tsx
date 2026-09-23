import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Check, Loader2, X } from 'lucide-react';
import { apiRequest } from '../../lib/api';

interface ImageUploadInputProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  placeholder?: string;
  className?: string;
  helperText?: string;
}

export function ImageUploadInput({
  id,
  label = 'Upload Image',
  value,
  onChange,
  folder = 'earnhub_uploads',
  placeholder = 'https://images.unsplash.com/... or upload file',
  className = '',
  helperText,
}: ImageUploadInputProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image size exceeds 5MB limit.');
      return;
    }

    setUploadError('');
    setUploading(true);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        try {
          const res = await apiRequest('/api/upload', {
            method: 'POST',
            body: JSON.stringify({
              image: base64Data,
              folder,
            }),
          });
          if (res && res.url) {
            onChange(res.url);
          } else {
            // fallback directly to base64 or temporary object url if backend fails
            onChange(base64Data);
          }
        } catch {
          // If server upload fails, fallback to using base64 directly
          onChange(base64Data);
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to read image file.');
      setUploading(false);
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-slate-300">
          {label}
        </label>
      )}

      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            id={id}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-9 pr-8 py-2 bg-slate-900/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <ImageIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-xl text-xs font-semibold text-emerald-400 flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5" />
              <span>Browse</span>
            </>
          )}
        </button>
      </div>

      {uploadError && <p className="text-[11px] text-rose-400 mt-1">{uploadError}</p>}
      {helperText && !uploadError && (
        <p className="text-[11px] text-slate-400 mt-1">{helperText}</p>
      )}

      {/* Image Preview */}
      {value && (
        <div className="mt-2 relative w-16 h-16 rounded-lg overflow-hidden border border-white/15 bg-slate-900/60 shadow-inner group">
          <img
            src={value}
            alt="Preview"
            className="w-full h-full object-cover"
            onError={e => {
              (e.target as HTMLImageElement).src =
                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2364748b" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
            }}
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Check className="w-4 h-4 text-emerald-400" />
          </div>
        </div>
      )}
    </div>
  );
}
