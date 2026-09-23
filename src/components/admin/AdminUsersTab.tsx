import React, { useState, useEffect } from 'react';
import { Shield, Plus, Lock, Phone, UserCheck, RefreshCw, Trash2, Edit3 } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AdminUser } from '../../types';

export function AdminUsersTab() {
  const { showToast } = useToast();
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Support Admin');

  const loadAdminUsers = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/admin-users');
      setAdminUsers(Array.isArray(res) ? res : res.adminUsers || []);
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminUsers();
  }, []);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !password) {
      showToast('error', 'Validation Error', 'All fields are required.');
      return;
    }

    try {
      await apiRequest('/api/admin/admin-users', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          password,
          role,
        }),
      });
      showToast('success', 'Admin Created', `Administrator ${name} added.`);
      setShowAddModal(false);
      setName('');
      setPhone('');
      setPassword('');
      loadAdminUsers();
    } catch (e: any) {
      showToast('error', 'Failed to create admin', e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            Admin Staff & Role Management
          </h2>
          <p className="text-xs text-slate-400">Configure administrative personnel, sub-admins and privilege tiers</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAdminUsers}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Administrator
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="px-4 py-3">Admin Name</th>
                <th className="px-4 py-3">Phone / User</th>
                <th className="px-4 py-3">Role Tier</th>
                <th className="px-4 py-3">Assigned Permissions</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading admin roster...
                  </td>
                </tr>
              ) : adminUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No administrative accounts found.
                  </td>
                </tr>
              ) : (
                adminUsers.map(admin => (
                  <tr key={admin.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-semibold text-white">{admin.name}</td>
                    <td className="px-4 py-3 text-slate-300">{admin.phone}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold text-[10px]">
                        {admin.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      <div className="flex flex-wrap gap-1">
                        {(admin.permissions || []).map((perm, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]"
                          >
                            {perm}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                        Active
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Admin Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              Register New Administrator
            </h3>

            <form onSubmit={handleCreateAdmin} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., Tariqul Islam"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mobile Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="017xxxxxxxx"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Admin Role Tier
                </label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                >
                  <option value="Support Admin">Support Admin</option>
                  <option value="Finance Admin">Finance Admin</option>
                  <option value="Marketing Admin">Marketing Admin</option>
                  <option value="Manager Admin">Manager Admin</option>
                  <option value="Main Admin">Main Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Security Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  required
                />
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
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs"
                >
                  Save Administrator
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
