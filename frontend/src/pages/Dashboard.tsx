import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { useAuthStore } from '../store/useAuthStore';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Users, BookOpen, PlusCircle, Trash2, TrendingUp, Target, Activity } from 'lucide-react';
import { getDashboardPending, getReportsDashboard, type DashboardPendingCounts } from '../services/reports.service';

export const Dashboard: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAdmin = ['super_admin', 'center_admin', 'tech_admin'].includes(currentUser?.role || '');
  const navigate = useNavigate();

  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Center State
  const [showCenterModal, setShowCenterModal] = useState(false);
  const [centerName, setCenterName] = useState('');
  const [centerLocation, setCenterLocation] = useState('');
  const [addingCenter, setAddingCenter] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getReportsDashboard();
      setData(d);
    } catch {
      setError('Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDashboardData();
  }, []);

  const handleAddCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingCenter(true);
    try {
      const m = await import('../services/centers.service');
      await m.createCenter({ name: centerName, location: centerLocation });
      setShowCenterModal(false);
      setCenterName('');
      setCenterLocation('');
      void fetchDashboardData();
    } catch (err) {
      alert('Failed to add center. Please check your permissions.');
    } finally {
      setAddingCenter(false);
    }
  };

  return (
    <PageWrapper
      title="Dashboard Overview"
      actions={
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="secondary" size="sm" className="hidden sm:flex" onClick={() => setShowCenterModal(true)}>
              <PlusCircle size={16} className="mr-2" />
              Add Center
            </Button>
          )}
          <Button variant="primary" size="sm" className="hidden sm:flex" onClick={() => navigate('/students/new')}>
            <PlusCircle size={16} className="mr-2" />
            Add Student
          </Button>
        </div>
      }
    >
      {showCenterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4">
          <Card className="w-full max-w-md bg-white p-6 shadow-xl relative z-50">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Add New Center</h3>
            <form onSubmit={handleAddCenter} className="flex flex-col gap-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-neutral-600 font-medium mb-1 block">Center Name</label>
                <input
                  className="w-full h-11 rounded-lg border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={centerName}
                  onChange={(e) => setCenterName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-neutral-600 font-medium mb-1 block">Location</label>
                <input
                  className="w-full h-11 rounded-lg border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={centerLocation}
                  onChange={(e) => setCenterLocation(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="ghost" type="button" onClick={() => setShowCenterModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" isLoading={addingCenter}>Save Center</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="relative overflow-hidden group border-none shadow-sm hover:shadow-md transition-all">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                <Users size={64} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-600">
                    <Users size={22} />
                  </div>
                  <span className="text-neutral-500 font-bold text-xs uppercase tracking-wider">Total Students</span>
                </div>
                <p className="text-4xl font-black text-neutral-900 mb-1">{Number(data?.totalStudents ?? 0)}</p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
                  <TrendingUp size={14} />
                  <span>+{Number(data?.newStudentsThisMonth ?? 0)} this month</span>
                </div>
              </div>
            </Card>

            <Card className="relative overflow-hidden group border-none shadow-sm hover:shadow-md transition-all">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                <Activity size={64} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-600">
                    <Activity size={22} />
                  </div>
                  <span className="text-neutral-500 font-bold text-xs uppercase tracking-wider">Attendance Rate</span>
                </div>
                <p className="text-4xl font-black text-neutral-900 mb-1">{Number(data?.overallAttendanceRate ?? 0)}%</p>
                <div className="w-full bg-neutral-100 h-2 rounded-full mt-2">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-1000" 
                    style={{ width: `${data?.overallAttendanceRate ?? 0}%` }}
                  />
                </div>
              </div>
            </Card>

            <Card className="relative overflow-hidden group border-none shadow-sm hover:shadow-md transition-all">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                <BookOpen size={64} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-600">
                    <BookOpen size={22} />
                  </div>
                  <span className="text-neutral-500 font-bold text-xs uppercase tracking-wider">Active Centers</span>
                </div>
                <p className="text-4xl font-black text-neutral-900 mb-1">{Number(data?.totalCenters ?? 0)}</p>
                <span className="text-xs text-neutral-400 font-medium italic">Spanning multiple regions</span>
              </div>
            </Card>

            <Card className="relative overflow-hidden group border-none shadow-sm hover:shadow-md transition-all">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                <Target size={64} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-600">
                    <Target size={22} />
                  </div>
                  <span className="text-neutral-500 font-bold text-xs uppercase tracking-wider">Growth Index</span>
                </div>
                <p className="text-4xl font-black text-neutral-900 mb-1">
                   {Number(data?.totalStudents ?? 0) > 0 ? Math.round((Number(data?.newStudentsThisMonth ?? 0) / Number(data?.totalStudents ?? 1)) * 100) : 0}%
                </p>
                <span className="text-xs text-neutral-400 font-medium">Monthly acquisition rate</span>
              </div>
            </Card>
          </div>

          {isAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-none shadow-sm">
                <h3 className="font-bold text-neutral-900 mb-6 flex items-center gap-2">
                  <Activity size={18} className="text-primary" />
                  Center Breakdown
                </h3>
                <ul className="space-y-4">
                  {((data?.centerBreakdown as Array<Record<string, unknown>>) ?? []).map((c) => (
                    <li key={String(c.centerId)} className="group">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-bold text-neutral-700">{String(c.name)}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-tighter">
                            {String(c.studentCount)} Students
                          </span>
                          <button
                            title="Remove Center"
                            className="text-neutral-300 hover:text-danger transition-colors p-1 opacity-0 group-hover:opacity-100"
                            onClick={async () => {
                              if (confirm(`Are you sure you want to delete ${String(c.name)}?`)) {
                                try {
                                  const m = await import('../services/centers.service');
                                  await m.deleteCenter(String(c.centerId));
                                  void fetchDashboardData();
                                } catch (err: any) {
                                  alert(err.response?.data?.message || 'Failed to delete center.');
                                }
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-primary h-full rounded-full transition-all" 
                          style={{ width: `${Number(c.attendanceRate)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-right mt-1 font-bold text-neutral-500">{String(c.attendanceRate)}% Attendance</p>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="border-none shadow-sm">
                <h3 className="font-bold text-neutral-900 mb-6 flex items-center gap-2">
                  <BookOpen size={18} className="text-primary" />
                  Program Distribution
                </h3>
                <div className="space-y-4">
                  {((data?.programBreakdown as Array<Record<string, unknown>>) ?? []).map((p) => (
                    <div key={String(p.programId)} className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-100 hover:border-primary/20 transition-colors">
                      <span className="text-sm font-bold text-neutral-700">{String(p.name)}</span>
                      <span className="px-3 py-1 bg-white rounded-full border border-neutral-200 text-xs font-black text-primary">
                        {String(p.studentCount)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </PageWrapper>
  );
};
