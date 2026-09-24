import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PlaySquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Calendar,
  ShieldAlert,
  ArrowRight,
  Tv,
  Coins,
  Zap,
  Volume2,
  VolumeX,
  FastForward,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export function VideoTasksView() {
  const { user, wallet, refreshUserData } = useAuth();
  const { showToast } = useToast();

  const isFreeUser = Boolean(user?.isTrial || !user?.activePackageId || user?.activePackageId === 'pkg_trial');

  const [loading, setLoading] = useState(true);
  const [taskData, setTaskData] = useState<any>(null);
  const [activeTask, setActiveTask] = useState<any>(null);
  const [countdown, setCountdown] = useState(10);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [autoPlayNext, setAutoPlayNext] = useState(false);
  const [autoTransitioning, setAutoTransitioning] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isTransitioningRef = useRef(false);

  useEffect(() => {
    if (!isFreeUser) {
      setAutoPlayNext(true);
    } else {
      setAutoPlayNext(false);
    }
  }, [isFreeUser]);

  const handleToggleAutoPlay = () => {
    if (isFreeUser) {
      showToast(
        'info',
        'VIP Feature (শুধুমাত্র পেইড মেম্বার)',
        'অটোপ্লে (Auto-Play) সুবিধা শুধুমাত্র Bronze বা VIP পেইড মেম্বারদের জন্য। স্বয়ংক্রিয় ভিডিও প্লে করতে প্যাকেজ আপগ্রেড করুন।'
      );
      return;
    }
    setAutoPlayNext(!autoPlayNext);
  };

  const fetchTasks = async (isRetry = false) => {
    try {
      setLoading(true);
      const res = await apiRequest('/api/tasks/today');
      setTaskData(res);
      if (res.tasks && res.tasks.length > 0 && !activeTask) {
        // Prefer first pending task if any, otherwise first task
        const pendingTask = res.tasks.find((t: any) => !t.isCompletedToday);
        setActiveTask(pendingTask || res.tasks[0]);
      }
    } catch (err: any) {
      if (!isRetry) {
        // Cold start auto-retry
        setTimeout(() => {
          fetchTasks(true);
        }, 600);
        return;
      }
      showToast('error', 'Task Error', err.message || 'Could not fetch tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // 10-Second Countdown logic
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && countdown > 0) {
      interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            setIsPlaying(false);
            setIsCompleted(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, countdown]);

  // Auto-play next task when current task reaches 0s countdown (VIP Only)
  useEffect(() => {
    if (isCompleted && autoPlayNext && !isFreeUser && !claiming && activeTask && !isTransitioningRef.current) {
      handleClaimAndAutoNext();
    }
  }, [isCompleted, autoPlayNext, isFreeUser, claiming, activeTask]);

  const handleStartTask = (task: any) => {
    isTransitioningRef.current = false;
    setAutoTransitioning(false);
    setActiveTask(task);
    setCountdown(10);
    setIsCompleted(false);
    setIsPlaying(true);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleClaimAndAutoNext = async () => {
    if (!activeTask || claiming || isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setClaiming(true);

    try {
      const res = await apiRequest('/api/tasks/complete', {
        method: 'POST',
        body: JSON.stringify({
          taskId: activeTask.id,
          watchDurationSeconds: 10,
        }),
      });

      showToast(
        'success',
        'Reward Credited!',
        `৳${res.rewardEarned} credited to your wallet! Remaining tasks today: ${res.remainingCount}`
      );

      await refreshUserData();
      const updatedData = await apiRequest('/api/tasks/today');
      setTaskData(updatedData);

      if (updatedData.remainingCount > 0 && updatedData.tasks && updatedData.tasks.length > 0) {
        // Find next task in list
        const currentIndex = updatedData.tasks.findIndex((t: any) => t.id === activeTask.id);
        const nextIndex = (currentIndex + 1) % updatedData.tasks.length;
        const nextTask = updatedData.tasks[nextIndex];

        setAutoTransitioning(true);
        setTimeout(() => {
          setAutoTransitioning(false);
          setActiveTask(nextTask);
          setCountdown(10);
          setIsCompleted(false);
          setIsPlaying(true);
          isTransitioningRef.current = false;

          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
          }
        }, 1200);
      } else {
        isTransitioningRef.current = false;
        setIsCompleted(false);
        setIsPlaying(false);
        showToast('info', 'Daily Limit Complete', 'Congratulations! You have completed all tasks for today.');
      }
    } catch (err: any) {
      isTransitioningRef.current = false;
      showToast('error', 'Claim Failed', err.message || 'Could not claim task reward');
      setIsPlaying(false);
    } finally {
      setClaiming(false);
    }
  };

  const handleManualClaim = async () => {
    if (!isCompleted || countdown > 0) {
      showToast('error', 'Watch Required', 'You must watch the full 10 seconds before claiming.');
      return;
    }

    try {
      setClaiming(true);
      const res = await apiRequest('/api/tasks/complete', {
        method: 'POST',
        body: JSON.stringify({
          taskId: activeTask?.id,
          watchDurationSeconds: 10,
        }),
      });

      showToast(
        'success',
        'Reward Credited!',
        `৳${res.rewardEarned} added to your wallet! Remaining tasks today: ${res.remainingCount}`
      );

      await refreshUserData();
      const updatedData = await apiRequest('/api/tasks/today');
      setTaskData(updatedData);

      setIsCompleted(false);
      setCountdown(10);

      if (autoPlayNext && !isFreeUser && updatedData.remainingCount > 0 && updatedData.tasks?.length > 0) {
        const currentIndex = updatedData.tasks.findIndex((t: any) => t.id === activeTask?.id);
        const nextIndex = (currentIndex + 1) % updatedData.tasks.length;
        const nextTask = updatedData.tasks[nextIndex];

        setAutoTransitioning(true);
        setTimeout(() => {
          setAutoTransitioning(false);
          setActiveTask(nextTask);
          setCountdown(10);
          setIsPlaying(true);
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
          }
        }, 1000);
      }
    } catch (err: any) {
      showToast('error', 'Claim Failed', err.message || 'Could not claim task reward');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center py-20 text-slate-400">
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-medium">Checking task availability & countdown verification engine...</p>
      </div>
    );
  }

  // Sunday or Holiday maintenance screen
  if (taskData?.tasksDisabled) {
    return (
      <div id="tasks-disabled-view" className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="p-8 rounded-3xl glass-panel border border-white/15 shadow-2xl space-y-4 relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(245,158,11,0.2)]">
            <Calendar className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white">Tasks Suspended Today</h2>
          <p className="text-sm text-slate-200 leading-relaxed">{taskData.reason}</p>
          <div className="pt-2 text-xs text-slate-400">
            Daily video tasks will automatically resume tomorrow at 12:00 AM midnight.
          </div>
        </div>
      </div>
    );
  }

  const pkg = taskData?.package;
  const completed = taskData?.completedCount || 0;
  const total = taskData?.totalAllowed || 1;
  const remaining = taskData?.remainingCount || 0;

  return (
    <div id="video-tasks-root" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-24 md:pb-12">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl glass-panel border border-white/10 shadow-xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              {pkg?.name} Package
            </span>
            <span className="text-xs text-slate-300 font-medium">10-Second Sponsor Videos</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Daily Video Tasks</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          {/* Auto-Play Next Task Switch */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/[0.04] border border-white/10">
            <Zap className={`w-4 h-4 ${autoPlayNext && !isFreeUser ? 'text-amber-300 fill-amber-300 animate-pulse' : 'text-slate-500'}`} />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-white leading-tight">Auto-Play Next</span>
                {isFreeUser && (
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    VIP Only
                  </span>
                )}
              </div>
              <span className="text-[9px] text-slate-400">
                {isFreeUser ? 'লক করা (VIP সুবিধা)' : 'অটো প্লে'}
              </span>
            </div>
            <button
              type="button"
              id="btn-toggle-autoplay"
              onClick={handleToggleAutoPlay}
              aria-label="Toggle auto play next task"
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ml-1 cursor-pointer ${
                autoPlayNext && !isFreeUser ? 'bg-emerald-400' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  autoPlayNext && !isFreeUser ? 'translate-x-5.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="px-4 py-2 rounded-2xl bg-white/[0.04] border border-white/10 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Today's Progress</span>
            <span className="text-sm font-bold text-white">
              {completed} / {total} Completed
            </span>
          </div>
          <div className="px-4 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-right">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block">Rate / Video</span>
            <span className="text-sm font-bold text-emerald-300">৳{pkg?.incomePerVideo} TK</span>
          </div>
        </div>
      </div>

      {/* Main Video Task Player Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Task Video Canvas */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative rounded-3xl overflow-hidden border border-white/15 bg-black/90 aspect-video flex items-center justify-center shadow-2xl group">
            {activeTask && (
              <video
                ref={videoRef}
                src={activeTask.videoUrl || 'https://media.w3.org/2010/05/sintel/trailer.mp4'}
                poster={activeTask.thumbnailUrl}
                playsInline
                preload="metadata"
                muted={isMuted}
                loop
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.includes('w3.org')) {
                    target.src = 'https://media.w3.org/2010/05/sintel/trailer.mp4';
                    target.play().catch(() => {});
                  }
                }}
                className="w-full h-full object-cover"
              />
            )}

            {/* Countdown Overlay Badge */}
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-white/15 px-3.5 py-1.5 rounded-full text-white font-mono text-sm shadow-lg">
              <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>
                {isPlaying
                  ? `Countdown: ${countdown}s`
                  : isCompleted
                  ? 'Task Finished!'
                  : '10s Watch Required'}
              </span>
            </div>

            {/* Category Tag */}
            <div className="absolute top-4 right-4 z-20 bg-slate-950/80 backdrop-blur-md border border-white/15 px-3 py-1 rounded-full text-xs text-slate-200 shadow-lg">
              {activeTask?.category}
            </div>

            {/* Audio Mute/Unmute Toggle */}
            <button
              type="button"
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                if (videoRef.current) {
                  videoRef.current.muted = nextMuted;
                }
              }}
              className="absolute bottom-4 right-4 z-20 p-2.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-white/15 text-slate-300 hover:text-white transition cursor-pointer shadow-lg active:scale-95"
              title={isMuted ? 'Unmute video' : 'Mute video'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            {/* Auto-Transitioning Overlay */}
            {autoTransitioning && (
              <div className="absolute inset-0 z-30 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="w-14 h-14 rounded-full border-3 border-emerald-400 border-t-transparent animate-spin flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <FastForward className="w-6 h-6 text-emerald-300" />
                </div>
                <div>
                  <p className="text-base font-bold text-white">Task Completed & Reward Added!</p>
                  <p className="text-xs text-emerald-300 font-semibold mt-1">
                    Auto-playing next video task... (স্বয়ংক্রিয় পরবর্তী টাস্ক শুরু হচ্ছে)
                  </p>
                </div>
              </div>
            )}

            {/* Inactive Overlay if not playing */}
            {!isPlaying && !isCompleted && !autoTransitioning && (
              <div className="absolute inset-0 z-10 bg-slate-950/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div
                  className="w-16 h-16 rounded-2xl glass-btn-primary text-slate-950 flex items-center justify-center shadow-2xl transition cursor-pointer active:scale-95 hover:scale-105"
                  onClick={() => handleStartTask(activeTask)}
                >
                  <PlaySquare className="w-8 h-8 fill-current ml-0.5" />
                </div>
                <p className="text-sm font-bold text-white max-w-sm drop-shadow">
                  {remaining > 0
                    ? `Click to watch ${activeTask?.title} (10 seconds)`
                    : 'All tasks completed for today! Check back tomorrow at 12:00 AM.'}
                </p>
              </div>
            )}
          </div>

          {/* Action Bar Below Video */}
          <div className="p-4 sm:p-5 rounded-2xl glass-card border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">{activeTask?.title}</h3>
                {autoPlayNext && !isFreeUser && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Auto-Play
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Reward: <span className="text-emerald-300 font-bold">৳{pkg?.incomePerVideo} TK</span> upon full 10-second viewing
              </p>
            </div>

            {remaining <= 0 ? (
              <span className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-slate-300 font-semibold text-xs">
                Daily Limit Reached
              </span>
            ) : isCompleted && (!autoPlayNext || isFreeUser) ? (
              <button
                id="btn-claim-task-reward"
                onClick={handleManualClaim}
                disabled={claiming}
                className="w-full sm:w-auto px-6 py-3 rounded-xl glass-btn-primary text-slate-950 font-black text-sm shadow-xl transition flex items-center justify-center gap-2 animate-bounce cursor-pointer active:scale-95"
              >
                <Coins className="w-4 h-4" />
                <span>{claiming ? 'Verifying...' : `Claim ৳${pkg?.incomePerVideo} Reward`}</span>
              </button>
            ) : (
              <button
                id="btn-start-watch-task"
                onClick={() => handleStartTask(activeTask)}
                disabled={isPlaying || autoTransitioning}
                className="w-full sm:w-auto px-6 py-3 rounded-xl glass-btn-primary text-slate-950 font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
              >
                <PlaySquare className="w-4 h-4" />
                <span>
                  {autoTransitioning
                    ? 'Loading Next Task...'
                    : isPlaying
                    ? `Watching (${countdown}s)...`
                    : 'Watch & Earn'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Task Queue / Playlist */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Available Sponsor Tasks
          </h4>
          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {taskData?.tasks?.map((task: any, index: number) => {
                const isCurrent = activeTask?.id === task.id;
                const isTaskCompleted = Boolean(task.isCompletedToday);
                return (
                  <div
                    key={task.id}
                    onClick={() => {
                      if (!isPlaying) {
                        setActiveTask(task);
                        setCountdown(10);
                        setIsCompleted(false);
                      }
                    }}
                    className={`p-3 rounded-2xl border transition-all duration-200 flex items-center gap-3 cursor-pointer ${
                      isCurrent
                        ? 'glass-card border-purple-500/50 bg-purple-500/10 text-white shadow-lg shadow-purple-950/30'
                        : isTaskCompleted
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-300 opacity-80'
                        : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.08] hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <div className="w-14 h-10 rounded-xl overflow-hidden shrink-0 bg-white/[0.05] border border-white/10 relative">
                      <img
                        src={task.thumbnailUrl}
                        alt={task.title}
                        className="w-full h-full object-cover"
                      />
                      {isTaskCompleted && (
                        <div className="absolute inset-0 bg-emerald-950/70 backdrop-blur-[1px] flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h5 className="text-xs font-bold truncate">{task.title}</h5>
                        {isTaskCompleted && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                            Completed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span>10s Duration</span>
                        <span>•</span>
                        <span className="text-emerald-300 font-semibold">৳{task.rewardAmount} TK</span>
                      </div>
                    </div>
                  </div>
                );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
