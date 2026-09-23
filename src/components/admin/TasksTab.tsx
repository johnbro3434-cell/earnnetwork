import React, { useState, useEffect } from 'react';
import { PlayCircle, Plus, Trash2, Edit3, Check, X, RefreshCw, Clock, DollarSign } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { VideoTask } from '../../types';
import { ImageUploadInput } from '../common/ImageUploadInput';

export function TasksTab() {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [rewardAmount, setRewardAmount] = useState(25);
  const [category, setCategory] = useState('Sponsor AD');

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/tasks');
      setTasks(Array.isArray(res) ? res : res.tasks || []);
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !videoUrl.trim()) {
      showToast('error', 'Missing Data', 'Title and video URL are required.');
      return;
    }

    try {
      await apiRequest('/api/admin/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          videoUrl: videoUrl.trim(),
          thumbnailUrl: thumbnailUrl.trim() || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
          durationSeconds: 10,
          rewardAmount: Number(rewardAmount),
          category: category.trim(),
          enabled: true,
        }),
      });
      showToast('success', 'Task Created', 'Sponsored video task published successfully.');
      setShowAddModal(false);
      setTitle('');
      setVideoUrl('');
      setThumbnailUrl('');
      loadTasks();
    } catch (e: any) {
      showToast('error', 'Creation Failed', e.message);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Are you sure you want to remove this video task?')) return;
    try {
      await apiRequest(`/api/admin/tasks/${id}`, { method: 'DELETE' });
      showToast('success', 'Deleted', 'Video task removed.');
      loadTasks();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  const handleToggleTask = async (id: string) => {
    try {
      await apiRequest(`/api/admin/tasks/${id}/toggle`, { method: 'POST' });
      showToast('success', 'Toggled', 'Task status updated.');
      loadTasks();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-emerald-400" />
            Sponsored Video Tasks Management
          </h2>
          <p className="text-xs text-slate-400">Configure 10-second micro-tasks and sponsor video assignments</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTasks}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Video Task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <p className="col-span-full text-center text-xs text-slate-500 py-10">Loading video tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="col-span-full text-center text-xs text-slate-500 py-10">No video tasks created yet.</p>
        ) : (
          tasks.map(task => (
            <div
              key={task.id}
              className="glass-panel rounded-2xl overflow-hidden border border-white/10 flex flex-col justify-between"
            >
              <div className="relative h-36 bg-slate-900">
                <img
                  src={task.thumbnailUrl}
                  alt={task.title}
                  className="w-full h-full object-cover"
                  onError={e => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
                  }}
                />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-slate-900/80 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
                  {task.category || 'Sponsor'}
                </div>
                <div className="absolute top-2 right-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      task.enabled !== false
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {task.enabled !== false ? 'Active' : 'Disabled'}
                  </span>
                </div>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-white line-clamp-1">{task.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      10s Duration
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-emerald-400">
                      <DollarSign className="w-3.5 h-3.5" />৳{task.rewardAmount}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                  <button
                    onClick={() => handleToggleTask(task.id)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    {task.enabled !== false ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-emerald-400" />
              Publish Video Task
            </h3>

            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Task Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g., Watch Daraz Mega Sale Commercial"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Video Stream URL (MP4 or Embed)
                </label>
                <input
                  type="text"
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  placeholder="https://assets.mixkit.co/..."
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <ImageUploadInput
                id="task-thumb-input"
                label="Thumbnail Preview Image"
                value={thumbnailUrl}
                onChange={setThumbnailUrl}
                folder="earnhub_tasks"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Reward (BDT)
                  </label>
                  <input
                    type="number"
                    value={rewardAmount}
                    onChange={e => setRewardAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="Sponsor AD"
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  />
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
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs"
                >
                  Publish Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
