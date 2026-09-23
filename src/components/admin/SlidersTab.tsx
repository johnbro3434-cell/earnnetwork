import React, { useState, useEffect } from 'react';
import { Sliders, Plus, Image as ImageIcon, Check, X, RefreshCw, Trash2, Eye } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { HomeSlider } from '../../types';
import { ImageUploadInput } from '../common/ImageUploadInput';

export function SlidersTab() {
  const { showToast } = useToast();
  const [sliders, setSliders] = useState<HomeSlider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [buttonText, setButtonText] = useState('Explore Now');
  const [buttonLink, setButtonLink] = useState('packages');

  const loadSliders = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/sliders');
      setSliders(Array.isArray(res) ? res : res.sliders || []);
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSliders();
  }, []);

  const handleCreateSlider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !imageUrl.trim()) {
      showToast('error', 'Missing Data', 'Title and banner image are required.');
      return;
    }

    try {
      await apiRequest('/api/admin/sliders', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim(),
          imageUrl: imageUrl.trim(),
          buttonText: buttonText.trim(),
          buttonLink: buttonLink.trim(),
          status: 'active',
        }),
      });
      showToast('success', 'Slider Created', 'New promotional carousel slide published.');
      setShowAddModal(false);
      setTitle('');
      setSubtitle('');
      setImageUrl('');
      loadSliders();
    } catch (e: any) {
      showToast('error', 'Failed', e.message);
    }
  };

  const handleToggleSlider = async (id: string) => {
    try {
      await apiRequest(`/api/admin/sliders/${id}/toggle`, { method: 'POST' });
      showToast('success', 'Status Changed', 'Banner display toggled.');
      loadSliders();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            Home Carousel & Promotional Banners
          </h2>
          <p className="text-xs text-slate-400">Manage interactive banners displayed on the member dashboard</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadSliders}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Slide
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <p className="col-span-full text-center text-xs text-slate-500 py-10">Loading slides...</p>
        ) : sliders.length === 0 ? (
          <p className="col-span-full text-center text-xs text-slate-500 py-10">No carousel slides found.</p>
        ) : (
          sliders.map(slide => (
            <div
              key={slide.id}
              className="glass-panel rounded-2xl overflow-hidden border border-white/10 flex flex-col"
            >
              <div className="relative h-36 bg-slate-900">
                <img
                  src={slide.imageUrl}
                  alt={slide.title}
                  className="w-full h-full object-cover"
                  onError={e => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';
                  }}
                />
                <div className="absolute top-2 right-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      slide.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {slide.status}
                  </span>
                </div>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-white">{slide.title}</h3>
                  {slide.subtitle && (
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{slide.subtitle}</p>
                  )}
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Link: #{slide.buttonLink || 'packages'}</span>
                  <button
                    onClick={() => handleToggleSlider(slide.id)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] transition-colors"
                  >
                    {slide.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Slider Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Create Promotional Slide
            </h3>

            <form onSubmit={handleCreateSlider} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Headline Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g., bKash 25% Bonus Campaign"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Subtitle / Details</label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={e => setSubtitle(e.target.value)}
                  placeholder="e.g., Instant extra deposit balance today only"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <ImageUploadInput
                id="slider-img-input"
                label="Banner Image"
                value={imageUrl}
                onChange={setImageUrl}
                folder="earnhub_sliders"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Button Text</label>
                  <input
                    type="text"
                    value={buttonText}
                    onChange={e => setButtonText(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Action Link</label>
                  <select
                    value={buttonLink}
                    onChange={e => setButtonLink(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  >
                    <option value="packages">Packages</option>
                    <option value="tasks">Video Tasks</option>
                    <option value="wallet">Deposit/Wallet</option>
                    <option value="referral">Referral Program</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs"
                >
                  Publish Slide
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
